import { hashMessage } from "ethers"
import JSZip from "jszip"
import { fileSystem } from "../fileSystem"
import { trackMatomoEvent } from '@remix-api'

import type { MatomoEvent } from '@remix-api'

// Helper function to track events using MatomoManager instance
function track(event: MatomoEvent) {
  try {
    if (typeof window !== 'undefined' && window._matomoManagerInstance) {
      window._matomoManagerInstance.trackEvent(event)
    }
  } catch (error) {
    // Silent fail for tracking
  }
}
export class fileSystemUtility {
  migrate = async (fsFrom: fileSystem, fsTo: fileSystem) => {
    try {
      await fsFrom.checkWorkspaces()
      await fsTo.checkWorkspaces()

      if (fsTo.hasWorkSpaces) {
        console.log(`${fsTo.name} already has files`)
        return true
      }

      if (!fsFrom.hasWorkSpaces) {
        console.log('no files to migrate')
        return true
      }

      const fromFiles = await this.copyFolderToJson('/', null, null, fsFrom.fs)
      await this.populateWorkspace(fromFiles, fsTo.fs)
      const toFiles = await this.copyFolderToJson('/', null, null, fsTo.fs)

      if (hashMessage(JSON.stringify(toFiles)) === hashMessage(JSON.stringify(fromFiles))) {
        console.log('file migration successful')
        return true
      } else {
        track({ category: 'Migrate', action: 'error', name: 'hash mismatch', isClick: false })
        console.log('file migration failed falling back to ' + fsFrom.name)
        fsTo.loaded = false
        return false
      }
    } catch (err) {
      console.log(err)
      track({ category: 'Migrate', action: 'error', name: err && err.message, isClick: false })
      console.log('file migration failed falling back to ' + fsFrom.name)
      fsTo.loaded = false
      return false
    }
  }

  downloadBackup = async (fs: fileSystem) => {
    try {
      const zip = new JSZip()
      zip.file("readme.txt", "This is a Remix backup file.\nThis zip should be used by the restore backup tool in Remix.\nThe .workspaces directory contains your workspaces.")
      await fs.checkWorkspaces()
      await this.copyFolderToJson('/', null, null, fs.fs, ({ path, content }) => {
        zip.file(path, content)
      })
      const blob = await zip.generateAsync({ type: 'blob' })
      const today = new Date()
      const date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate()
      const time = today.getHours() + 'h' + today.getMinutes() + 'min'
      this.saveAs(blob, `remix-backup-at-${time}-${date}.zip`)
      track({ category: 'Backup', action: 'download', name: 'preload', isClick: true })
    } catch (err) {
      track({ category: 'Backup', action: 'error', name: err && err.message, isClick: false })
      console.log(err)
    }
  }

  populateWorkspace = async (json, fs) => {
    for (const item in json) {
      const isFolder = json[item].content === undefined
      if (isFolder) {
        await this.createDir(item, fs)
        await this.populateWorkspace(json[item].children, fs)
      } else {
        await fs.writeFile(item, json[item].content, 'utf8')
      }
    }
  }

  /**
       * copy the folder recursively
       * @param {string} path is the folder to be copied over
       * @param {Function} visitFile is a function called for each visited files
       * @param {Function} visitFolder is a function called for each visited folders
       */
  copyFolderToJson = async (path, visitFile, visitFolder, fs, cb = null) => {
    visitFile = visitFile || (() => { })
    visitFolder = visitFolder || (() => { })
    return await this._copyFolderToJsonInternal(path, visitFile, visitFolder, fs, cb)
  }

  /**
     * copy the folder recursively (internal use)
     * @param {string} path is the folder to be copied over
     * @param {Function} visitFile is a function called for each visited files
     * @param {Function} visitFolder is a function called for each visited folders
     */
  async _copyFolderToJsonInternal(path, visitFile, visitFolder, fs, cb) {
    visitFile = visitFile || function () { /* do nothing. */ }
    visitFolder = visitFolder || function () { /* do nothing. */ }

    const json = {}
    // path = this.removePrefix(path)
    if (await fs.exists(path)) {
      const items = await fs.readdir(path)
      visitFolder({ path })
      if (items.length !== 0) {
        for (const item of items) {
          const file: any = {}
          const curPath = `${path}${path.endsWith('/') ? '' : '/'}${item}`
          if ((await fs.stat(curPath)).isDirectory()) {
            file.children = await this._copyFolderToJsonInternal(curPath, visitFile, visitFolder, fs, cb)
          } else {
            file.content = await fs.readFile(curPath, 'utf8')
            if (cb) cb({ path: curPath, content: file.content })
            visitFile({ path: curPath, content: file.content })

          }
          json[curPath] = file
        }
      }
    }
    return json
  }

  createDir = async (path, fs) => {
    const paths = path.split('/')
    if (paths.length && paths[0] === '') paths.shift()
    let currentCheck = ''
    for (const value of paths) {
      currentCheck = currentCheck + (currentCheck ? '/' : '') + value
      if (!await fs.exists(currentCheck)) {
        await fs.mkdir(currentCheck)
      }
    }
  }

  saveAs = (blob, name) => {
    const node = document.createElement('a')
    node.download = name
    node.rel = 'noopener'
    node.href = URL.createObjectURL(blob)
    setTimeout(function () { URL.revokeObjectURL(node.href) }, 4E4) // 40s
    setTimeout(function () {
      try {
        node.dispatchEvent(new MouseEvent('click'))
      } catch (e) {
        const evt = document.createEvent('MouseEvents')
        evt.initMouseEvent('click', true, true, window, 0, 0, 0, 80,
          20, false, false, false, false, 0, null)
        node.dispatchEvent(evt)
      }
    }, 0) // 40s
  }
}

/* eslint-disable no-template-curly-in-string */
export const migrationTestData = {
  '.workspaces': {
    children: {
      '.workspaces/default_workspace': {
        children: {
          '.workspaces/default_workspace/README.txt': {
            content: 'TEST README'
          }
        }
      },
      '.workspaces/emptyspace': {

      },
      '.workspaces/workspace_test': {
        children: {
          '.workspaces/workspace_test/TEST_README.txt': {
            content: 'TEST README'
          },
          '.workspaces/workspace_test/test_contracts': {
            children: {
              '.workspaces/workspace_test/test_contracts/1_Storage.sol': {
                content: 'testing'
              },
              '.workspaces/workspace_test/artifacts': {
                children: {
                  '.workspaces/workspace_test/artifacts/Storage_metadata.json': {
                    content: '{ "test": "data" }'
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}