'use strict'
import React from 'react' // eslint-disable-line
import { EditorUI } from '@remix-ui/editor' // eslint-disable-line
import { Plugin } from '@remixproject/engine'
import * as packageJson from '../../../../../package.json'
import { PluginViewWrapper } from '@remix-ui/helper'

import { startTypeLoadingProcess } from './type-fetcher'

const EventManager = require('../../lib/events')

const profile = {
  displayName: 'Editor',
  name: 'editor',
  description: 'service - editor',
  version: packageJson.version,
  methods: ['highlight', 'discardHighlight', 'clearAnnotations', 'addLineText', 'discardLineTexts', 'addAnnotation', 'gotoLine', 'revealRange', 'getCursorPosition', 'open', 'addModel','addErrorMarker', 'clearErrorMarkers', 'getText', 'getPositionAt', 'openReadOnly', 'showCustomDiff'],
}

export default class Editor extends Plugin {
  constructor () {
    super(profile)

    this._themes = {
      light: 'light',
      dark: 'vs-dark',
      remixDark: 'remix-dark'
    }

    this.registeredDecorations = { sourceAnnotationsPerFile: {}, markerPerFile: {}, lineTextPerFile: {} }
    this.currentDecorations = { sourceAnnotationsPerFile: {}, markerPerFile: {}, lineTextPerFile: {} }

    // Init
    this.event = new EventManager()
    this.sessions = {}
    this.readOnlySessions = {}
    this.previousInput = ''
    this.saveTimeout = null
    this.emptySession = null
    this.modes = {
      sol: 'sol',
      yul: 'sol',
      mvir: 'move',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      vy: 'python',
      zok: 'zokrates',
      lex: 'lexon',
      txt: 'text',
      json: 'json',
      abi: 'json',
      rs: 'rust',
      cairo: 'cairo',
      ts: 'typescript',
      tsx: 'typescript',
      move: 'move',
      circom: 'circom',
      nr: 'move',
      toml: 'toml',
      html: 'html',
      css: 'css',
      sql: 'sql',
      md: 'md'
    }

    this.activated = false

    this.events = {
      onBreakPointAdded: (file, line) => this.triggerEvent('breakpointAdded', [file, line]),
      onBreakPointCleared: (file, line) => this.triggerEvent('breakpointCleared', [file, line]),
      onDidChangeContent: (file) => this._onChange(file),
      onEditorMounted: () => this.triggerEvent('editorMounted', []),
      onDiffEditorMounted: () => this.triggerEvent('diffEditorMounted', [])
    }

    // to be implemented by the react component
    this.api = {}
    this.dispatch = null
    this.ref = null

    this.monaco = null
    this.typeLoaderDebounce = null

    this.tsModuleMappings = {}
    this.processedPackages = new Set()

    this.typesLoadingCount = 0
    this.shimDisposers = new Map()
  }


  setDispatch (dispatch) {
    this.dispatch = dispatch
  }

  setMonaco (monaco) {
    this.monaco = monaco
  }

  updateComponent(state) {
    return <EditorUI
      editorAPI={state.api}
      themeType={state.currentThemeType}
      currentFile={state.currentFile}
      currentDiffFile={state.currentDiffFile}
      events={state.events}
      plugin={state.plugin}
      isDiff={state.isDiff}
      setMonaco={(monaco) => this.setMonaco(monaco)}
    />
  }

  render () {
    return <div ref={(element)=>{
      this.ref = element
      this.ref.currentContent = () => this.currentContent() // used by e2e test
      this.ref.setCurrentContent = (value) => {
        if (this.sessions[this.currentFile]) {
          this.sessions[this.currentFile].setValue(value)
          this._onChange(this.currentFile)
        }
      }
      this.ref.gotoLine = (line, column) => this.gotoLine(line, column || 0)
      this.ref.getCursorPosition = () => this.getCursorPosition()
      this.ref.addDecoration = (marker, filePath, typeOfDecoration) => this.addDecoration(marker, filePath, typeOfDecoration)
      this.ref.clearDecorationsByPlugin = (filePath, plugin, typeOfDecoration) => this.clearDecorationsByPlugin(filePath, plugin, typeOfDecoration)
      this.ref.keepDecorationsFor = (name, typeOfDecoration) => this.keepDecorationsFor(name, typeOfDecoration)
    }} id='editorView'>
      <PluginViewWrapper plugin={this} />
    </div>
  }

  renderComponent () {
    this.dispatch({
      api: this.api,
      currentThemeType: this.currentThemeType,
      currentFile: this.currentFile,
      currentDiffFile: this.currentDiffFile,
      isDiff: this.isDiff,
      events: this.events,
      plugin: this
    })
  }

  triggerEvent (name, params) {
    this.event.trigger(name, params) // internal stack
    this.emit(name, ...params) // plugin stack
  }

  resolveRelativePath(basePath, relativePath) {
    const stack = basePath.split('/')
    stack.pop()
    
    const parts = relativePath.split('/')
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '.') continue
      if (parts[i] === '..') stack.pop()
      else stack.push(parts[i])
    }
    return stack.join('/')
  }

  async onActivation () {
    this.activated = true
    this.on('editor', 'editorMounted', () => {
      if (!this.monaco) return
      const ts = this.monaco.languages.typescript
      const tsDefaults = ts.typescriptDefaults
      
      tsDefaults.setCompilerOptions({
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        module: ts.ModuleKind.NodeNext,
        target: ts.ScriptTarget.ES2022,
        lib: ['es2022', 'dom', 'dom.iterable'],
        allowNonTsExtensions: true,
        allowSyntheticDefaultImports: true,
        skipLibCheck: true,
        baseUrl: 'file:///node_modules/',
        paths: this.tsModuleMappings,
      })
      tsDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false })
      ts.typescriptDefaults.setEagerModelSync(true)
    })
    this.on('sidePanel', 'focusChanged', (name) => {
      this.keepDecorationsFor(name, 'sourceAnnotationsPerFile')
      this.keepDecorationsFor(name, 'markerPerFile')
    })
    this.on('sidePanel', 'pluginDisabled', (name) => {
      this.clearAllDecorationsFor(name)
    })
    this.on('theme', 'themeLoaded', (theme) => {
      this.currentThemeType = theme.quality
      this.renderComponent()
    })
    this.on('fileManager', 'noFileSelected', async () => {
      this.currentFile = null
      this.renderComponent()
    })
    this.on('fileManager', 'currentFileChanged', (currentFile) => {
      if (this.currentFile === currentFile) return
      this.currentFile = currentFile
      if (currentFile && (currentFile.endsWith('.ts') || currentFile.endsWith('.js') || currentFile.endsWith('.tsx') || currentFile.endsWith('.jsx'))) {
        this._onChange(currentFile)
      }
      this.renderComponent()
    })
    this.on('scriptRunnerBridge', 'runnerChanged', async () => {
      this.processedPackages.clear()
      this.tsModuleMappings = {}

      if (this.currentFile) {
        clearTimeout(this.typeLoaderDebounce)
        await this._onChange(this.currentFile)
      }
    })
    try {
      this.currentThemeType = (await this.call('theme', 'currentTheme')).quality
    } catch (e) {} // eslint-disable-line no-empty
    this.renderComponent()
  }

  onDeactivation () {
    this.off('sidePanel', 'focusChanged')
    this.off('sidePanel', 'pluginDisabled')
  }

  updateTsCompilerOptions() {
    if (!this.monaco) return
    
    const tsDefaults = this.monaco.languages.typescript.typescriptDefaults
    const currentOptions = tsDefaults.getCompilerOptions()
    
    tsDefaults.setCompilerOptions({
      ...currentOptions,
      paths: { ...currentOptions.paths, ...this.tsModuleMappings }
    })
  }
  
  toggleTsDiagnostics(enable) {
    if (!this.monaco) return
    const ts = this.monaco.languages.typescript
    ts.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: !enable,
      noSyntaxValidation: false
    })
  }

  addShimForPackage(pkg) {
    if (!this.monaco) return
    const tsDefaults = this.monaco.languages.typescript.typescriptDefaults

    const shimMainPath = `file:///__shims__/${pkg}.d.ts`
    const shimWildPath = `file:///__shims__/${pkg}__wildcard.d.ts`

    if (!this.shimDisposers.has(shimMainPath)) {
      const d1 = tsDefaults.addExtraLib(`declare module '${pkg}' { const _default: any\nexport = _default }`, shimMainPath)
      this.shimDisposers.set(shimMainPath, d1)
    }

    if (!this.shimDisposers.has(shimWildPath)) {
      const d2 = tsDefaults.addExtraLib(`declare module '${pkg}/*' { const _default: any\nexport = _default }`, shimWildPath)
      this.shimDisposers.set(shimWildPath, d2)
    }

  }

  removeShimsForPackage(pkg) {
    const keys = [`file:///__shims__/${pkg}.d.ts`, `file:///__shims__/${pkg}__wildcard.d.ts`]
    for (const k of keys) {
      const disp = this.shimDisposers.get(k)
      if (disp && typeof disp.dispose === 'function') {
        disp.dispose()
        this.shimDisposers.delete(k)
      }
    }
  }

  beginTypesBatch() {
    if (this.typesLoadingCount === 0) {
      this.toggleTsDiagnostics(false)
      this.triggerEvent('typesLoading', ['start'])
    }
    this.typesLoadingCount++
  }

  endTypesBatch() {
    this.typesLoadingCount = Math.max(0, this.typesLoadingCount - 1)
    if (this.typesLoadingCount === 0) {
      this.updateTsCompilerOptions()
      this.toggleTsDiagnostics(true)
      this.triggerEvent('typesLoading', ['end'])
    }
  }

  addExtraLibs(libs) {
    if (!this.monaco || !libs || libs.length === 0) return
    
    const tsDefaults = this.monaco.languages.typescript.typescriptDefaults
    
    libs.forEach(lib => {
      if (!tsDefaults.getExtraLibs()[lib.filePath]) {
        tsDefaults.addExtraLib(lib.content, lib.filePath)
      }
    })
  }

  // The conductor, called on every editor content change to parse 'import' statements and trigger the type loading process.
  async _onChange (file) {
    this.triggerEvent('didChangeFile', [file])
    if (this.monaco && (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.tsx') || file.endsWith('.jsx'))) {
      clearTimeout(this.typeLoaderDebounce)
      
      this.typeLoaderDebounce = setTimeout(async () => {
        if (!this.monaco) return
        const model = this.monaco.editor.getModel(this.monaco.Uri.parse(file))
        if (!model) return
        const code = model.getValue()

        try {
          const IMPORT_ANY_RE = /(?:import|export)\s+[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g
          
          const rawImports = [...code.matchAll(IMPORT_ANY_RE)]
            .map(m => (m[1] || m[2] || m[3] || '').trim())
            .filter(p => p && !p.startsWith('.') && !p.startsWith('/') && !p.startsWith('file://'))

          const uniqueImports = [...new Set(rawImports)]
          const getBasePackage = (p) => p.startsWith('@') ? p.split('/').slice(0, 2).join('/') : p.split('/')[0]
          
          const newBasePackages = [...new Set(uniqueImports.map(getBasePackage))]
            .filter(p => !this.processedPackages.has(p))

          if (newBasePackages.length === 0) return
          
          this.beginTypesBatch()

          uniqueImports.forEach(pkgImport => this.addShimForPackage(pkgImport))
          this.updateTsCompilerOptions()

          await Promise.all(newBasePackages.map(async (basePackage) => {
            this.processedPackages.add(basePackage)
            
            const activeRunnerLibs = await this.call('scriptRunnerBridge', 'getActiveRunnerLibs')
            const libInfo = activeRunnerLibs.find(lib => lib.name === basePackage)
            const packageToLoad = libInfo ? `${libInfo.name}@${libInfo.version}` : basePackage

            try {
              const result = await startTypeLoadingProcess(packageToLoad)
              if (result && result.libs && result.libs.length > 0) {
                this.addExtraLibs(result.libs)
                if (result.subpathMap) {
                  for (const [subpath, virtualPath] of Object.entries(result.subpathMap)) {
                    this.tsModuleMappings[subpath] = [virtualPath]
                  }
                }
                if (result.mainVirtualPath) {
                  this.tsModuleMappings[basePackage] = [result.mainVirtualPath.replace('file:///node_modules/', '')]
                }
                this.tsModuleMappings[`${basePackage}/*`] = [`${basePackage}/*`]
                
                uniqueImports
                  .filter(p => getBasePackage(p) === basePackage)
                  .forEach(p => this.removeShimsForPackage(p))
              }
            } catch (e) {
              this.processedPackages.delete(basePackage)
              console.error(`[DIAGNOSE-DEEP-PASS] Crawler failed for "${basePackage}":`, e)
            }
          }))
          this.endTypesBatch()
        } catch (error) {
          console.error('[DIAGNOSE-ONCHANGE] Critical error:', error)
          this.endTypesBatch()
        }
      }, 1500)
    }

    const currentFile = await this.call('fileManager', 'file')
    if (!currentFile || currentFile !== file) return
    
    const input = this.get(currentFile)
    if (!input || input === this.previousInput) return
    
    this.previousInput = input

    if (this.saveTimeout) {
      window.clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = window.setTimeout(() => {
      this.triggerEvent('contentChanged', [currentFile, input])
      this.triggerEvent('requiringToSaveCurrentfile', [currentFile])
    }, 500)
  }

  _switchSession (path) {
    if (path !== this.currentFile) {
      this.triggerEvent('sessionSwitched', [])
      this.currentFile = path
    }
    this.renderComponent()
  }

  /**
   * Get Ace mode base of the extension of the session file
   * @param {string} path Path of the file
   */
  _getMode (path) {
    if (!path) return this.modes.txt
    const root = path.split('#')[0].split('?')[0]
    let ext = root.indexOf('.') !== -1 ? /[^.]+$/.exec(root) : null
    if (ext) ext = ext[0]
    else ext = 'txt'
    return ext && this.modes[ext] ? this.modes[ext] : this.modes.txt
  }

  async handleTypeScriptDependenciesOf(path, content, readFile, exists) {
    const isJsOrTs = path.endsWith('.js') || path.endsWith('.jsx') || path.endsWith('.ts') || path.endsWith('.tsx')
    
    if (isJsOrTs) {
      this._onChange(path)
    }

    const isTsFile = path.endsWith('.ts') || path.endsWith('.tsx')
    const isJsFile = path.endsWith('.js') || path.endsWith('.jsx')

    if (isTsFile || isJsFile) {
      const paths = path.split('/')
      paths.pop()
      const fromPath = paths.join('/') 
      const language = isTsFile ? 'typescript' : 'javascript'

      for (const match of content.matchAll(/import\s+.*\s+from\s+(?:"(.*?)"|'(.*?)')/g)) {
        let pathDep = match[1] || match[2]
        if (!pathDep) continue

        if (pathDep.startsWith('./') || pathDep.startsWith('../')) {
          pathDep = this.resolveRelativePath(fromPath, pathDep)
        } else if (pathDep.startsWith('/')) {
          pathDep = pathDep.substring(1)
        } else {
          continue
        }

        const extensions = isTsFile ? ['.ts', '.tsx', '.d.ts'] : ['.js', '.jsx']
        let hasExtension = false
        for (const ext of extensions) {
          if (pathDep.endsWith(ext)) {
            hasExtension = true
            break
          }
        }

        if (!hasExtension) {
          for (const ext of extensions) {
            const pathWithExt = pathDep + ext
            try {
              const pathExists = await exists(pathWithExt)
              if (pathExists) {
                pathDep = pathWithExt
                break
              }
            } catch (e) {} // eslint-disable-line no-empty
          }
        }

        try {
          const pathExists = await exists(pathDep)
          if (pathExists) {
            const contentDep = await readFile(pathDep)
            if (contentDep !== '') {
              this.emit('addModel', contentDep, language, pathDep, this.readOnlySessions[path])
            }
          }
        } catch (e) {
          console.log(e)
        }
      }
    }
  }

  /**
   * Create an editor session
   * @param {string} path path of the file
   * @param {string} content Content of the file to open
   * @param {string} mode Mode for this file [Default is `text`]
   */
  async _createSession (path, content, mode, readOnly) {
    if (!this.activated) return

    this.emit('addModel', content, mode, path, readOnly || this.readOnlySessions[path])
    return {
      path,
      language: mode,
      setValue: (content) => {
        this.emit('setValue', path, content)
      },
      getValue: () => {
        return this.api.getValue(path, content)
      },
      dispose: () => {
        this.emit('disposeModel', path)
      }
    }
  }

  /**
   * Attempts to find the string in the current document
   * @param {string} string
   */
  find (string) {
    return this.api.findMatches(this.currentFile, string)
  }

  async showCustomDiff (file, content) {
    return this.api.showCustomDiff(file, content)
  }

  addModel(path, content) {
    this.emit('addModel', content, this._getMode(path), path, this.readOnlySessions[path])
  }

  /**
   * Display an Empty read-only session
   */
  displayEmptyReadOnlySession () {
    if (!this.activated) return
    this.currentFile = null
    this.emit('addModel', '', 'text', '_blank', true)
  }

  /**
   * Set the text in the current session, if any.
   * @param {string} url Address of the text to replace.
   * @param {string} text New text to be place.
   */
  setText (url, text) {
    if (this.sessions[url]) {
      this.sessions[url].setValue(text)
    }
  }

  /**
   * Get the text in the current session, if any.
   * @param {string} url Address of the content to retrieve.
   */
  getText (url) {
    if (this.sessions[url]) {
      return this.sessions[url].getValue()
    }
  }

  /**
   * Upsert and open a session.
   * @param {string} path Path of the session to open.
   * @param {string} content Content of the document or update.
   */
  async open (path, content) {
    /*
      we have the following cases:
       - URL prepended with "localhost"
       - URL prepended with "browser"
       - URL not prepended with the file explorer. We assume (as it is in the whole app, that this is a "browser" URL
    */
    this.isDiff = false
    if (!this.sessions[path]) {
      this.readOnlySessions[path] = false
      const session = await this._createSession(path, content, this._getMode(path))
      this.sessions[path] = session
    } else if (this.sessions[path].getValue() !== content) {
      this.sessions[path].setValue(content)
    }
    this._switchSession(path)
  }

  /**
   * Upsert and Open a session and set it as Read-only.
   * @param {string} path Path of the session to open.
   * @param {string} content Content of the document or update.
   */
  async openReadOnly (path, content) {
    if (!this.sessions[path]) {
      this.readOnlySessions[path] = true
      const session = await this._createSession(path, content, this._getMode(path))
      this.sessions[path] = session
    }
    this.isDiff = false
    this._switchSession(path)
  }

  async openDiff(change) {
    const hashedPathModified = change.readonly ? change.path + change.hashModified : change.path
    const hashedPathOriginal = change.path + change.hashOriginal
    const session = await this._createSession(hashedPathModified, change.modified, this._getMode(change.path), change.readonly)
    await this._createSession(hashedPathOriginal, change.original, this._getMode(change.path), change.readonly)
    this.sessions[hashedPathModified] = session
    this.currentDiffFile = hashedPathOriginal
    this.isDiff = true
    this._switchSession(hashedPathModified)
  }

  /**
   * Content of the current session
   * @return {String} content of the file referenced by @arg path
   */
  currentContent () {
    return this.get(this.current())
  }

  /**
   * Content of the session targeted by @arg path
   * if @arg path is null, the content of the current session is returned
   * @param {string} path Path of the session to get.
   * @return {String} content of the file referenced by @arg path
   */
  get (path) {
    if (!path || this.currentFile === path) {
      return this.api.getValue(path)
    } else if (this.sessions[path]) {
      return this.sessions[path].getValue()
    }
  }

  /**
   * Path of the currently editing file
   * returns `undefined` if no session is being edited
   * @return {String} path of the current session
   */
  current () {
    return this.currentFile
  }

  /**
   * The position of the cursor
   */
  getCursorPosition (offset = true) {
    return this.api.getCursorPosition(offset)
  }

  /**
   * Remove the current session from the list of sessions.
   */
  discardCurrentSession () {
    if (this.sessions[this.currentFile]) {
      delete this.sessions[this.currentFile]
      this.currentFile = null
    }
  }

  /**
   * Remove a session based on its path.
   * @param {string} path
   */
  discard (path) {
    if (this.sessions[path]) {
      this.sessions[path].dispose()
      delete this.sessions[path]
    }
    if (this.currentFile === path) this.currentFile = null
  }

  /**
   * Increment the font size (in pixels) for the editor text.
   * @param {number} incr The amount of pixels to add to the font.
   */
  editorFontSize (incr) {
    if (!this.activated) return
    this.emit('setFontSize', incr)
  }

  /**
   * Resize the editor, and sets whether or not line wrapping is enabled.
   * @param {boolean} useWrapMode Enable (or disable) wrap mode
   */
  resize (useWrapMode) {
    if (!this.activated) return
    this.emit('setWordWrap', useWrapMode)
  }

  /**
   * Moves the cursor and focus to the specified line and column number
   * @param {number} line
   * @param {number} col
   */
  gotoLine (line, col) {
    if (!this.activated) return
    this.emit('focus')
    this.emit('revealLine', line + 1, col)
  }

  /**
   * Reveals the range in the editor.
   * @param {number} startLineNumber
   * @param {number} startColumn
   * @param {number} endLineNumber
   * @param {number} endColumn
   */
  revealRange (startLineNumber, startColumn, endLineNumber, endColumn) {
    if (!this.activated) return
    this.emit('focus')
    this.emit('revealRange', startLineNumber, startColumn, endLineNumber, endColumn)
  }

  /**
   * Scrolls to a line. If center is true, it puts the line in middle of screen (or attempts to).
   * @param {number} line The line to scroll to
   */
  scrollToLine (line) {
    if (!this.activated) return
    this.emit('revealLine', line + 1, 0)
  }

  /**
   * Clears all the decorations for the given @arg filePath and @arg plugin, if none is given, the current session is used.
   * An annotation has the following shape:
      column: -1
      row: -1
      text: "browser/Untitled1.sol: Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.↵"
      type: "warning"
   * @param {String} filePath
   * @param {String} plugin
   * @param {String} typeOfDecoration
   */
  clearDecorationsByPlugin (filePath, plugin, typeOfDecoration) {
    if (filePath && !this.sessions[filePath]) throw new Error('file not found' + filePath)
    const path = filePath || this.currentFile

    const { currentDecorations, registeredDecorations } = this.api.clearDecorationsByPlugin(path, plugin, typeOfDecoration, this.registeredDecorations[typeOfDecoration][filePath] || [], this.currentDecorations[typeOfDecoration][filePath] || [])
    this.currentDecorations[typeOfDecoration][filePath] = currentDecorations
    this.registeredDecorations[typeOfDecoration][filePath] = registeredDecorations
  }

  keepDecorationsFor (plugin, typeOfDecoration) {
    if (!this.currentFile) return
    const { currentDecorations } = this.api.keepDecorationsFor(this.currentFile, plugin, typeOfDecoration, this.registeredDecorations[typeOfDecoration][this.currentFile] || [], this.currentDecorations[typeOfDecoration][this.currentFile] || [])
    this.currentDecorations[typeOfDecoration][this.currentFile] = currentDecorations
  }

  /**
   * Clears all the decorations and for all the sessions for the given @arg plugin
   * An annotation has the following shape:
      column: -1
      row: -1
      text: "browser/Untitled1.sol: Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.↵"
      type: "warning"
   * @param {String} filePath
   */
  clearAllDecorationsFor (plugin) {
    for (const session in this.sessions) {
      this.clearDecorationsByPlugin(session, plugin, 'sourceAnnotationsPerFile')
      this.clearDecorationsByPlugin(session, plugin, 'markerPerFile')
    }
  }

  // error markers
  async addErrorMarker (error){
    const { from } = this.currentRequest
    this.api.addErrorMarker(error, from)
  }

  async clearErrorMarkers(sources){
    const { from } = this.currentRequest
    this.api.clearErrorMarkers(sources, from)
  }

  /**
   * Clears all the annotations for the given @arg filePath, the plugin name is retrieved from the context, if none is given, the current session is used.
   * An annotation has the following shape:
      column: -1
      row: -1
      text: "browser/Untitled1.sol: Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.↵"
      type: "warning"
   * @param {String} filePath
   * @param {String} plugin
   */
  clearAnnotations (filePath) {
    filePath = filePath || this.currentFile
    const { from } = this.currentRequest
    this.clearDecorationsByPlugin(filePath, from, 'sourceAnnotationsPerFile')
  }

  async addDecoration (decoration, filePath, typeOfDecoration) {
    if (!filePath) return
    filePath = await this.call('fileManager', 'getPathFromUrl', filePath)
    filePath = filePath.file
    if (!this.sessions[filePath]) return
    const path = filePath || this.currentFile

    const { from } = this.currentRequest
    decoration.from = from

    const { currentDecorations, registeredDecorations } = this.api.addDecoration(decoration, path, typeOfDecoration)
    if (!this.registeredDecorations[typeOfDecoration][filePath]) this.registeredDecorations[typeOfDecoration][filePath] = []
    this.registeredDecorations[typeOfDecoration][filePath].push(...registeredDecorations)
    if (!this.currentDecorations[typeOfDecoration][filePath]) this.currentDecorations[typeOfDecoration][filePath] = []
    this.currentDecorations[typeOfDecoration][filePath].push(...currentDecorations)
  }

  /**
   * Add an annotation to the current session.
   * An annotation has the following shape:
      column: -1
      row: -1
      text: "browser/Untitled1.sol: Warning: SPDX license identifier not provided in source file. Before publishing, consider adding a comment containing "SPDX-License-Identifier: <SPDX-License>" to each source file. Use "SPDX-License-Identifier: UNLICENSED" for non-open-source code. Please see https://spdx.org for more information.↵"
      type: "warning"
   * @param {Object} annotation
   * @param {String} filePath
   */
  async addAnnotation (annotation, filePath) {
    filePath = filePath || this.currentFile
    await this.addDecoration(annotation, filePath, 'sourceAnnotationsPerFile')
  }

  async highlight (position, filePath, highlightColor, opt = { focus: true }) {
    filePath = filePath || this.currentFile
    if (opt.focus) {
      await this.call('fileManager', 'open', filePath)
      this.scrollToLine(position.start.line)
    }
    await this.addDecoration({ position }, filePath, 'markerPerFile')
  }

  discardHighlight () {
    const { from } = this.currentRequest
    for (const session in this.sessions) {
      this.clearDecorationsByPlugin(session, from, 'markerPerFile', this.registeredDecorations, this.currentDecorations)
    }
  }

  async addLineText (lineText, filePath) {
    filePath = filePath || this.currentFile
    await this.addDecoration(lineText, filePath, 'lineTextPerFile')
  }

  discardLineTexts() {
    const { from } = this.currentRequest
    for (const session in this.sessions) {
      this.clearDecorationsByPlugin(session, from, 'lineTextPerFile', this.registeredDecorations, this.currentDecorations)
    }
  }

  getPositionAt(offset) {
    return this.api.getPositionAt(offset)
  }
}
