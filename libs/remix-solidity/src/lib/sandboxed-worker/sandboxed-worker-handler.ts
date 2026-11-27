// Inline worker script — no webpack/ES module imports allowed here.
// Runs inside an opaque-origin sandboxed iframe so importScripts() cannot
// reach the IDE's IndexedDB regardless of what the loaded soljson does.
// The deferred-import callback (missingInputs) works the same as the standard
// ES worker; gatherImports in compiler.ts additionally filters the returned
// paths to .sol/.yul only, so non-source files cannot be exfiltrated.
const WORKER_SCRIPT = `
var missingInputs = [];
var compiler = null;

// Implements the deferred-import callback for both >=0.6.0 (3-arg
// solidity_compile with context pointer) and older 2-arg builds.
// Returns null when the soljson does not expose cwrap.
function setupMethods(Module) {
  if (!Module || typeof Module.cwrap !== 'function') return null;

  var copyFromCStr = Module.UTF8ToString || Module.Pointer_stringify;
  var addFunc      = Module.addFunction  || (Module.Runtime && Module.Runtime.addFunction);
  var removeFunc   = Module.removeFunction || (Module.Runtime && Module.Runtime.removeFunction);
  var allocFn;
  try { allocFn = Module.cwrap('solidity_alloc', 'number', ['number']); }
  catch (e) { allocFn = Module._malloc; }

  function writeToCStr(str, ptr) {
    var len = Module.lengthBytesUTF8(str) + 1;
    var buf = allocFn(len);
    Module.stringToUTF8(str, buf, len);
    if (Module.setValue) Module.setValue(ptr, buf, 'i32');
    else Module.HEAP32[ptr >> 2] = buf;
  }

  var versionFn = Module.cwrap('solidity_version', 'string', []);
  var licenseFn = Module.cwrap('solidity_license', 'string', []);
  var versionStr;
  try { versionStr = versionFn(); } catch (e) { versionStr = '0.0.0'; }

  // >=0.6.0 uses solidity_compile(input, cbPtr, ctxPtr) — 3 args.
  // Older versions use solidity_compile(input, cbPtr) — 2 args.
  var parts = versionStr.split('.');
  var isNew = (parseInt(parts[0]) || 0) > 0 || (parseInt(parts[1]) || 0) >= 6;
  var compileRaw = Module.cwrap('solidity_compile', 'string',
    isNew ? ['string', 'number', 'number'] : ['string', 'number']);

  return {
    version: function() { return versionStr; },
    license: function() { try { return licenseFn(); } catch (e) { return 'No license'; } },
    compile: function(input, readCallback) {
      var importFn = readCallback && typeof readCallback.import === 'function'
        ? readCallback.import : null;
      if (!importFn || !addFunc) {
        return isNew ? compileRaw(input, 0, 0) : compileRaw(input, 0);
      }
      var cb;
      if (isNew) {
        // >=0.6.0: callback(ctx i32, kind i32, data i32, contents i32, error i32)
        cb = addFunc(function(ctx, kind, data, contents, error) {
          var result = copyFromCStr(kind) === 'source'
            ? importFn(copyFromCStr(data))
            : { error: 'Unsupported callback kind' };
          if (typeof result.contents === 'string') writeToCStr(result.contents, contents);
          if (typeof result.error   === 'string') writeToCStr(result.error,    error);
        }, 'viiiii');
      } else {
        // <0.6.0: callback(data i32, contents i32, error i32)
        cb = addFunc(function(data, contents, error) {
          var result = importFn(copyFromCStr(data));
          if (typeof result.contents === 'string') writeToCStr(result.contents, contents);
          if (typeof result.error   === 'string') writeToCStr(result.error,    error);
        }, 'viiii');
      }
      try {
        return isNew ? compileRaw(input, cb, 0) : compileRaw(input, cb);
      } finally {
        if (removeFunc) removeFunc(cb);
      }
    }
  };
}

self.onmessage = function(e) {
  var data = e.data;
  switch (data.cmd) {
    case 'loadVersion': {
      missingInputs = [];
      compiler = null;
      self.importScripts(data.data);
      var loaded = setupMethods(self);
      if (loaded) {
        compiler = loaded;
        self.postMessage({ cmd: 'versionLoaded', data: compiler.version(), license: compiler.license() });
      } else {
        self.postMessage({ cmd: 'error', data: 'Failed to initialise compiler: cwrap not found after importScripts' });
      }
      break;
    }
    case 'compile': {
      missingInputs = [];
      if (data.input && compiler) {
        var missingInputsCallback = function(path) {
          missingInputs.push(path);
          return { error: 'Deferred import' };
        };
        var output;
        try {
          output = compiler.compile(data.input, { import: missingInputsCallback });
        } catch (ex) {
          output = JSON.stringify({ error: { formattedMessage: 'Uncaught exception: ' + ex } });
        }
        self.postMessage({
          cmd: 'compiled',
          job: data.job,
          timestamp: data.timestamp,
          data: output,
          input: data.input,
          missingInputs: missingInputs
        });
      }
      break;
    }
  }
};
`

// The iframe HTML is kept self-contained so it can be used as a Blob URL.
// It creates the Worker, signals readiness, and relays messages.
function buildSandboxHtml(): string {
  const escapedScript = JSON.stringify(WORKER_SCRIPT) // safe JS string literal
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>
var worker = null;
var pending = [];

var blob = new Blob([${escapedScript}], { type: 'application/javascript' });
var workerUrl = URL.createObjectURL(blob);
worker = new Worker(workerUrl);

worker.addEventListener('message', function(we) {
  window.parent.postMessage(we.data, '*');
});
worker.addEventListener('error', function(err) {
  window.parent.postMessage({ cmd: 'error', data: err.message || 'Worker error' }, '*');
});

// Accept forwarded messages from the parent only.
window.addEventListener('message', function(e) {
  if (e.source !== window.parent) return;
  worker.postMessage(e.data);
});

// Let the parent know the worker is ready to receive messages.
window.parent.postMessage({ cmd: 'sandbox-ready' }, '*');
</script>
</body></html>`
}

class SandboxedWorkerProxy {
  private iframe: HTMLIFrameElement
  private blobUrl: string
  private ready = false
  private queue: any[] = []
  private msgListeners: ((e: { data: any }) => void)[] = []
  private errListeners: ((e: any) => void)[] = []
  private windowListener: (e: MessageEvent) => void

  constructor() {
    this.iframe = document.createElement('iframe')
    this.iframe.setAttribute('sandbox', 'allow-scripts')
    this.iframe.style.cssText = 'display:none;width:0;height:0;border:0;position:absolute;'

    this.blobUrl = URL.createObjectURL(new Blob([buildSandboxHtml()], { type: 'text/html' }))
    this.iframe.src = this.blobUrl

    this.windowListener = (e: MessageEvent) => {
      if (e.source !== this.iframe.contentWindow) return
      const data = e.data
      if (!data) return
      if (data.cmd === 'sandbox-ready') {
        this.ready = true
        this.queue.forEach(m => this.iframe.contentWindow!.postMessage(m, '*'))
        this.queue = []
        return
      }
      if (data.cmd === 'error') {
        this.errListeners.forEach(h => h({ data }))
        return
      }
      this.msgListeners.forEach(h => h({ data }))
    }

    window.addEventListener('message', this.windowListener)
    document.body.appendChild(this.iframe)
  }

  postMessage(data: any) {
    if (this.ready) {
      this.iframe.contentWindow!.postMessage(data, '*')
    } else {
      this.queue.push(data)
    }
  }

  addEventListener(type: string, listener: (e: { data: any }) => void) {
    if (type === 'message') this.msgListeners.push(listener)
    else if (type === 'error') this.errListeners.push(listener)
  }

  terminate() {
    window.removeEventListener('message', this.windowListener)
    URL.revokeObjectURL(this.blobUrl)
    this.iframe.parentNode?.removeChild(this.iframe)
  }
}

export class SandboxedWorkerHandler {
  getWorker(): Worker {
    return new SandboxedWorkerProxy() as unknown as Worker
  }
}
