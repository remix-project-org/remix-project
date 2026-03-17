/**
 * WorkspaceProviderProxy
 *
 * A transparent JS Proxy that sits permanently in the `fileProviders.workspace`
 * slot.  Every property access and method call delegates to the *currently
 * active* provider — either the local WorkspaceFileProvider or, when the user
 * enables cloud mode, a CloudWorkspaceFileProvider.
 *
 * Switching modes is a simple internal flag flip:
 *   proxy.setCloudProvider(cloudProvider)   // → all I/O routes to cloud
 *   proxy.clearCloudProvider()              // → all I/O routes back to local
 *
 * The proxy's object identity NEVER changes, so every consumer that holds a
 * reference (fileManager, React effects, dgit, script-runner, …) always
 * talks through the same object.  This eliminates the entire class of race
 * conditions caused by hot-swapping the provider reference.
 *
 * Design notes:
 *  - The EventManager is "pinned" — it's always the local provider's
 *    EventManager, shared with the cloud provider.  Subscribers only
 *    subscribe once and never lose their registrations.
 *  - `instanceof WorkspaceFileProvider` returns true because the Proxy's
 *    [[GetPrototypeOf]] trap defaults to the target (the local provider).
 *  - All control methods (`setCloudProvider`, `clearCloudProvider`, etc.)
 *    are exposed as virtual properties on the proxy.
 */

/** Unique symbol to identify a proxied provider (for debugging / assertions). */
export const WORKSPACE_PROXY_MARKER = Symbol.for('remix:workspaceProviderProxy')

/**
 * Wrap `localProvider` in a transparent Proxy.
 *
 * @param localProvider  The original WorkspaceFileProvider created at boot.
 * @returns  A Proxy that can be used exactly like a WorkspaceFileProvider.
 */
export function createWorkspaceProviderProxy(localProvider: any): any {
  /** The cloud provider, when cloud mode is enabled. `null` = local mode. */
  let _cloudProvider: any = null

  /**
   * The canonical EventManager — pinned to the local provider's instance so
   * that fileManager subscriptions survive mode switches.
   */
  const _pinnedEvent = localProvider.event

  /** Return whichever provider should handle I/O right now. */
  function active(): any {
    return _cloudProvider ?? localProvider
  }

  // ── Control API (exposed as virtual properties on the proxy) ──────────

  /**
   * Activate cloud mode.  All subsequent property reads / method calls on
   * the proxy will delegate to `cloud`.  The pinned EventManager is copied
   * into the cloud provider so `this.event.emit(…)` works correctly.
   */
  function setCloudProvider(cloud: any): void {
    if (cloud) cloud.event = _pinnedEvent
    _cloudProvider = cloud
    console.log('[WorkspaceProxy] cloud provider SET — workspacesPath =', cloud?.workspacesPath)
  }

  /** Deactivate cloud mode.  I/O routes back to the local provider. */
  function clearCloudProvider(): void {
    _cloudProvider = null
    console.log('[WorkspaceProxy] cloud provider CLEARED — workspacesPath =', localProvider.workspacesPath)
  }

  // ── Proxy handler ─────────────────────────────────────────────────────

  const handler: ProxyHandler<any> = {
    get(_target, prop, _receiver) {
      // ── Control properties ──
      switch (prop) {
      case WORKSPACE_PROXY_MARKER: return true
      case 'setCloudProvider': return setCloudProvider
      case 'clearCloudProvider': return clearCloudProvider
      case 'getLocalProvider': return () => localProvider
      case 'getCloudProvider': return () => _cloudProvider
      case 'isCloudActive': return _cloudProvider !== null
      }

      // ── Pinned event manager ──
      if (prop === 'event') return _pinnedEvent

      // ── Delegate to active provider ──
      const a = active()
      const value = a[prop]

      // Bind functions so `this` inside the method refers to the real
      // provider, not the proxy.
      if (typeof value === 'function') {
        return value.bind(a)
      }
      return value
    },

    set(_target, prop, value) {
      // Writes to `event` are silently absorbed — event is pinned.
      if (prop === 'event') return true

      // Everything else goes to the active provider.
      active()[prop] = value
      return true
    },

    // Preserve `proxy instanceof WorkspaceFileProvider` — delegates to
    // the local provider's prototype chain, which includes
    // WorkspaceFileProvider.prototype → FileProvider.prototype.
    getPrototypeOf(_target) {
      return Object.getPrototypeOf(localProvider)
    },

    // `prop in proxy` — check control props first, then active provider.
    has(_target, prop) {
      if (prop === WORKSPACE_PROXY_MARKER || prop === 'event') return true
      if (['setCloudProvider', 'clearCloudProvider', 'getLocalProvider', 'getCloudProvider', 'isCloudActive'].includes(prop as string)) return true
      return prop in active()
    },
  }

  return new Proxy(localProvider, handler)
}
