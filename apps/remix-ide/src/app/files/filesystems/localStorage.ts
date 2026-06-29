import { fileSystem } from "../fileSystem";

function isLocalStorageFileSystemDebugEnabled(): boolean {
  try {
    return localStorage.getItem('remix-storage-debug') === 'true'
  } catch {
    return false
  }
}

function logLocalStorageFileSystem(...args: any[]): void {
  if (isLocalStorageFileSystemDebugEnabled()) console.log(...args)
}

export class localStorageFS extends fileSystem {

  constructor() {
    super()
    this.name = 'localstorage'
  }
  load = async () => {
    const me = this
    return new Promise((resolve, reject) => {
      try {
        const w = window as any
        w.BrowserFS.install(window)
        w.BrowserFS.configure({
          fs: 'LocalStorage'
        }, async function (e) {
          if (e) {
            logLocalStorageFileSystem('BrowserFS Error: ' + e)
            reject(e)
          } else {
            me.fs = { ...window.require('fs') }
            me.fsCallBack = window.require('fs')
            me.fs.readdir = me.fs.readdirSync
            me.fs.readFile = me.fs.readFileSync
            me.fs.writeFile = me.fs.writeFileSync
            me.fs.stat = me.fs.statSync
            me.fs.unlink = me.fs.unlinkSync
            me.fs.rmdir = me.fs.rmdirSync
            me.fs.mkdir = me.fs.mkdirSync
            me.fs.rename = me.fs.renameSync
            me.fs.exists = me.fs.existsSync
            me.loaded = true
            resolve(true)
          }
        })
      } catch (e) {
        logLocalStorageFileSystem('BrowserFS is not ready!')
        reject(e)
      }
    })
  }

  test = async () => {
    return new Promise((resolve, reject) => {
      const test = 'test';
      try {
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

}