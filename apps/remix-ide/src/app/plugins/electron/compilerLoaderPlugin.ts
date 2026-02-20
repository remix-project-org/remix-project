import { ElectronPlugin } from '@remixproject/engine-electron';
import { Plugin } from '@remixproject/engine';
import { baseURLBin, baseURLWasm } from '@remix-project/remix-solidity'
import axios, { AxiosResponse } from 'axios'
import { iSolJsonBinData } from '@remix-project/remix-lib'

const profile = {
  displayName: 'compilerLoader',
  name: 'compilerloader',
  description: 'Loads the compiler for offline use',
}

const methods = ['getJsonBinData']

export class compilerLoaderPlugin extends Plugin {
  constructor() {
    super(profile)
    this.methods = methods
  }

  async getJsonBinData() {
    const response: iSolJsonBinData = {
      baseURLBin: '',
      baseURLWasm: '',
      binList: [],
      wasmList: [],
      selectorList: []
    }
    let binRes: AxiosResponse
    let wasmRes: AxiosResponse
    try {
      // fetch normal builds
      binRes = await axios(`${baseURLBin}/list.json`)
      // fetch wasm builds
      wasmRes = await axios(`${baseURLWasm}/list.json`)
    } catch (e) {
    }
    if (wasmRes.status === 200) {
      response.wasmList = wasmRes.data.builds
    }
    if (binRes.status === 200) {
      response.binList = binRes.data.builds
    }
    response.baseURLBin = baseURLBin
    response.baseURLWasm = baseURLWasm

    this.emit('jsonBinDataLoaded', response)
    return response
  }
}

export class compilerLoaderPluginDesktop extends ElectronPlugin {
  constructor() {
    super(profile)
    this.methods = methods
  }

  async onActivation(): Promise<void> {

    this.on('solidity', 'loadingCompiler', async (url) => {
      await this.call('compilerloader', 'downloadCompiler', url)
    })

  }
}