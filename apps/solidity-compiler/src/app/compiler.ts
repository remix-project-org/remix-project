/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
import { PluginClient } from '@remixproject/plugin'
import { createClient } from '@remixproject/plugin-webview'
import { CompilerApiMixin } from '@remix-ui/solidity-compiler'
import { ICompilerApi } from '@remix-project/remix-lib'
import { CompileTabLogic } from '@remix-ui/solidity-compiler'

const defaultCompilerParameters = {
  runs: '200',
  optimize: false,
  version: 'soljson-v0.8.24+commit.e11b9ed9',
  evmVersion: null, // compiler default
  language: 'Solidity',
  useFileConfiguration: false,
}
export class CompilerClientApi extends CompilerApiMixin(PluginClient) implements ICompilerApi {
  constructor () {
    super()
    createClient(this as any)
    this.compileTabLogic = new CompileTabLogic(this, this.contentImport)
    this.compiler = this.compileTabLogic.compiler
    this.compileTabLogic.init()
    this.initCompilerApi()
  }

  getCompilerQueryParameters () {
    const params = {
      runs: localStorage.getItem('runs') || defaultCompilerParameters.runs,
      optimize: localStorage.getItem('optimize') === 'true',
      version: localStorage.getItem('version') || defaultCompilerParameters.version,
      evmVersion: localStorage.getItem('evmVersion') || defaultCompilerParameters.evmVersion, // default
      language: localStorage.getItem('language') || defaultCompilerParameters.language,
      useFileConfiguration: localStorage.getItem('useFileConfiguration') === 'true'
    }
    return params
  }

  setCompilerQueryParameters (params) {
    for (const key of Object.keys(params)) {
      localStorage.setItem(key, params[key])
    }
  }

  async getAppParameter (name) {
    return await PluginClient.call('config', 'getAppParameter', name)
  }

  async setAppParameter (name, value) {
    await PluginClient.call('config', 'setAppParameter', name, value)
  }

  getFileManagerMode () {
    return 'browser'
  }

  isDesktop() {
    return false
  }
}
