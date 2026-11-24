// Inline worker script — no webpack/ES module imports allowed here.
// Runs inside an opaque-origin sandboxed iframe so importScripts() cannot
// reach the IDE's IndexedDB regardless of what the loaded soljson does.
const WORKER_SCRIPT = `
var missingInputs = [];
var compileJSON = null;

// Minimal setupMethods for modern WASM-based soljson files.
// After importScripts(url) the soljson exposes cwrap on the global (self).
function setupMethods(Module) {
  if (!Module || typeof Module.cwrap !== 'function') return null;
  var version  = Module.cwrap('solidity_version', 'string', []);
  var license  = Module.cwrap('solidity_license', 'string', []);
  var compile  = Module.cwrap('solidity_compile', 'string', ['string', 'number']);
  return {
    version:  function() { return version(); },
    license:  function() { try { return license(); } catch(e) { return 'No license'; } },
    compile:  function(input) { return compile(input, 0); }
  };
}

self.onmessage = function(e) {
  var data = e.data;
  switch (data.cmd) {
    case 'loadVersion': {
      missingInputs = [];
      self.importScripts(data.data);
      // After importScripts, the Emscripten module registers cwrap etc. on self.
      var compiler = setupMethods(self);
      if (compiler) {
        compileJSON = function(input) {
          try { return compiler.compile(input); }
          catch (ex) { return JSON.stringify({ error: { formattedMessage: 'Uncaught exception: ' + ex } }); }
        };
        self.postMessage({ cmd: 'versionLoaded', data: compiler.version(), license: compiler.license() });
      } else {
        self.postMessage({ cmd: 'error', data: 'Failed to initialise compiler: cwrap not found after importScripts' });
      }
      break;
    }
    case 'compile': {
      missingInputs = [];
      if (data.input && compileJSON) {
        self.postMessage({
          cmd: 'compiled',
          job: data.job,
          timestamp: data.timestamp,
          data: compileJSON(data.input),
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
<\/script>
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
