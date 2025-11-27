'use strict'
import { Plugin } from '@remixproject/engine'
import { util, execution } from '@remix-project/remix-lib'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import { toChecksumAddress } from '@ethereumjs/util'
import { ContractData } from '../types/contract'

const profile = {
  name: 'compilerArtefacts',
  methods: ['get', 'addResolvedContract', 'getCompilerAbstract', 'getAllContractDatas', 'getLastCompilationResult', 'getArtefactsByContractName', 'getContractDataFromAddress', 'getContractDataFromByteCode', 'saveCompilerAbstract', 'getAllCompilerAbstracts'],
  events: ['compilationSaved'],
  version: '0.0.1',
}

export class CompilerArtefacts extends Plugin {
  compilersArtefactsPerFile: any
  compilersArtefacts: any
  constructor() {
    super(profile)
    this.compilersArtefacts = {}
    this.compilersArtefactsPerFile = {}
  }

  clear() {
    this.compilersArtefacts = {}
    this.compilersArtefactsPerFile = {}
  }

  saveCompilerAbstract(file: string, compilerAbstract: CompilerAbstract) {
    this.compilersArtefactsPerFile[file] = compilerAbstract
  }

  getAllCompilerAbstracts() {
    return this.compilersArtefactsPerFile
  }

  onActivation() {
    const saveCompilationResult = (file, source, languageVersion, data, input?) => {
      this.compilersArtefactsPerFile[file] = new CompilerAbstract(languageVersion, data, source, input)
      this.compilersArtefacts.__last = this.compilersArtefactsPerFile[file]
      this.emit('compilationSaved', { [file]: this.compilersArtefactsPerFile[file] })
    }

    this.on('solidity', 'compilationFinished', saveCompilationResult)

    this.on('vyper', 'compilationFinished', saveCompilationResult)

    this.on('lexon', 'compilationFinished', saveCompilationResult)

    this.on('yulp', 'compilationFinished', saveCompilationResult)

    this.on('solidityUnitTesting', 'compilationFinished', saveCompilationResult)

    this.on('nahmii-compiler', 'compilationFinished', saveCompilationResult)

    this.on('hardhat', 'compilationFinished', saveCompilationResult)

    this.on('truffle', 'compilationFinished', saveCompilationResult)

    this.on('foundry', 'compilationFinished', saveCompilationResult)
  }

  /**
   * Get artefacts for last compiled contract
   * * @returns last compiled contract compiler abstract
   */
  getLastCompilationResult() {
    return this.compilersArtefacts.__last
  }

  /**
   * Get compilation output for contracts compiled during a session of Remix IDE
   * @returns compilation output
   */
  getAllContractDatas() {
    return this.filterAllContractDatas(() => true)
  }

  /**
   * filter compilation output for contracts compiled during a session of Remix IDE
   * @returns compilation output
   */
  filterAllContractDatas(filter) {
    const contractsData = {}
    Object.keys(this.compilersArtefactsPerFile).map((targetFile) => {
      const artefact = this.compilersArtefactsPerFile[targetFile]
      const contracts = artefact.getContracts()
      Object.keys(contracts).map((file) => {
        if (filter(file, contracts[file], artefact)) contractsData[file] = contracts[file]
      })
    })
    // making sure we save last compilation result in there
    if (this.compilersArtefacts.__last) {
      const contracts = this.compilersArtefacts.__last.getContracts()
      Object.keys(contracts).map((file) => {
        if (filter(file, contracts[file], this.compilersArtefacts.__last)) contractsData[file] = contracts[file]
      })
    }
    return contractsData
  }

  /**
   * Get a particular contract output/artefacts from a compiler output of a Solidity file compilation
   * @param compilerOutput compiler output
   * @param contractName contract name
   * @returns artefacts object, with fully qualified name (e.g; contracts/1_Storage.sol:Storage) as key
   */
  _getAllContractArtefactsfromOutput(compilerOutput, contractName) {
    const contractArtefacts = {}
    for (const filename in compilerOutput) {
      if (Object.keys(compilerOutput[filename]).includes(contractName)) contractArtefacts[filename + ':' + contractName] = compilerOutput[filename][contractName]
    }
    return contractArtefacts
  }

  /**
   * Populate resultant object with a particular contract output/artefacts by processing all the artifacts stored in file explorer
   * @param path path to start looking from
   * @param contractName contract to be looked for
   * @param contractArtefacts populated resultant artefacts object, with fully qualified name (e.g: contracts/1_Storage.sol:Storage) as key
   * Once method execution completes, contractArtefacts object will hold all possible artefacts for contract
   */
  async _populateAllContractArtefactsFromFE(path, contractName, contractArtefacts) {
    const dirList = await this.call('fileManager', 'dirList', path)
    if (dirList && dirList.length) {
      for (const dirPath of dirList) {
        // check if directory contains an 'artifacts' folder and a 'build-info' folder inside 'artifacts'
        if (dirPath === path + '/artifacts' && (await this.call('fileManager', 'exists', dirPath + '/build-info'))) {
          const buildFileList = await this.call('fileManager', 'fileList', dirPath + '/build-info')
          // process each build-info file to populate the artefacts for contractName
          for (const buildFile of buildFileList) {
            let content = await this.call('fileManager', 'readFile', buildFile)
            if (content) content = JSON.parse(content)
            const compilerOutput = content.output.contracts
            const artefacts = this._getAllContractArtefactsfromOutput(compilerOutput, contractName)
            // populate the resultant object with artefacts
            Object.assign(contractArtefacts, artefacts)
          }
        } else await this._populateAllContractArtefactsFromFE(dirPath, contractName, contractArtefacts)
      }
    } else return
  }

  /**
   * Get artefacts for a contract (called by script-runner)
   * @param name contract name or fully qualified name i.e. <filename>:<contractname> e.g: contracts/1_Storage.sol:Storage
   * @returns artefacts for the contract
   */
  async getArtefactsByContractName(name) {
    const contractsDataByFilename = this.getAllContractDatas()
    // check if name is a fully qualified name
    if (name.includes(':')) {
      const fullyQualifiedName = name
      const nameArr = fullyQualifiedName.split(':')
      const filename = nameArr[0]
      const contract = nameArr[1]
      if (Object.keys(contractsDataByFilename).includes(filename) && contractsDataByFilename[filename][contract]) return contractsDataByFilename[filename][contract]
      else {
        const allContractsData = {}
        await this._populateAllContractArtefactsFromFE('contracts', contract, allContractsData)
        if (allContractsData[fullyQualifiedName]) return { fullyQualifiedName, artefact: allContractsData[fullyQualifiedName] }
        else throw new Error(`Could not find artifacts for ${fullyQualifiedName}. Compile contract to generate artifacts.`)
      }
    } else {
      const contractName = name
      const contractArtefacts = this._getAllContractArtefactsfromOutput(contractsDataByFilename, contractName)
      let keys = Object.keys(contractArtefacts)
      if (!keys.length) {
        await this._populateAllContractArtefactsFromFE('contracts', contractName, contractArtefacts)
        keys = Object.keys(contractArtefacts)
      }
      if (keys.length === 1) return { fullyQualifiedName: keys[0], artefact: contractArtefacts[keys[0]] }
      else if (keys.length > 1) {
        throw new Error(`There are multiple artifacts for contract "${contractName}", please use a fully qualified name.\n
          Please replace ${contractName} for one of these options wherever you are trying to read its artifact: \n
          ${keys.join()}\n
          OR just compile the required contract again`)
      } else throw new Error(`Could not find artifacts for ${contractName}. Compile contract to generate artifacts.`)
    }
  }

  async getCompilerAbstract(file) {
    if (!file) return null
    if (this.compilersArtefactsPerFile[file]) return this.compilersArtefactsPerFile[file]
    const path = await this.call('fileManager', 'getPathFromUrl', file)

    if (path && path.file && this.compilersArtefactsPerFile[path.file]) return this.compilersArtefactsPerFile[path.file]

    let artefact = null
    this.filterAllContractDatas((localFile, data, parentArtefact) => {
      if (localFile === file || (path && path.file && localFile === path.file)) {
        artefact = parentArtefact
      }
    })
    return artefact
  }

  addResolvedContract(address: string, compilerData: CompilerAbstract) {
    this.compilersArtefacts[address] = compilerData
  }

  isResolved(address) {
    return this.compilersArtefacts[address] !== undefined
  }

  get(key) {
    const checksumed = (key && key.startsWith('0x')) ? toChecksumAddress(key) : key
    return this.compilersArtefacts[key] || this.compilersArtefacts[checksumed]
  }

  async getContractDataFromAddress(address) {
    const code = await this.call('blockchain', 'getCode', address)
    return this.getContractDataFromByteCode(code)
  }

  async getContractDataFromByteCode(code) {
    let found
    this.filterAllContractDatas((file, contractsData) => {
      for (const name of Object.keys(contractsData)) {
        const contract = contractsData[name]
        if (util.compareByteCode(code, '0x' + contract.evm.deployedBytecode.object)) {
          found = { name, contract, file }
          return true
        }
      }
      return true
    })
    return found
  }
}

export const getContractData = (contractName: string, compiler: CompilerAbstract): ContractData => {
  if (!contractName) return null
  // const compiler = plugin.compilersArtefacts[compilerAttributeName]

  if (!compiler) return null

  const contract = compiler.getContract(contractName)

  return {
    name: contractName,
    contract: contract,
    compiler: compiler,
    abi: contract.object.abi,
    bytecodeObject: contract.object.evm.bytecode.object,
    bytecodeLinkReferences: contract.object.evm.bytecode.linkReferences,
    object: contract.object,
    deployedBytecode: contract.object.evm.deployedBytecode,
    getConstructorInterface: () => {
      return execution.txHelper.getConstructorInterface(contract.object.abi)
    },
    getConstructorInputs: () => {
      const constructorInterface = execution.txHelper.getConstructorInterface(contract.object.abi)
      return execution.txHelper.inputParametersDeclarationToString(constructorInterface.inputs)
    },
    isOverSizeLimit: async (args: string) => {
      const encodedParams = await execution.txFormat.encodeParams(args, execution.txHelper.getConstructorInterface(contract.object.abi))
      const bytecode = contract.object.evm.bytecode.object + (encodedParams as any).dataHex
      // https://eips.ethereum.org/EIPS/eip-3860
      const initCodeOversize = bytecode && (bytecode.length / 2 > 2 * 24576)
      const deployedBytecode = contract.object.evm.deployedBytecode
      // https://eips.ethereum.org/EIPS/eip-170
      const deployedBytecodeOversize = deployedBytecode && (deployedBytecode.object.length / 2 > 24576)
      return {
        overSizeEip3860: initCodeOversize,
        overSizeEip170: deployedBytecodeOversize
      }
    },
    metadata: contract.object.metadata
  }
}