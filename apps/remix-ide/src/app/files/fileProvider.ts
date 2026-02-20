'use strict'

import { CompilerImports } from '@remix-project/core-plugin'
import EventManager from 'events'
import { Storage } from '@remix-project/remix-lib'
import pathModule from 'path'

export default class FileProvider {
  event: any
  type: any
  providerExternalsStorage: any
  externalFolders: string[]
  reverseKey: string
  constructor (name) {
    this.event = new EventManager()
    this.type = name
    this.providerExternalsStorage = new Storage('providerExternals:')
    this.externalFolders = [this.type + '/swarm', this.type + '/ipfs', this.type + '/github', this.type + '/gists', this.type + '/https']
    this.reverseKey = this.type + '-reverse-'
  }

  addNormalizedName (path, url) {
    if (this.type) path = this.type + '/' + path
    this.providerExternalsStorage.set(path, url)
    this.providerExternalsStorage.set(this.reverseKey + url, path)
  }

  removeNormalizedName (path) {
    const value = this.providerExternalsStorage.get(path)
    this.providerExternalsStorage.remove(path)
    this.providerExternalsStorage.remove(this.reverseKey + value)
  }

  normalizedNameExists (path) {
    return this.providerExternalsStorage.exists(path)
  }

  getNormalizedName (path) {
    return this.providerExternalsStorage.get(path)
  }

  getPathFromUrl (url) {
    return this.providerExternalsStorage.get(this.reverseKey + url)
  }

  getUrlFromPath (path) {
    if (!path.startsWith(this.type)) path = this.type + '/' + path
    return this.providerExternalsStorage.get(path)
  }

  isExternalFolder (path) {
    return this.externalFolders.includes(path)
  }

  async discardChanges (path, toastCb, modalCb) {
    this.remove(path)
    const compilerImport = new CompilerImports()
    this.providerExternalsStorage.keys().map(value => {
      if (value.indexOf(path) === 0) {
        compilerImport.import(
          this.getNormalizedName(value),
          true,
          (loadingMsg) => { toastCb(loadingMsg) },
          async (error, content, cleanUrl, type, url) => {
            if (error) {
              modalCb(error)
            } else {
              await this.addExternal(type + '/' + cleanUrl, content, url)
            }
          }
        )
      }
    })
  }

  async exists (path) {
    // todo check the type (directory/file) as well #2386
    // currently it is not possible to have a file and folder with same path
    const ret = await this._exists(path)

    return ret
  }

  async _exists (path) {
    path = this.getPathFromUrl(path) || path // ensure we actually use the normalized path from here
    const unprefixedpath = this.removePrefix(path)
    return path === this.type ? true : await (window as any).remixFileSystem.exists(unprefixedpath)
  }

  init (cb) {
    cb()
  }

  async get (path, cb, options = { encoding: 'utf8' }) {
    cb = cb || function () { /* do nothing. */ }
    path = this.getPathFromUrl(path) || path // ensure we actually use the normalized path from here
    console.log('Getting content of ' + path)
    const unprefixedpath = this.removePrefix(path)
    console.log('Unprefixed path: ' + unprefixedpath)
    try {
      const content = await (window as any).remixFileSystem.readFile(unprefixedpath, options)
      if (cb) cb(null, content)
      return content
    } catch (err) {
      if (cb) cb(err, null)
      throw new Error(err)
    }
  }

  async set (path, content, cb, options = { encoding: 'utf8' }) {
    cb = cb || function () { /* do nothing. */ }
    const unprefixedpath = this.removePrefix(path)
    const exists = await (window as any).remixFileSystem.exists(unprefixedpath)
    if (exists && await (window as any).remixFileSystem.readFile(unprefixedpath, options) === content) {
      if (cb) cb()
      return null
    }
    await this.createDir(path.substr(0, path.lastIndexOf('/')), null)
    try {
      await (window as any).remixFileSystem.writeFile(unprefixedpath, content, options)
    } catch (e) {
      if (cb) cb(e)
      return false
    }
    if (!exists) {
      this.event.emit('fileAdded', this._normalizePath(unprefixedpath), false)
    } else {
      this.event.emit('fileChanged', this._normalizePath(unprefixedpath))
    }
    if (cb) cb()
    return true
  }

  async createDir (path, cb) {
    const unprefixedpath = this.removePrefix(path)

    await this.forceCreateDir(unprefixedpath)
    if (cb) cb()
  }

  async forceCreateDir (path) {
    const paths = path.split('/')
    if (paths.length && paths[0] === '') paths.shift()
    let currentCheck = ''
    for (const value of paths) {
      currentCheck = currentCheck + '/' + value
      if (!await (window as any).remixFileSystem.exists(currentCheck)) {
        try {
          await (window as any).remixFileSystem.mkdir(currentCheck)
          this.event.emit('folderAdded', this._normalizePath(currentCheck))
        } catch (error) {
          console.log(error)
        }
      }
    }
  }

  // this will not add a folder as readonly but keep the original url to be able to restore it later
  async addExternal (path, content, url) {
    if (url) this.addNormalizedName(path, url)
    return await this.set(path, content, null)
  }

  isReadOnly (path) {
    return false
  }

  async isDirectory (path) {
    const unprefixedpath = this.removePrefix(path)
    const isDirectory = path === this.type ? true : (await (window as any).remixFileSystem.stat(unprefixedpath)).isDirectory()
    return isDirectory
  }

  async isFile (path) {
    path = this.getPathFromUrl(path) || path // ensure we actually use the normalized path from here
    path = this.removePrefix(path)
    return (await (window as any).remixFileSystem.stat(path)).isFile()
  }

  /**
   * Removes the folder recursively
   * @param {*} path is the folder to be removed
   */
  async remove (path: string) {
    path = this.removePrefix(path)
    if (await (window as any).remixFileSystem.exists(path)) {
      const stat = await( window as any).remixFileSystem.stat(path)
      try {
        if (!stat.isDirectory()) {
          return await this.removeFile(path)
        } else {
          await (window as any).remixFileSystem.unlink(path)
          this.event.emit('fileRemoved', this._normalizePath(path))
        }
      } catch (e) {
        console.log(e)
        return false
      }
    }
  }

  /**
   * copy the folder recursively (internal use)
   * @param {string} path is the folder to be copied over
   * @param {Function} visitFile is a function called for each visited files
   * @param {Function} visitFolder is a function called for each visited folders
   */
  async _copyFolderToJsonInternal (path, visitFile, visitFolder) {
    visitFile = visitFile || function () { /* do nothing. */ }
    visitFolder = visitFolder || function () { /* do nothing. */ }

    const json = {}
    path = this.removePrefix(path)
    if (await (window as any).remixFileSystem.exists(path)) {
      try {
        const items = await (window as any).remixFileSystem.readdir(path)
        visitFolder({ path })
        if (items.length !== 0) {
          for (const item of items) {
            const file: any = {}
            const curPath = `${path}${path.endsWith('/') ? '' : '/'}${item}`
            if ((await (window as any).remixFileSystem.stat(curPath)).isDirectory()) {
              file.children = await this._copyFolderToJsonInternal(curPath, visitFile, visitFolder)
            } else {
              file.content = await (window as any).remixFileSystem.readFile(curPath, 'utf8')
              visitFile({ path: curPath, content: file.content })
            }
            json[curPath] = file
          }
        }
      } catch (e) {
        console.log(e)
        throw new Error(e)
      }
    }
    return json
  }

  /**
   * copy the folder recursively
   * @param {string} path is the folder to be copied over
   * @param {Function} visitFile is a function called for each visited files
   * @param {Function} visitFolder is a function called for each visited folders
   */
  async copyFolderToJson (path, visitFile, visitFolder) {
    visitFile = visitFile || function () { /* do nothing. */ }
    visitFolder = visitFolder || function () { /* do nothing. */ }
    return await this._copyFolderToJsonInternal(path, visitFile, visitFolder)
  }

  async removeFile (path) {
    path = this.removePrefix(path)
    if (await (window as any).remixFileSystem.exists(path) && !(await (window as any).remixFileSystem.stat(path)).isDirectory()) {
      await (window as any).remixFileSystem.unlink(path)
      this.event.emit('fileRemoved', this._normalizePath(path))
      return true
    } else return false
  }

  async rename (oldPath, newPath, isFolder) {
    const unprefixedoldPath = this.removePrefix(oldPath)
    const unprefixednewPath = this.removePrefix(newPath)
    if (await this._exists(unprefixedoldPath)) {
      await (window as any).remixFileSystem.rename(unprefixedoldPath, unprefixednewPath)
      this.event.emit('fileRenamed',
        this._normalizePath(unprefixedoldPath),
        this._normalizePath(unprefixednewPath),
        isFolder
      )
      return true
    }
    return false
  }

  async resolveDirectory (path, cb) {
    const startTime = Date.now()
    path = this.removePrefix(path)
    if (path.indexOf('/') !== 0) path = '/' + path
    try {
      const files = await (window as any).remixFileSystem.readdir(path)
      const ret = {}
      if (files) {
        for (let element of files) {
          path = path.replace(/^\/|\/$/g, '') // remove first and last slash
          element = element.replace(/^\/|\/$/g, '') // remove first and last slash
          const absPath = (path === '/' ? '' : path) + '/' + element
          ret[absPath.indexOf('/') === 0 ? absPath.substr(1, absPath.length) : absPath] = { isDirectory: (await (window as any).remixFileSystem.stat(absPath)).isDirectory() }
          // ^ ret does not accept path starting with '/'
        }
      }
      if (cb) cb(null, ret)
      return ret
    } catch (error) {
      if (cb) cb(error, null)
    }
  }

  removePrefix (path) {
    path = path.indexOf(this.type) === 0 ? path.replace(this.type, '') : path
    if (path === '') return '/'
    return path
  }

  _normalizePath (path) {
    return this.type + path
  }

  isSubDirectory (parent, child) {
    if (!parent) return false
    if (parent === child) return true
    const relative = pathModule.relative(parent, child)

    return !!relative && relative.split(pathModule.sep)[0] !== '..'
  }
}

