'use strict'
import { Plugin } from '@remixproject/engine'
import { RemixURLResolver, githubFolderResolver } from '@remix-project/remix-url-resolver'
const profile = {
  name: 'contentImport',
  displayName: 'content import',
  version: '0.0.1',
  methods: ['resolve', 'resolveAndSave', 'isExternalUrl', 'resolveGithubFolder', 'resolveImportFromIndex']
}

export type ResolvedImport = {

    
        
          
    

        
        Expand All
    
    @@ -17,6 +17,7 @@ export type ResolvedImport = {
  
  content: string,
  cleanUrl: string
  type: string
}

export class CompilerImports extends Plugin {
  urlResolver: any

  constructor () {
    super(profile)
    this.urlResolver = new RemixURLResolver(async () => {

    
          
            
    

          
          Expand Down
          
            
    

          
          Expand Up
    
    @@ -49,7 +50,9 @@ export class CompilerImports extends Plugin {
  
      try {
        let yarnLock
        if (await this.call('fileManager', 'exists', './yarn.lock')) {
          yarnLock = await this.call('fileManager', 'readFile', './yarn.lock')
        }
        let packageLock
        if (await this.call('fileManager', 'exists', './package-lock.json')) {
          packageLock = await this.call('fileManager', 'readFile', './package-lock.json')
          packageLock = JSON.parse(packageLock)
        }
        if (await this.call('fileManager', 'exists', './package.json')) {
          const content = await this.call('fileManager', 'readFile', './package.json')
          const pkg = JSON.parse(content)
          return { deps: { ...pkg['dependencies'], ...pkg['devDependencies'] }, yarnLock, packageLock }
        } else {
          return {}
        }
      } catch (e) {
        console.error(e)
        return {}
      }
    })
  }

  onActivation(): void {
    const packageFiles = ['package.json', 'package-lock.json', 'yarn.lock']
    this.on('filePanel', 'setWorkspace', () => {
      this.urlResolver.clearCache()
    })
    this.on('fileManager', 'fileRemoved', (file: string) => {
      if (packageFiles.includes(file)) {
        this.urlResolver.clearCache()

    
        
          
    

        
        Expand All
    
    @@ -62,6 +65,53 @@ export class CompilerImports extends Plugin {
  
      }
    })
    this.on('fileManager', 'fileChanged', (file: string) => {
      if (packageFiles.includes(file)) {
        this.urlResolver.clearCache()
      }
    })
  }

  /**
   * Resolve an import path using the persistent resolution index
   * This is used by the editor for "Go to Definition" navigation
   */
  async resolveImportFromIndex(sourceFile: string, importPath: string): Promise<string | null> {
    const indexPath = '.deps/npm/.resolution-index.json'

    try {
      // Just read the file directly!
      const exists = await this.call('fileManager', 'exists', indexPath)
      if (!exists) {
        console.log('[CompilerImports] ℹ️ No resolution index file found')
        return null
      }

      const content = await this.call('fileManager', 'readFile', indexPath)
      const index = JSON.parse(content)

      console.log('[CompilerImports] 🔍 Looking up:', { sourceFile, importPath })
      console.log('[CompilerImports] 📊 Index has', Object.keys(index).length, 'source files')

      // First try: lookup using the current file (works if currentFile is a base file)
      if (index[sourceFile] && index[sourceFile][importPath]) {
        const resolved = index[sourceFile][importPath]
        console.log('[CompilerImports] ✅ Direct lookup result:', resolved)
        return resolved
      }

      // Second try: search across ALL base files (works if currentFile is a library file)
      console.log('[CompilerImports] 🔍 Trying lookupAny across all source files...')
      for (const file in index) {
        if (index[file][importPath]) {
          const resolved = index[file][importPath]
          console.log('[CompilerImports] ✅ Found in', file, ':', resolved)
          return resolved
        }
      }

      console.log('[CompilerImports] ℹ️ Import not found in index')
      return null

    } catch (err) {
      console.log('[CompilerImports] ⚠️ Failed to read resolution index:', err)
      return null
    }
  }

  async setToken () {
    try {
      const protocol = typeof window !== 'undefined' && window.location.protocol

    
        
          
    

        
        Expand All
    
    @@ -84,11 +134,11 @@ export class CompilerImports extends Plugin {
  
      const token = await this.call('settings', 'get', 'settings/gist-access-token')
      this.urlResolver.setGistToken(token, protocol)
    } catch (error) {
      console.log(error)
    }
  }
  isRelativeImport (url) {
    return /^([^/]+)/.exec(url)
  }
  isExternalUrl (url) {
    const handlers = this.urlResolver.getHandlers()
    // we filter out "npm" because this will be recognized as internal url although it's not the case.
    return handlers.filter((handler) => handler.type !== 'npm').some(handler => handler.match(url))
  }

  /**
   * resolve the content of @arg url. This only resolves external URLs.
   *
   * @param {String} url  - external URL of the content. can be basically anything like raw HTTP, ipfs URL, github address etc...
   * @returns {Promise} - { content, cleanUrl, type, url }
   */
  resolve (url) {
    return new Promise((resolve, reject) => {
      this.import(url, null, (error, content, cleanUrl, type, url) => {

    
        
          
    

        
        Expand All
    
    @@ -108,8 +158,6 @@ export class CompilerImports extends Plugin {
  
        if (error) return reject(error)
        resolve({ content, cleanUrl, type, url })
      }, null)
    })
  }
  async import (url, force, loadingCb, cb) {
    if (typeof force !== 'boolean') {
      const temp = loadingCb
      loadingCb = force
      cb = temp
      force = false
    }
    if (!loadingCb) loadingCb = () => {}
    if (!cb) cb = () => {}

    let resolved
    try {
      await this.setToken()

    
          
            
    

          
          Expand Down
          
            
    

          
          Expand Up
    
    @@ -140,6 +188,27 @@ export class CompilerImports extends Plugin {
  
      resolved = await this.urlResolver.resolve(url, [], force)
      const { content, cleanUrl, type } = resolved
      cb(null, content, cleanUrl, type, url)
    } catch (e) {
      return cb(new Error('not found ' + url))
    }
  }
  importExternal (url, targetPath) {
    return new Promise((resolve, reject) => {
      this.import(url,
        // TODO: handle this event
        (loadingMsg) => { this.emit('message', loadingMsg) },
        async (error, content, cleanUrl, type, url) => {
          if (error) return reject(error)
          try {
            const provider = await this.call('fileManager', 'getProviderOf', null)
            const path = targetPath || type + '/' + cleanUrl
            if (provider) await provider.addExternal('.deps/' + path, content, url)
          } catch (err) {
            console.error(err)
          }
          resolve(content)
        }, null)
    })
  }

  /**
    * import the content of @arg url.  /**
   * resolve the content of @arg url. This only resolves external URLs.
    return new Promise((resolve, reject) => {
      this.import(url,
        // TODO: handle this event
        (loadingMsg) => { this.emit('message', loadingMsg) },
        async (error, content, cleanUrl, type, url) => {
          if (error) return reject(error)
          try {
            const provider = await this.call('fileManager', 'getProviderOf', null)
            const path = targetPath || type + '/' + cleanUrl
            if (provider) await provider.addExternal('.deps/' + path, content, url)
          } catch (err) {
            console.error(err)
          }
          resolve(content)
        }, null)
    })
  }
  /**
    * import the content of @arg url.
    * first look in the browser localstorage (browser explorer) or localhost explorer. if the url start with `browser/*` or  `localhost/*`

    
        
          
    

        
        Expand All
    
    @@ -148,9 +217,10 @@ export class CompilerImports extends Plugin {
  
    * then check if the @arg url is located in the localhost, in the node_modules or installed_contracts folder
    * then check if the @arg url match any external url
    *
    * @param {String} url - URL of the content. can be basically anything like file located in the browser explorer, in the localhost explorer, raw HTTP, github address etc...
    * @param {String} targetPath - (optional) internal path where the content should be saved to
    * @param {Boolean} skipMappings - (optional) unused parameter, kept for backward compatibility
    * @returns {Promise} - string content
    */
  async resolveAndSave (url, targetPath, skipMappings = false) {
    try {
      if (targetPath && this.currentRequest) {
        const canCall = await this.askUserPermission('resolveAndSave', 'This action will update the path ' + targetPath)

    
          
            
    

          
          Expand Down
    
    
  
        if (!canCall) throw new Error('No permission to update ' + targetPath)
      }
      const provider = await this.call('fileManager', 'getProviderOf', url)
      if (provider) {
        if (provider.type === 'localhost' && !provider.isConnected()) {
          throw new Error(`file provider ${provider.type} not available while trying to resolve ${url}`)
        }
        let exist = await provider.exists(url)
        /*
          if the path is absolute and the file does not exist, we can stop here
          Doesn't make sense to try to resolve "localhost/node_modules/localhost/node_modules/<path>" and we'll end in an infinite loop.
        */
        if (!exist && (url === 'remix_tests.sol' || url === 'remix_accounts.sol')) {
          await this.call('solidityUnitTesting', 'createTestLibs')
          exist = await provider.exists(url)
        }
        if (!exist && url.startsWith('browser/')) throw new Error(`not found ${url}`)
        if (!exist && url.startsWith('localhost/')) throw new Error(`not found ${url}`)
        if (exist) {
          const content = await (() => {
            return new Promise((resolve, reject) => {
              provider.get(url, (error, content) => {
                if (error) return reject(error)
                resolve(content)
              })
            })
          })()
          return content
        } else {
          const localhostProvider = await this.call('fileManager', 'getProviderByName', 'localhost')
          if (localhostProvider.isConnected()) {
            const split = /([^/]+)\/(.*)$/g.exec(url)
            const possiblePaths = ['localhost/installed_contracts/' + url]
            // pick remix-tests library contracts from '.deps'
            if (url.startsWith('remix_')) possiblePaths.push('localhost/.deps/remix-tests/' + url)
            if (split) possiblePaths.push('localhost/installed_contracts/' + split[1] + '/contracts/' + split[2])
            possiblePaths.push('localhost/node_modules/' + url)
            if (split) possiblePaths.push('localhost/node_modules/' + split[1] + '/contracts/' + split[2])
            for (const path of possiblePaths) {
              try {
                const content = await this.resolveAndSave(path, null)
                if (content) {
                  localhostProvider.addNormalizedName(path.replace('localhost/', ''), url)
                  return content
                }
              } catch (e) {}
            }
            return await this.importExternal(url, targetPath)
          }
          return await this.importExternal(url, targetPath)
        }
      }
    } catch (e) {
      throw new Error(e)
    }
  }
  async resolveGithubFolder (url) {
    const ghFolder = {}
    await githubFolderResolver(url, ghFolder, 3)
    return ghFolder
  }
}
