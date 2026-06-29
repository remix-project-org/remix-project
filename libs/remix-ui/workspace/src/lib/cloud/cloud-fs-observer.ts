/**
 * Cloud FS Observer
 *
 * Detects **all** write operations to cloud workspace paths (/.cloud-workspaces/)
 * by patching the LightningFS PromisifiedFS layer.
 *
 * Why this exists:
 *   Some tools (isomorphic-git, etc.) write directly to the IndexedDB-backed
 *   filesystem via `window.remixFileSystemCallback`, completely bypassing the
 *   workspace file provider.  When that happens:
 *     - The file explorer never updates (no provider events fire)
 *     - The sync engine doesn't know about new/changed files
 *
 * How it works:
 *   LightningFS is wired up as:
 *     FS instance (callback API) → delegates to → PromisifiedFS (this.promises)
 *     extended wrapper (remixFileSystem) → delegates to → PromisifiedFS (this.base)
 *
 *   ALL write paths converge on a single PromisifiedFS object.
 *   We patch its write methods (writeFile, mkdir, unlink, rmdir, rename) to
 *   emit events AFTER the operation completes.
 *
 * Consumers can subscribe with `onCloudFSWrite()` to:
 *   - Debounce-trigger a file explorer refresh (`provider.event.emit('refresh')`)
 *   - Feed changes into the sync engine for S3 push
 */

const CLOUD_PREFIX = '/.cloud-workspaces/'

// ── Types ──────────────────────────────────────────────────

export type FSWriteOperation = {
  type: 'writeFile' | 'mkdir' | 'unlink' | 'rmdir' | 'rename'
  /** Absolute path in the local FS (e.g. /.cloud-workspaces/<uuid>/contracts/Token.sol) */
  path: string
  /** For rename operations, the new path */
  newPath?: string
}

type FSWriteListener = (op: FSWriteOperation) => void

// ── State ──────────────────────────────────────────────────

let _active = false
let _listeners: FSWriteListener[] = []
let _debug = false

/** Original (unpatched) method references, keyed by method name */
const _originals: Record<string, (...args: unknown[]) => unknown> = {}

/** The PromisifiedFS object we patched (for cleanup) */
let _patchedPromises: any = null

// ── Public API ─────────────────────────────────────────────

/**
 * Subscribe to FS write events on cloud workspace paths.
 * Returns an unsubscribe function.
 */
export function onCloudFSWrite(listener: FSWriteListener): () => void {
  _listeners.push(listener)
  return () => {
    _listeners = _listeners.filter(l => l !== listener)
  }
}

/**
 * Enable the FS observer.  Patches `window.remixFileSystemCallback.promises`
 * to intercept write operations.
 *
 * Safe to call multiple times — only patches once.
 */
export function enableCloudFSObserver(): void {
  if (_debug) console.debug('[CloudFSObserver] Enabling... is active?', _active)
  if (_active) return

  const fsCallback = (window as any).remixFileSystemCallback
  if (!fsCallback || !fsCallback.promises) {
    if (_debug) console.warn('[CloudFSObserver] No remixFileSystemCallback.promises — cannot enable')
    return
  }

  const promises = fsCallback.promises
  _patchedPromises = promises

  // ── Patch single-path write methods ──────────────────────
  const singlePathMethods: Array<FSWriteOperation['type']> = ['writeFile', 'mkdir', 'unlink', 'rmdir']

  for (const method of singlePathMethods) {
    const original = promises[method]
    if (!original) continue
    _originals[method] = original.bind(promises)

    promises[method] = async function (...args: any[]) {
      if (_debug) console.debug(`[CloudFSObserver] Intercepted ${method} with args:`, args)
      const result = await _originals[method](...args)
      const filepath: string = args[0]
      notify({ type: method, path: filepath })
      return result
    }
  }

  // ── Patch rename (two paths) ─────────────────────────────
  if (promises.rename) {
    _originals['rename'] = promises.rename.bind(promises)
    promises.rename = async function (oldPath: string, newPath: string, ...rest: any[]) {
      if (_debug) console.debug(`[CloudFSObserver] Intercepted rename with args:`, [oldPath, newPath, ...rest])
      const result = await _originals['rename'](oldPath, newPath, ...rest)
      // Emit for both old (delete-like) and new (add-like) paths
      notify({ type: 'rename', path: oldPath, newPath })
      return result
    }
  }

  _active = true
}

/**
 * Disable the observer and restore original FS methods.
 */
export function disableCloudFSObserver(): void {
  if (!_active || !_patchedPromises) return

  for (const [method, original] of Object.entries(_originals)) {
    if (_patchedPromises[method]) {
      _patchedPromises[method] = original
    }
  }

  _active = false
  _patchedPromises = null
  Object.keys(_originals).forEach(k => delete _originals[k])
}

/**
 * Remove all listeners (but keep patches active).
 * Useful when switching workspaces without fully disabling.
 */
export function clearCloudFSListeners(): void {
  _listeners = []
}

export function isCloudFSObserverActive(): boolean {
  return _active
}

/**
 * Enable or disable debug logging (console.debug / console.warn).
 * Disabled by default.
 */
export function setCloudFSObserverDebug(enabled: boolean): void {
  _debug = enabled
}

// ── Helpers ────────────────────────────────────────────────

/** Extract the workspace UUID from an absolute cloud path */
export function extractCloudWorkspaceUuid(absolutePath: string): string | null {
  if (!absolutePath.startsWith(CLOUD_PREFIX)) return null
  const rest = absolutePath.slice(CLOUD_PREFIX.length)
  const slashIdx = rest.indexOf('/')
  return slashIdx === -1 ? rest : rest.slice(0, slashIdx)
}

/** Extract the relative file path within the workspace */
export function extractRelativePath(absolutePath: string): string | null {
  if (!absolutePath.startsWith(CLOUD_PREFIX)) return null
  const rest = absolutePath.slice(CLOUD_PREFIX.length)
  const slashIdx = rest.indexOf('/')
  if (slashIdx === -1) return '' // workspace root
  return rest.slice(slashIdx + 1)
}

function notify(op: FSWriteOperation): void {
  // Only notify for paths inside cloud workspaces
  if (!op.path.startsWith(CLOUD_PREFIX)) return
  // Also check newPath for rename
  if (op.newPath && !op.newPath.startsWith(CLOUD_PREFIX)) return

  for (const listener of _listeners) {
    try {
      listener(op)
    } catch (e) {
      console.error('[CloudFSObserver] Listener error:', e)
    }
  }
}
