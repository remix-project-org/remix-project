/* global */
import React from 'react' // eslint-disable-line
import { SolidityCompiler } from '@remix-ui/solidity-compiler' // eslint-disable-line
import { CompileTabLogic } from '@remix-ui/solidity-compiler' // eslint-disable-line
import { CompilerApiMixin } from '@remix-ui/solidity-compiler'
import { ViewPlugin } from '@remixproject/engine-web'
import { QueryParams } from '@remix-project/remix-lib'
// import { ICompilerApi } from '@remix-project/remix-lib'
import * as packageJson from '../../../../../package.json'
import { compilerConfigChangedToastMsg, compileToastMsg } from '@remix-ui/helper'
import { isNative } from '../../remixAppManager'
import { Registry } from '@remix-project/remix-lib'
import { DependencyResolvingCompiler } from '../lib/dependency-resolving-compiler'

const remixConfigPath = 'remix.config.json'
const profile = {
  name: 'solidity',
  displayName: 'Solidity compiler',
  icon: 'assets/img/solidity.webp',
  description: 'Compile solidity contracts',
  kind: 'compiler',
  permission: true,
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/compile.html',
  version: packageJson.version,
  maintainedBy: 'Remix',
  methods: ['getCompilationResult', 'compile', 'compileWithParameters', 'setCompilerConfig', 'compileFile', 'getCompilerState', 'getCompilerQueryParameters', 'getCompiler', 'getCurrentCompilerConfig', 'compile']
}

// EditorApi:
// - events: ['compilationFinished'],
// - methods: ['getCompilationResult']

export default class CompileTab extends CompilerApiMixin(ViewPlugin) { // implements ICompilerApi
  constructor(config, fileManager) {
    super(profile)
    this.fileManager = fileManager
    this.config = config
    this.queryParams = new QueryParams()
    // Pass 'this' as the plugin reference so CompileTabLogic can access contentImport via this.call()
    this.compileTabLogic = new CompileTabLogic(
      this,
      undefined,
      (api, debug) => new DependencyResolvingCompiler(api, (url, cb) => {
        cb(`${url} not found.`)
      }, undefined, debug)
    )
    this.compiler = this.compileTabLogic.compiler
    this.compileTabLogic.init()
    this.initCompilerApi()
    this.el = document.createElement('div')
    this.el.setAttribute('id', 'compileTabView')
  }

  renderComponent() {
    // empty method, is a state update needed?
  }

  onCurrentFileChanged() {
    this.renderComponent()
  }

  // onResetResults () {
  //   this.renderComponent()
  // }

  onSetWorkspace() {
    this.renderComponent()
  }

  onFileRemoved() {
    this.renderComponent()
  }

  onNoFileSelected() {
    this.renderComponent()
  }

  onFileClosed() {
    this.renderComponent()
  }

  onCompilationFinished() {
    this.renderComponent()
  }

  render() {
    return <div id='compileTabView'><SolidityCompiler api={this} /></div>
  }

  async compileWithParameters(compilationTargets, settings) {
    return await super.compileWithParameters(compilationTargets, settings)
  }

  getCompilationResult() {
    return super.getCompilationResult()
  }

  getFileManagerMode() {
    return this.fileManager.mode
  }

  isDesktop() {
    return Registry.getInstance().get('platform').api.isDesktop()
  }

  /**
   * set the compiler configuration
   * This function is used by remix-plugin compiler API.
   * @param {object} settings {evmVersion, optimize, runs, version, language}
   */
  async setCompilerConfig(settings) {
    super.setCompilerConfig(settings)
    this.renderComponent()
    // @todo(#2875) should use loading compiler return value to check whether the compiler is loaded instead of "setInterval"
    const value = JSON.stringify(settings, null, '\t')
    let pluginInfo
    pluginInfo = await this.call('udapp', 'showPluginDetails')

    if (this.currentRequest.from === 'udapp') {
      this.call('notification', 'toast', compilerConfigChangedToastMsg((pluginInfo ? pluginInfo.displayName : this.currentRequest.from), value))
    }
  }

  compile(fileName) {
    if (!isNative(this.currentRequest.from)) this.call('notification', 'toast', compileToastMsg(this.currentRequest.from, fileName))
    return super.compile(fileName)
  }

  compileFile(event) {
    return super.compileFile(event)
  }

  async onActivation() {
    super.onActivation()
    this.on('filePanel', 'workspaceInitializationCompleted', () => {
      this.call('filePanel', 'registerContextMenuItem', {
        id: 'solidity',
        name: 'compileFile',
        label: 'Compile',
        type: [],
        extension: ['.sol'],
        path: [],
        pattern: [],
        group: 6
      })
      this.on('fileManager', 'fileSaved', async (file) => {
        if (file === remixConfigPath) {
          this.emit('configFileChanged', file)
        }
      })
      this.on('fileManager', 'fileAdded', async (file) => {
        if (file === remixConfigPath) {
          this.emit('configFileChanged', file)
        }
      })
    })
    try {
      this.currentFile = await this.call('fileManager', 'file')
    } catch (error) {
      if (error.message !== 'Error: No such file or directory No file selected') throw error
    }
  }

  getCompiler() {
    return this.compileTabLogic.compiler
  }

  getCompilerQueryParameters() {
    const params = this.queryParams.get()
    params.evmVersion = params.evmVersion === 'null' || params.evmVersion === 'undefined' ? null : params.evmVersion
    params.optimize = (params.optimize === 'false' || params.optimize === null || params.optimize === undefined) ? false : params.optimize
    params.optimize = params.optimize === 'true' ? true : params.optimize
    return params
  }

  setCompilerQueryParameters(params) {
    this.queryParams.update(params)
    try {
      this.emit('compilerQueryParamsUpdated')
    } catch (e) {
      // do nothing
    }
  }

  async getAppParameter(name) {
    return await this.call('config', 'getAppParameter', name)
  }

  async setAppParameter(name, value) {
    await this.call('config', 'setAppParameter', name, value)
    try {
      this.emit('compilerAppParamsUpdated')
    } catch (e) {
      // do nothing
    }
  }
}

module.exports = CompileTab
