/**
 * Centralized helper for starting a sign-in flow.
 *
 * On desktop (Electron), this calls `desktopAuthHandler.login` so the user is
 * sent to the system browser to authenticate on remix.ethereum.org. The
 * resulting tokens come back via the `remix://` custom protocol and are
 * applied by the auth-plugin's persistent listener.
 *
 * On web, it invokes the provided `openLocalModal` callback so the in-app
 * `LoginModal` is displayed.
 */

const isDesktopApp = (): boolean =>
  typeof window !== 'undefined' && (window as any).electronAPI !== undefined

export async function startSignInFlow(
  plugin: any,
  openLocalModal: () => void,
  matomoAction = 'Sign In'
): Promise<void> {
  if (isDesktopApp() && plugin && typeof plugin.call === 'function') {
    try {
      await plugin.call('desktopAuthHandler', 'login')
      plugin
        .call('matomo', 'trackEvent', 'auth', 'desktopOpenBrowserLogin', matomoAction, undefined)
        .catch(() => {})
    } catch (err) {
      console.error('[startSignInFlow] Failed to open browser login flow:', err)
    }
    return
  }

  openLocalModal()
  if (plugin && typeof plugin.call === 'function') {
    plugin
      .call('matomo', 'trackEvent', 'auth', 'openLoginModal', matomoAction, undefined)
      .catch(() => {})
  }
}

export const isDesktop = isDesktopApp
