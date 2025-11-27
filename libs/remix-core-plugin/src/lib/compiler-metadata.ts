'use strict'
import { Plugin } from '@remixproject/engine'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import { createHash } from 'crypto'

const profile = {
  name: 'compilerMetadata',
  methods: ['deployMetadataOf'],
  events: [],
  version: '0.0.1'
}

export class CompilerMetadata extends Plugin {
  networks: string[]
  innerPath: string
  buildInfoNames: Record<string, string>
  constructor () {
    super(profile)
    this.networks = ['VM:-', 'main:1', 'sepolia:11155111', 'Custom']
    this.innerPath = 'artifacts'
    this.buildInfoNames = {}
  }

  _JSONFileName (path, contractName) {
    return this.joinPath(this.innerPath, contractName + '.json')
  }

  _MetadataFileName (path, contractName) {
    return this.joinPath(this.innerPath, contractName + '_metadata.json')
  }

  onActivation () {
    const self = this
    this.on('filePanel', 'setWorkspace', () => {
      this.buildInfoNames = {}
    })
    this.on('solidity', 'compilationFinished', async (file, source, languageVersion, data, input, version) => {
      if (!await this.call('settings', 'get', 'settings/generate-contract-metadata')) return
      const compiler = new CompilerAbstract(languageVersion, data, source, input)
      const path = self._extractPathOf(source.target)
      await this.setBuildInfo(version, input, data, path, file)
      compiler.visitContracts((contract) => {
        if (contract.file !== source.target) return
        (async () => {
          const fileName = self._JSONFileName(path, contract.name)
          const content = await this.call('fileManager', 'exists', fileName) ? await this.call('fileManager', 'readFile', fileName) : null
          await this._setArtefacts(content, contract, path)
        })()
      })
    })
  }

  // Access each file in build-info, check the input sources
  // If they are all same as in current compiled file and sources includes the path of compiled file, remove old build file
  async removeStoredBuildInfo (currentInput, path, filePath) {
    const buildDir = this.joinPath(this.innerPath, 'build-info/')
    if (await this.call('fileManager', 'exists', buildDir)) {
      const allBuildFiles = await this.call('fileManager', 'fileList', buildDir)
      const currentInputFileNames = Object.keys(currentInput.sources)
      for (const fileName of allBuildFiles) {
        let fileContent = await this.call('fileManager', 'readFile', fileName)
        fileContent = JSON.parse(fileContent)
        const inputFiles = Object.keys(fileContent.input.sources)
        const inputIntersection = currentInputFileNames.filter(element => !inputFiles.includes(element))
        if (inputIntersection.length === 0 && inputFiles.includes(filePath)) await this.call('fileManager', 'remove', fileName)
      }
    }
  }

  async setBuildInfo (version, input, output, path, filePath) {
    input = JSON.parse(input)
    const solcLongVersion = version.replace('.Emscripten.clang', '')
    const solcVersion = solcLongVersion.substring(0, solcLongVersion.indexOf('+commit'))
    const format = 'hh-sol-build-info-1'
    const json = JSON.stringify({
      _format: format,
      solcVersion,
      solcLongVersion,
      input
    })
    const id = createHash('md5').update(Buffer.from(json)).digest().toString('hex')
    const buildFilename = this.joinPath(this.innerPath, 'build-info/' + id + '.json')
    // If there are no file in buildInfoNames,it means compilation is running first time after loading Remix
    if (!this.buildInfoNames[filePath]) {
      // Check the existing build-info and delete all the previous build files for compiled file
      await this.removeStoredBuildInfo(input, path, filePath)
      this.buildInfoNames[filePath] = buildFilename
      const buildData = { id, _format: format, solcVersion, solcLongVersion, input, output }
      await this.call('fileManager', 'writeFile', buildFilename, JSON.stringify(buildData, null, '\t'))
    } else if (this.buildInfoNames[filePath] && this.buildInfoNames[filePath] !== buildFilename) {
      if (await this.call('fileManager', 'exists', this.buildInfoNames[filePath]))
        await this.call('fileManager', 'remove', this.buildInfoNames[filePath])
      this.buildInfoNames[filePath] = buildFilename
      const buildData = { id, _format: format, solcVersion, solcLongVersion, input, output }
      await this.call('fileManager', 'writeFile', buildFilename, JSON.stringify(buildData, null, '\t'))
    }
  }

  _extractPathOf (file) {
    const reg = /(.*)(\/).*/
    const path = reg.exec(file)
    return path ? path[1] : '/'
  }

  async _setArtefacts (content, contract, path) {
    content = content || '{}'
    const fileName = this._JSONFileName(path, contract.name)
    const metadataFileName = this._MetadataFileName(path, contract.name)

    let metadata
    try {
      metadata = JSON.parse(content)
    } catch (e) {
      console.log(e)
    }

    const deploy = metadata.deploy || {}
    this.networks.forEach((network) => {
      deploy[network] = this._syncContext(contract, deploy[network] || {})
    })

    let parsedMetadata
    try {
      parsedMetadata = contract.object && contract.object.metadata ? JSON.parse(contract.object.metadata) : null
    } catch (e) {
      console.log(e)
    }
    if (parsedMetadata) await this.call('fileManager', 'writeFile', metadataFileName, JSON.stringify(parsedMetadata, null, '\t'))

    const data = {
      deploy,
      data: {
        bytecode: contract.object.evm.bytecode,
        deployedBytecode: contract.object.evm.deployedBytecode,
        gasEstimates: contract.object.evm.gasEstimates,
        methodIdentifiers: contract.object.evm.methodIdentifiers
      },
      abi: contract.object.abi
    }
    await this.call('fileManager', 'writeFile', fileName, JSON.stringify(data, null, '\t'))
    this.emit('artefactsUpdated', fileName, contract)
  }

  _syncContext (contract, metadata) {
    let linkReferences = metadata.linkReferences
    let autoDeployLib = metadata.autoDeployLib
    if (!linkReferences) linkReferences = {}
    if (autoDeployLib === undefined) autoDeployLib = true

    for (const libFile in contract.object.evm.bytecode.linkReferences) {
      if (!linkReferences[libFile]) linkReferences[libFile] = {}
      for (const lib in contract.object.evm.bytecode.linkReferences[libFile]) {
        if (!linkReferences[libFile][lib]) {
          linkReferences[libFile][lib] = '<address>'
        }
      }
    }
    metadata.linkReferences = linkReferences
    metadata.autoDeployLib = autoDeployLib
    return metadata
  }

  async deployMetadataOf (contractName, fileLocation) {
    let path
    if (fileLocation) {
      path = fileLocation.split('/')
      path.pop()
      path = path.join('/')
    } else {
      try {
        path = this._extractPathOf(await this.call('fileManager', 'getCurrentFile'))
      } catch (err) {
        console.log(err)
        throw new Error(err)
      }
    }
    try {
      const { id, name } = await this.call('network', 'detectNetwork')
      const fileName = this._JSONFileName(path, contractName)
      try {
        const content = await this.call('fileManager', 'readFile', fileName)
        if (!content) return null
        let metadata = JSON.parse(content)
        metadata = metadata.deploy || {}
        return metadata[name + ':' + id] || metadata[name] || metadata[id] || metadata[name.toLowerCase() + ':' + id] || metadata[name.toLowerCase()]
      } catch (err) {
        return null
      }
    } catch (err) {
      console.log(err)
      throw new Error(err)
    }
  }

  joinPath (...paths) {
    paths = paths.filter((value) => value !== '').map((path) => path.replace(/^\/|\/$/g, '')) // remove first and last slash)
    if (paths.length === 1) return paths[0]
    return paths.join('/')
  }
}
