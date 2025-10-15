// Global type declarations for preload exposed electronAPI

export {}; // ensure this file is treated as a module

declare global {
  interface Window {
    electronAPI: {
      isPackaged: () => Promise<boolean>
      isE2E: () => Promise<boolean>
  canTrackMatomo: () => Promise<boolean>
  // Desktop tracking helpers
      trackDesktopEvent: (category: string, action: string, name?: string, value?: string | number) => Promise<any>
      setTrackingMode: (mode: 'cookie' | 'anon') => Promise<boolean>
      openFolder: (path: string) => Promise<any>
      openFolderInSameWindow: (path: string) => Promise<any>
      activatePlugin: (name: string) => Promise<any>
      plugins: Array<{
        name: string
        on: (cb: (...args: any[]) => void) => void
        send: (message: Partial<any>) => void
      }>
    }
  }
}
