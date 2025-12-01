
import { Message } from '@remixproject/plugin-utils'
import { contextBridge, ipcRenderer } from 'electron'

console.log('preload.ts', new Date().toLocaleTimeString())

/* preload script needs statically defined API for each plugin */

const exposedPLugins = ['fs', 'git', 'xterm', 'isogit', 'electronconfig', 'electronTemplates', 'ripgrep', 'compilerloader', 'appUpdater', 'slither', 'foundry', 'hardhat', 'circom', 'desktopHost', 'githubAuthHandler']

let webContentsId: number | undefined

ipcRenderer.invoke('getWebContentsID').then((id: number) => {
  webContentsId = id
})

contextBridge.exposeInMainWorld('electronAPI', {
  isPackaged: () => ipcRenderer.invoke('config:isPackaged'),
  isE2E: () => ipcRenderer.invoke('config:isE2E'),
  trackEvent: (args: any[]) => ipcRenderer.invoke('matomo:trackEvent', args),
  openFolder: (path: string) => ipcRenderer.invoke('fs:openFolder', webContentsId, path),
  openFolderInSameWindow: (path: string) => ipcRenderer.invoke('fs:openFolderInSameWindow', webContentsId, path),
  activatePlugin: (name: string) => {
    return ipcRenderer.invoke('manager:activatePlugin', name)
  },

  plugins: exposedPLugins.map(name => {
    return {
      name,
      on: (cb:any) => {
        ipcRenderer.on(`${name}:send`, cb)
      },
      send: (message: Partial<Message>) => {
        //if(name === 'isogit') console.log(name, message)
        //if(name === 'isogit') ipcRenderer.invoke(`logger`, name, message)
        ipcRenderer.send(`${name}:on:${webContentsId}`, message)
      }
    }
  })

})