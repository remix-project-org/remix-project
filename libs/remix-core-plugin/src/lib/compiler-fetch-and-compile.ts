import { Plugin } from '@remixproject/engine'
import { compile, Language } from '@remix-project/remix-solidity'
import { util } from '@remix-project/remix-lib'
import { toChecksumAddress } from '@ethereumjs/util'
import { fetchContractFromEtherscan } from './helpers/fetch-etherscan'
import { fetchContractFromSourcify } from './helpers/fetch-sourcify'
import { UUPSDeployedByteCode, UUPSCompilerVersion, UUPSOptimize, UUPSRuns, UUPSEvmVersion, UUPSLanguage, UUPSDeployedByteCodeV5, UUPSCompilerVersionV5, UUPSEvmVersionv5, UUPSOptimizev5 } from './constants/uups'

const profile = {
  name: 'fetchAndCompile',
  methods: ['resolve', 'clearCache'],
  version: '0.0.1'
}

export class FetchAndCompile extends Plugin {
  unresolvedAddresses: any[]
  sourceVerifierNetWork: string[]
  constructor () {
    super(profile)
    this.unresolvedAddresses = []
    this.sourceVerifierNetWork = ['Main', 'Sepolia']
  }

  /**
   * Clear the cache
   *
   */
  async clearCache () {
    this.unresolvedAddresses = []
  }

  /**
   * Fetch compilation metadata from source-Verify from a given @arg contractAddress - https://github.com/ethereum/source-verify
   * Put the artifacts in the file explorer
   * Compile the code using Solidity compiler
   * Returns compilation data
   *
   * @param {string} contractAddress - Address of the contract to resolve
   * @param {string} deployedBytecode - deployedBytecode of the contract
   * @param {string} targetPath - Folder where to save the compilation artifacts
   * @return {CompilerAbstract} - compilation data targeting the given @arg contractAddress
   */
  async resolve (contractAddress, codeAtAddress, targetPath) {
    contractAddress = toChecksumAddress(contractAddress)

    const localCompilation = async () => {
      const contractData = await this.call('compilerArtefacts', 'getContractDataFromByteCode', codeAtAddress)
      if (contractData) {
        return await this.call('compilerArtefacts', 'getCompilerAbstract', contractData.file)
      }
      else
        return await this.call('compilerArtefacts', 'get', '__last')
    }

    const resolved = await this.call('compilerArtefacts', 'get', contractAddress)
    if (resolved) return resolved
    if (this.unresolvedAddresses.includes(contractAddress)) return localCompilation()

    if (codeAtAddress === '0x' + UUPSDeployedByteCode) { // proxy
      const settings = {
        evmVersion: UUPSEvmVersion,
        optimize: UUPSOptimize,
        runs: UUPSRuns
      }
      const proxyUrl = 'https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.0/contracts/proxy/ERC1967/ERC1967Proxy.sol'
      const compilationTargets = {
        'proxy.sol': { content: `import "${proxyUrl}";` }
      }
      const compData = await compile(
        compilationTargets,
        settings,
        UUPSLanguage,
        UUPSCompilerVersion,
        async (url, cb) => {
          // we first try to resolve the content from the compilation target using a more appropriate path
          const path = `${targetPath}/${url}`
          if (compilationTargets[path] && compilationTargets[path].content) {
            return cb(null, compilationTargets[path].content)
          } else {
            await this.call('contentImport', 'resolveAndSave', url).then((result) => cb(null, result)).catch((error) => cb(error.message))
          }
        })
      await this.call('compilerArtefacts', 'addResolvedContract', contractAddress, compData)
      return compData
    }

    if (codeAtAddress === '0x' + UUPSDeployedByteCodeV5) { // proxy
      const settings = {
        evmVersion: UUPSEvmVersionv5,
        optimize: UUPSOptimizev5,
        runs: UUPSRuns
      }
      const proxyUrl = 'https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.0/contracts/proxy/ERC1967/ERC1967Proxy.sol'
      const compilationTargets = {
        'proxy.sol': { content: `import "${proxyUrl}";` }
      }
      const compData = await compile(
        compilationTargets,
        settings,
        UUPSLanguage,
        UUPSCompilerVersionV5,
        async (url, cb) => {
          // we first try to resolve the content from the compilation target using a more appropriate path
          const path = `${targetPath}/${url}`
          if (compilationTargets[path] && compilationTargets[path].content) {
            return cb(null, compilationTargets[path].content)
          } else {
            await this.call('contentImport', 'resolveAndSave', url).then((result) => cb(null, result)).catch((error) => cb(error.message))
          }
        })
      await this.call('compilerArtefacts', 'addResolvedContract', contractAddress, compData)
      return compData
    }

    // sometimes when doing an internal call, the only available artifact is the Solidity interface.
    // resolving addresses of internal call would allow to step over the source code, even if the declaration was made using an Interface.

    let network
    try {
      network = await this.call('network', 'detectNetwork')
    } catch (e) {
      return localCompilation()
    }
    if (!network) return localCompilation()
    if (!this.sourceVerifierNetWork.includes(network.name)) {
      // check if the contract if part of the local compilation result
      const compilation = await localCompilation()
      if (compilation) {
        let found = false
        compilation.visitContracts((contract) => {
          found = util.compareByteCode(codeAtAddress, '0x' + contract.object.evm.deployedBytecode.object)
          return found
        })
        if (found) {
          await this.call('compilerArtefacts', 'addResolvedContract', contractAddress, compilation)
          return compilation
        }
      }
    }

    targetPath = `${targetPath}/${network.id}/${contractAddress}`
    let data
    try {
      data = await fetchContractFromSourcify(this, network, contractAddress, targetPath)
    } catch (e) {
      this.call('notification', 'toast', e.message)
      console.log(e) // and fallback to getting the compilation result from etherscan
    }

    if (!data) {
      this.call('notification', 'toast', `contract ${contractAddress} not found in Sourcify, checking in Etherscan..`)
      try {
        data = await fetchContractFromEtherscan(this, network, contractAddress, targetPath)
      } catch (e) {
        this.call('notification', 'toast', e.message)
        setTimeout(_ => this.emit('notFound', contractAddress), 0) // plugin framework returns a time out error although it actually didn't find the source...
        this.unresolvedAddresses.push(contractAddress)
        return localCompilation()
      }
    }

    if (!data) {
      setTimeout(_ => this.emit('notFound', contractAddress), 0)
      this.unresolvedAddresses.push(contractAddress)
      const compilation = await localCompilation()
      if (compilation) {
        let found = false
        compilation.visitContracts((contract) => {
          found = util.compareByteCode(codeAtAddress, '0x' + contract.object.evm.deployedBytecode.object)
          return found
        })
        if (found) {
          await this.call('compilerArtefacts', 'addResolvedContract', contractAddress, compilation)
          return compilation
        }
      }
    }
    const { config, compilationTargets, version } = data
    /*
    * If the remappings are defined in the config, we need to update them to point to the targetPath
    * it's beeing disabled for the moment.
    */
    /*if (config && config.settings && config.settings.remappings) {
      console.log(config.settings.remappings)
      config.settings.remappings = config.settings.remappings.map((remapping) => {
        let [virtual, path] = remapping.split('=')
        if (virtual.includes(':')) {
          let [scope, path] = virtual.split(':')
          virtual = `${targetPath}/${scope}:${path}`
        }
        return `${virtual}=${targetPath}/${path}`
      })
    }*/

    try {
      setTimeout(_ => this.emit('compiling', config.settings), 0)
      const compData = await compile(
        compilationTargets,
        config.settings,
        config.language as Language,
        version as string,
        async (url, cb) => {
          // we first try to resolve the content from the compilation target using a more appropriate path
          const path = `${targetPath}/${url}`
          if (compilationTargets[path] && compilationTargets[path].content) {
            return cb(null, compilationTargets[path].content)
          } else {
            cb('dependency not found ' + url)
          }
        })
      await this.call('compilerArtefacts', 'addResolvedContract', contractAddress, compData)
      return compData
    } catch (e) {
      this.unresolvedAddresses.push(contractAddress)
      setTimeout(_ => this.emit('compilationFailed'), 0)
      return localCompilation()
    }
  }
}
