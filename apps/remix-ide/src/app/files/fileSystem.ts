function isFileSystemDebugEnabled(): boolean {
  try {
    return localStorage.getItem('remix-storage-debug') === 'true'
  } catch {
    return false
  }
}

function logFileSystem(...args: any[]): void {
  if (isFileSystemDebugEnabled()) console.log(...args)
}

export class fileSystem {
  name: string
  enabled: boolean
  available: boolean
  fs: any
  fsCallBack: any;
  hasWorkSpaces: boolean
  loaded: boolean
  load: () => Promise<unknown>
  test: () => Promise<unknown>

  constructor() {
    this.available = false
    this.enabled = false
    this.hasWorkSpaces = false
    this.loaded = false
  }

  checkWorkspaces = async () => {
    try {
      await this.fs.stat('.workspaces')
      this.hasWorkSpaces = true
    } catch (e) {

    }
  }

  set = async () => {
    const w = (window as any)
    if (!this.loaded) return false
    w.remixFileSystem = this.fs
    w.remixFileSystem.name = this.name
    w.remixFileSystemCallback = this.fsCallBack
    return true
  }
}

export class fileSystems {
  fileSystems: Record<string, fileSystem>
  constructor() {
    this.fileSystems = {}
  }

  addFileSystem = async (fs: fileSystem): Promise<boolean> => {
    try {
      this.fileSystems[fs.name] = fs
      await fs.test() && await fs.load()
      logFileSystem(fs.name + ' is loaded...')
      return true
    } catch (e) {
      logFileSystem(fs.name + ' not available...')
      return false
    }
  }
  /**
     * sets filesystem using list as fallback
     * @param {string[]} names
     * @returns {Promise}
     */
  setFileSystem = async (filesystems?: fileSystem[]): Promise<fileSystem> => {
    for (const fs of filesystems) {
      if (fs && this.fileSystems[fs.name]) {
        const result = await this.fileSystems[fs.name].set()
        if (result) return this.fileSystems[fs.name]
      }
    }
    return null
  }

}

