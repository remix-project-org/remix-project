import { Plugin } from '@remixproject/engine'
import { Registry } from '@remix-project/remix-lib'

/**
 * CloudStatePlugin — the single source of truth for cloud workspace mode.
 *
 * Cloud mode determines whether the IDE uses:
 *   - `.cloud-workspaces/{uuid}/` (cloud mode ON)  — UUID-based directory names
 *   - `.workspaces/{name}/`       (cloud mode OFF) — display-name-based directories
 *
 * This plugin centralizes ALL cloud mode lifecycle management:
 *   - Owns the `active` boolean via the global Registry singleton
 *   - Persists state in localStorage
 *   - Validates prerequisites (.cloud-workspaces dir + registry exist)
 *   - Refreshes the workspace dropdown after toggling
 *   - Reacts to auth events (login → enable, logout → disable)
 *   - Reacts to migration completion → enable
 *   - Emits `cloudStateChanged` for the entire app to consume
 *
 * WorkspaceFileProvider reads `Registry.getInstance().get('cloudState').api.active`
 * reactively — no setter calls needed. The provider's `workspacesPath` getter
 * and `isCloudMode()` derive their values from this singleton.
 */

const CLOUD_WORKSPACES_PATH = '.cloud-workspaces'
const REGISTRY_FILE = '.cloud-workspaces/.registry.json'
const LS_KEY = 'remix-cloud-mode'

const profile = {
  name: 'cloudState',
  displayName: 'Cloud State',
  methods: ['isActive', 'enable', 'disable', 'toggle'],
  events: ['cloudStateChanged'],
  description: 'Single source of truth for cloud workspace mode',
  kind: 'none'
}

export class CloudStatePlugin extends Plugin {
  /**
   * The canonical cloud mode state object stored in the Registry.
   * WorkspaceFileProvider reads `registryState.active` reactively.
   */
  private registryState: { active: boolean }

  constructor() {
    super(profile)
    // Register the shared state object in the global Registry singleton.
    // WorkspaceFileProvider (and anything else) can read it at any time.
    this.registryState = { active: false }
    Registry.getInstance().put({ api: this.registryState, name: 'cloudState' })
  }

  // ==================== Public API ====================

  /**
   * Is cloud mode currently active?
   */
  isActive(): boolean {
    return this.registryState.active
  }

  /**
   * Enable cloud mode.
   * Validates that `.cloud-workspaces/` and `.registry.json` exist,
   * then switches the workspace file provider and refreshes the dropdown.
   */
  async enable(): Promise<void> {
    if (this.registryState.active) {
      console.log('[CloudState] enable() called but already active — no-op')
      return
    }

    console.log('[CloudState] enable() — validating prerequisites...')

    // Validate prerequisites
    const fs = (window as any).remixFileSystem
    const hasCloudDir = await fs.exists('/' + CLOUD_WORKSPACES_PATH)
    if (!hasCloudDir) {
      console.warn('[CloudState] enable() REJECTED — cloud dir missing:', '/' + CLOUD_WORKSPACES_PATH)
      throw new Error('No cloud workspaces found. Run migration first.')
    }
    const hasRegistry = await fs.exists('/' + REGISTRY_FILE)
    if (!hasRegistry) {
      console.warn('[CloudState] enable() REJECTED — registry missing:', '/' + REGISTRY_FILE)
      throw new Error('Workspace registry not found. Run migration first.')
    }

    console.log('[CloudState] ☁️ Prerequisites OK — enabling cloud mode')
    await this._setActive(true)
  }

  /**
   * Disable cloud mode.
   * Switches back to legacy `.workspaces/` and refreshes the dropdown.
   */
  async disable(): Promise<void> {
    if (!this.registryState.active) {
      console.log('[CloudState] disable() called but already inactive — no-op')
      return
    }

    console.log('[CloudState] ☁️ Disabling cloud mode')
    await this._setActive(false)
  }

  /**
   * Toggle cloud mode on or off.
   */
  async toggle(enabled: boolean): Promise<void> {
    console.log('[CloudState] toggle() called with enabled =', enabled, '| current active =', this.registryState.active)
    if (enabled) {
      await this.enable()
    } else {
      await this.disable()
    }
  }

  // ==================== Lifecycle ====================

  async onActivation(): Promise<void> {
    console.log('[CloudState] onActivation — registering event listeners')

    // Listen for auth events
    this.on('auth', 'authStateChanged', async (state: { isAuthenticated: boolean }) => {
      console.log('[CloudState] auth.authStateChanged received — isAuthenticated:', state.isAuthenticated)
      if (state.isAuthenticated) {
        // Login — auto-enable if cloud workspaces exist
        await this._tryAutoEnable()
      } else {
        // Logout — always disable
        console.log('[CloudState] User logged out — disabling cloud mode')
        await this.disable()
      }
    })

    // Token refresh confirms active session — ensure cloud is on if it should be
    this.on('auth', 'tokenRefreshed', async () => {
      console.log('[CloudState] auth.tokenRefreshed received — checking auto-enable')
      await this._tryAutoEnable()
    })

    // Migration completed — enable cloud mode
    this.on('s3Storage', 'migrationComplete', async (result: { success: boolean; migratedCount?: number }) => {
      console.log('[CloudState] s3Storage.migrationComplete received — success:', result.success, 'migratedCount:', result.migratedCount)
      if (result.success || (result.migratedCount && result.migratedCount > 0)) {
        try {
          await this.enable()
        } catch (e) {
          console.warn('[CloudState] Failed to enable after migration:', e)
        }
      } else {
        console.log('[CloudState] Migration result did not qualify for auto-enable')
      }
    })

    // Restore from localStorage on page load if user is authenticated
    console.log('[CloudState] onActivation — restoring state from localStorage')
    await this._restoreOnLoad()
    console.log('[CloudState] onActivation complete — active:', this.registryState.active)
  }

  async onDeactivation(): Promise<void> {
    this.off('auth', 'authStateChanged')
    this.off('auth', 'tokenRefreshed')
    this.off('s3Storage', 'migrationComplete')
  }

  // ==================== Internal ====================

  /**
   * Core state setter. Every state change flows through here.
   * - Updates the Registry singleton (WorkspaceFileProvider reads this reactively)
   * - Persists to localStorage
   * - Refreshes the workspace dropdown AND switches to the first workspace
   * - Emits the event
   */
  private async _setActive(active: boolean): Promise<void> {
    const prev = this.registryState.active
    this.registryState.active = active
    console.log('[CloudState] _setActive:', prev, '→', active)

    // Persist
    if (active) {
      localStorage.setItem(LS_KEY, 'true')
    } else {
      localStorage.removeItem(LS_KEY)
    }
    console.log('[CloudState] localStorage persisted:', active ? 'true' : '(removed)')

    // Emit event for all consumers (UI, plugins, etc.)
    console.log('[CloudState] Emitting cloudStateChanged { active:', active, '}')
    this.emit('cloudStateChanged', { active })

    // Refresh the workspace dropdown and switch to the first workspace in the new mode
    await this._refreshAndSwitchWorkspace()
  }

  /**
   * Refresh the workspace dropdown via the filePanel plugin,
   * then switch to the first available workspace in the current mode.
   * This ensures the file explorer shows files from the correct path
   * after a cloud mode toggle.
   */
  private async _refreshAndSwitchWorkspace(): Promise<void> {
    try {
      // Tell the reducer to reload the workspace list
      await this.call('filePanel', 'refreshWorkspaceList')
    } catch (e) {
      console.warn('[CloudState] Failed to refresh workspace dropdown:', e)
    }

    // Resolve the first workspace name in the current mode and switch to it
    try {
      const firstName = await this._getFirstWorkspaceName()
      if (firstName) {
        console.log('[CloudState] Switching to first workspace:', firstName)
        await this.call('filePanel', 'switchToWorkspace', { name: firstName })
      } else {
        console.log('[CloudState] No workspaces found in new mode — nothing to switch to')
      }
    } catch (e) {
      console.warn('[CloudState] Failed to switch workspace after mode change:', e)
    }
  }

  /**
   * Determine the first workspace name visible under the current mode.
   * In cloud mode, reads the registry for display names.
   * In legacy mode, reads the `.workspaces/` directory directly.
   */
  private async _getFirstWorkspaceName(): Promise<string | null> {
    const fs = (window as any).remixFileSystem
    const active = this.registryState.active
    const basePath = active ? '/' + CLOUD_WORKSPACES_PATH : '/.workspaces'

    try {
      const exists = await fs.exists(basePath)
      if (!exists) return null

      const entries: string[] = await fs.readdir(basePath)
      const dirs = []
      for (const entry of entries) {
        if (entry.startsWith('.')) continue // skip hidden like .registry.json
        const stat = await fs.stat(basePath + '/' + entry)
        if (stat.isDirectory()) dirs.push(entry)
      }

      if (dirs.length === 0) return null

      if (active) {
        // In cloud mode, translate UUID → display name via registry
        try {
          const regRaw = await fs.readFile('/' + REGISTRY_FILE, 'utf8')
          const registry = JSON.parse(regRaw)
          const wsEntries = registry.workspaces || {}
          const first = dirs[0]
          if (wsEntries[first]?.displayName) {
            return wsEntries[first].displayName
          }
        } catch (e) {
          // registry read failed, fall through to dir name
        }
      }

      // Legacy mode or fallback: directory name is the workspace name
      return dirs[0]
    } catch (e) {
      console.warn('[CloudState] _getFirstWorkspaceName error:', e)
      return null
    }
  }

  /**
   * Try to auto-enable cloud mode.
   * Checks if `.cloud-workspaces/` and the registry exist. If so, enables.
   * Silent on failure — used for login and page load.
   */
  private async _tryAutoEnable(): Promise<void> {
    if (this.registryState.active) {
      console.log('[CloudState] _tryAutoEnable — already active, skipping')
      return
    }

    console.log('[CloudState] _tryAutoEnable — checking for cloud workspaces infrastructure...')
    try {
      const fs = (window as any).remixFileSystem
      const hasCloudDir = await fs.exists('/' + CLOUD_WORKSPACES_PATH)
      const hasRegistry = await fs.exists('/' + REGISTRY_FILE)
      console.log('[CloudState] _tryAutoEnable — hasCloudDir:', hasCloudDir, '| hasRegistry:', hasRegistry)
      if (hasCloudDir && hasRegistry) {
        console.log('[CloudState] _tryAutoEnable — prerequisites met, enabling...')
        await this.enable()
      } else {
        console.log('[CloudState] _tryAutoEnable — prerequisites NOT met, staying inactive')
      }
    } catch (e) {
      console.warn('[CloudState] Auto-enable check failed:', e)
    }
  }

  /**
   * On page load, restore cloud mode from localStorage if the user is authenticated.
   */
  private async _restoreOnLoad(): Promise<void> {
    const wasActive = localStorage.getItem(LS_KEY) === 'true'
    console.log('[CloudState] _restoreOnLoad — localStorage says wasActive:', wasActive)
    if (!wasActive) {
      console.log('[CloudState] _restoreOnLoad — no previous cloud mode, nothing to restore')
      return
    }

    try {
      const isAuth = await this.call('auth', 'isAuthenticated')
      console.log('[CloudState] _restoreOnLoad — isAuthenticated:', isAuth)
      if (isAuth) {
        await this._tryAutoEnable()
      } else {
        // Not authenticated — clean up stale localStorage
        console.log('[CloudState] _restoreOnLoad — not authenticated, clearing stale localStorage')
        localStorage.removeItem(LS_KEY)
      }
    } catch (e) {
      console.warn('[CloudState] Restore on load failed:', e)
    }
  }
}
