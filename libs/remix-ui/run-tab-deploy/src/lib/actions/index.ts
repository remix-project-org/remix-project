import React from "react"
import { Actions, CompilationRawResult, OZDeployMode, VisitedContract, NetworkDeploymentFile } from "../types"
import { trackMatomoEvent } from "@remix-api"
import { CompilerAbstract } from "@remix-project/remix-solidity"
import type { ContractData, SolcBuildFile } from "@remix-project/core-plugin"
import { execution } from '@remix-project/remix-lib'
import { IntlShape } from "react-intl"
import { deployWithProxyMsg, isOverSizePrompt, logBuilder, unavailableProxyLayoutMsg, upgradeReportMsg, upgradeWithProxyMsg } from "@remix-ui/helper"
import { SolcInput, SolcOutput } from "@openzeppelin/upgrades-core"
import { isAddress } from "ethers"
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import type { DeployPlugin } from "apps/remix-ide/src/app/udapp/udappDeploy"
// Used direct path to UpgradeableContract class to fix cyclic dependency error from @openzeppelin/upgrades-core library
import { UpgradeableContract } from '../../../../../../node_modules/@openzeppelin/upgrades-core/dist/standalone'

export async function broadcastCompilationResult (compilerName: string, compileRawResult: CompilationRawResult, plugin: DeployPlugin, dispatch: React.Dispatch<Actions>) {
  const { file, source, languageVersion, data, input } = compileRawResult
  await trackMatomoEvent(plugin, { category: 'udapp', action: 'broadcastCompilationResult', name: compilerName, isClick: false })

  const compiler = new CompilerAbstract(languageVersion, data, source, input)
  await plugin.call('compilerArtefacts', 'saveCompilerAbstract', file, compiler)

  const contracts = getCompiledContracts(compiler)
  if (contracts.length > 0) {
    contracts.forEach(async (contract) => {
      if (contract.contract.file !== source.target) {
        dispatch({ type: 'UPDATE_COMPILED_CONTRACT', payload: { name: contract.name, filePath: file, contractData: contract, isUpgradeable: false } })
      } else {
        const isUpgradeable = await plugin.call('openzeppelin-proxy', 'isConcerned', data.sources && data.sources[file] ? data.sources[file].ast : {})

        let deployOptions = null
        if (isUpgradeable) {
          try {
            const contractProxyOptions = await plugin.call('openzeppelin-proxy', 'getProxyOptions', data, file)

            deployOptions = contractProxyOptions[contract.name].initializeOptions.inputs
          } catch (error) {
            console.error('Error fetching proxy options:', error)
          }
        }
        dispatch({ type: 'UPDATE_COMPILED_CONTRACT', payload: { name: contract.name, filePath: file, contractData: contract, isUpgradeable: isUpgradeable, deployOptions } })
      }
    })
  }
}

function getCompiledContracts (compiler: CompilerAbstract) {
  const contracts: ContractData[] = []

  compiler.visitContracts((contract: VisitedContract) => {
    const contractData = getContractData(contract.name, compiler)

    if (contractData && contractData.bytecodeObject.length !== 0) {
      contracts.push(contractData)
    }
  })
  return contracts
}

export function getContractData (contractName: string, compiler: CompilerAbstract): ContractData {
  if (!contractName) return null
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

export async function deployContract(selectedContract: ContractData, args: string, deployMode: OZDeployMode, isVerifyChecked: boolean, plugin: DeployPlugin, intl: IntlShape, dispatch: React.Dispatch<Actions>) {
  const isProxyDeployment = deployMode.deployWithProxy
  const isContractUpgrade = deployMode.upgradeWithProxy

  if (selectedContract.bytecodeObject.length === 0) {
    return plugin.call('notification', 'modal', {
      title: intl.formatMessage({ id: 'udapp.alert' }),
      message: intl.formatMessage({ id: 'udapp.thisContractMayBeAbstract' }),
      okLabel: intl.formatMessage({ id: 'udapp.ok' }),
      cancelLabel: intl.formatMessage({ id: 'udapp.cancel' })
    })
  } else {
    // if (selectedContract.name !== currentContract && selectedContract.name === 'ERC1967Proxy') selectedContract.name = currentContract

    if (isProxyDeployment) {
      plugin.call('notification', 'modal', {
        id: 'confirmProxyDeployment',
        title: 'Deploy Implementation & Proxy (ERC1967)',
        message: deployWithProxyMsg(),
        okLabel: intl.formatMessage({ id: 'udapp.proceed' }),
        okFn: async () => {
          try {
            const contract = await createInstance(selectedContract, args, deployMode, false, plugin)
            const initABI = contract.selectedContract.abi.find(abi => abi.name === 'initialize')

            await plugin.call('openzeppelin-proxy', 'executeUUPSProxy', contract.address, deployMode.deployArgs, initABI, contract.selectedContract)
          } catch (error) {
            console.error(`creation of ${selectedContract.name} errored: ${error.message ? error.message : error}`)
            plugin.call('terminal', 'logHtml', logBuilder(`creation of ${selectedContract.name} errored: ${error.message ? error.message : error}`))
          }
        },
        cancelLabel: intl.formatMessage({ id: 'udapp.cancel' }),
        cancelFn: () => {}
      })
    } else if (isContractUpgrade) {
      if (deployMode.deployArgs === '') {
        console.error('Proxy address is required')
      } else {
        const isValidProxyAddress = await isValidContractAddress(plugin, deployMode.deployArgs)

        if (isValidProxyAddress) {
          const solcVersion = selectedContract.metadata ? JSON.parse(selectedContract.metadata).compiler.version : ''
          const upgradeReport: any = await isValidContractUpgrade(plugin, deployMode.deployArgs, selectedContract.name, selectedContract.compiler.source, selectedContract.compiler.data, solcVersion)

          if (upgradeReport.ok) {
            showUpgradeModal(selectedContract, args, deployMode, plugin, intl, dispatch)
          } else {
            if (upgradeReport.warning) {
              plugin.call('notification', 'modal', {
                id: 'proxyUpgradeWarning',
                title: 'Proxy Upgrade Warning',
                message: unavailableProxyLayoutMsg(),
                okLabel: 'Proceed',
                okFn: () => {
                  showUpgradeModal(selectedContract, args, deployMode, plugin, intl, dispatch)
                },
                cancelLabel: intl.formatMessage({ id: 'udapp.cancel' }),
                cancelFn: () => {}
              })
            } else {
              plugin.call('notification', 'modal', {
                id: 'proxyUpgradeError',
                title: 'Proxy Upgrade Error',
                message: upgradeReportMsg(upgradeReport),
                okLabel: 'Continue anyway ',
                okFn: () => {
                  showUpgradeModal(selectedContract, args, deployMode, plugin, intl, dispatch)
                },
                cancelLabel: intl.formatMessage({ id: 'udapp.cancel' }),
                cancelFn: () => {}
              })
            }
          }
        } else {
          console.error(intl.formatMessage({ id: 'udapp.proxyAddressError2' }))
        }
      }
    } else {
      try {
        await createInstance(selectedContract, args, deployMode, isVerifyChecked, plugin)
      } catch (error) {
        plugin.call('terminal', 'logHtml', logBuilder(error.message))
      }
    }
  }
}

async function createInstance(selectedContract: ContractData, args, deployMode: OZDeployMode, isVerifyChecked: boolean, plugin: DeployPlugin) {
  let contractMetadata
  try {
    contractMetadata = await plugin.call('compilerMetadata', 'deployMetadataOf', selectedContract.name, selectedContract.contract.file)
  } catch (error) {
    // return statusCb(`creation of ${selectedContract.name} errored: ${error.message ? error.message : error}`)
  }
  const compilerContracts = await plugin.call('compilerArtefacts', 'getLastCompilationResult')
  const currentParams = !deployMode.deployWithProxy && !deployMode.upgradeWithProxy ? args : ''
  let overSize
  try {
    overSize = await selectedContract.isOverSizeLimit(currentParams)
  } catch (error) {
    // return statusCb(`creation of ${selectedContract.name} errored: ${error.message ? error.message : error}`)
  }
  if (overSize && (overSize.overSizeEip170 || overSize.overSizeEip3860)) {
    return new Promise((resolve, reject) => {
      plugin.call('notification', 'modal', {
        id: 'contractCodeSizeOverLimit',
        title: 'Contract code size over limit',
        message: isOverSizePrompt(overSize),
        okLabel: 'Force Send',
        okFn: async () => {
          await deployOnBlockchain(selectedContract, args, contractMetadata, compilerContracts, plugin)
          resolve(undefined)
        },
        cancelLabel: 'Cancel',
        cancelFn: () => {
          reject(`creation of ${selectedContract.name} canceled by user.`)
        }
      })
    })
  }
  const result = await deployOnBlockchain(selectedContract, args, contractMetadata, compilerContracts, plugin)
  await plugin.call('udappDeployedContracts', 'addInstance', result.address, selectedContract.contract.abi, selectedContract.name, selectedContract)
  const data = await plugin.call('compilerArtefacts', 'getCompilerAbstract', selectedContract.contract.file)
  await plugin.call('compilerArtefacts', 'addResolvedContract', result.address, data)

  if (isVerifyChecked) {
    // trackMatomoEvent(plugin, { category: 'udapp', action: 'DeployAndPublish', name: plugin.REACT_API.networkName, isClick: true })

    try {
      const status = await plugin.call('blockchain', 'detectNetwork')
      const currentChainId = parseInt(status.id)
      const response = await fetch('https://chainid.network/chains.json')

      if (!response.ok) throw new Error('Could not fetch chains list from chainid.network.')
      const allChains = await response.json()
      const currentChain = allChains.find(chain => chain.chainId === currentChainId)

      if (!currentChain) {
        console.error('Could not find chain data for Chain ID: ', currentChainId)
        // const errorMsg = `Could not find chain data for Chain ID: ${currentChainId}. Verification cannot proceed.`
        // const errorLog = logBuilder(errorMsg)
        // terminalLogger(plugin, errorLog)
        return
      }

      const etherscanApiKey = await plugin.call('config', 'getAppParameter', 'etherscan-access-token')

      const verificationData = {
        chainId: currentChainId.toString(),
        currentChain: currentChain,
        address: result.address,
        contractName: selectedContract.name,
        filePath: selectedContract.contract.file,
        compilationResult: await plugin.call('compilerArtefacts', 'getCompilerAbstract', selectedContract.contract.file),
        constructorArgs: args,
        etherscanApiKey: etherscanApiKey
      }

      setTimeout(async () => {
        await plugin.call('contract-verification', 'verifyOnDeploy', verificationData)
      }, 1500)

    } catch (e) {
      console.error('Verification setup failed: ', e)
      // const errorMsg = `Verification setup failed: ${e.message}`
      // const errorLog = logBuilder(errorMsg)
      // terminalLogger(plugin, errorLog)
    }
  }
  return result
}

async function deployOnBlockchain (selectedContract: ContractData, args: string, contractMetadata: any, compilerContracts: any, plugin: DeployPlugin) {
  // trackMatomoEvent(plugin, { category: 'udapp', action: 'DeployContractTo', name: plugin.REACT_API.networkName, isClick: true })
  if (!contractMetadata || (contractMetadata && contractMetadata.autoDeployLib)) {
    return await plugin.call('blockchain', 'deployContractAndLibraries', selectedContract, args, contractMetadata, compilerContracts)
  }
  if (Object.keys(selectedContract.bytecodeLinkReferences).length) {
    // statusCb(`linking ${JSON.stringify(selectedContract.bytecodeLinkReferences, null, '\t')} using ${JSON.stringify(contractMetadata.linkReferences, null, '\t')}`)
  }
  return await plugin.call('blockchain', 'deployContractWithLibrary', selectedContract, args, contractMetadata, compilerContracts)
}

function showUpgradeModal(selectedContract: ContractData, args: string, deployMode: OZDeployMode, plugin: DeployPlugin, intl: IntlShape, dispatch: React.Dispatch<Actions>) {
  plugin.call('notification', 'modal', {
    id: 'deployImplementationAndUpdateProxy',
    title: 'Deploy Implementation & Update Proxy',
    message: upgradeWithProxyMsg(),
    okLabel: intl.formatMessage({ id: 'udapp.proceed' }),
    okFn: async () => {
      try {
        const contract = await createInstance(selectedContract, args, deployMode, false, plugin)
        await plugin.call('openzeppelin-proxy', 'executeUUPSContractUpgrade', deployMode.deployArgs, contract.address, contract.selectedContract)
      } catch (error) {
        plugin.call('terminal', 'logHtml', logBuilder(error.message))
      }
    },
    cancelLabel: intl.formatMessage({ id: 'udapp.cancel' }),
    cancelFn: () => {}
  })
}

export async function getNetworkProxyAddresses (plugin: DeployPlugin) {
  const networkStatus = await plugin.call('blockchain', 'detectNetwork')
  const networkName = networkStatus.name === 'VM' ? await plugin.call('blockchain', 'getProvider') : networkStatus.name
  const identifier = networkName === 'custom' ? networkName + '-' + networkStatus.id : networkName
  const networkDeploymentsExists = await plugin.call('fileManager', 'exists', `.deploys/upgradeable-contracts/${identifier}/UUPS.json`)

  if (networkDeploymentsExists) {
    const networkFile: string = await plugin.call('fileManager', 'readFile', `.deploys/upgradeable-contracts/${identifier}/UUPS.json`)
    const parsedNetworkFile: NetworkDeploymentFile = JSON.parse(networkFile)
    const deployments = []

    for (const proxyAddress of Object.keys(parsedNetworkFile.deployments)) {
      if (parsedNetworkFile.deployments[proxyAddress] && parsedNetworkFile.deployments[proxyAddress].implementationAddress) {
        const solcBuildExists = await plugin.call('fileManager', 'exists', `.deploys/upgradeable-contracts/${identifier}/solc-${parsedNetworkFile.deployments[proxyAddress].implementationAddress}.json`)

        if (solcBuildExists) deployments.push({ address: proxyAddress, date: parsedNetworkFile.deployments[proxyAddress].date, contractName: parsedNetworkFile.deployments[proxyAddress].contractName })
      }
    }
    return deployments
  }
}

async function isValidContractAddress (plugin: DeployPlugin, address: string) {
  if (!address) {
    return false
  } else {
    if (isAddress(address)) {
      return (await plugin.call('blockchain', 'web3')).getCode(address) !== '0x'
    } else {
      return false
    }
  }
}

export async function isValidContractUpgrade (plugin: DeployPlugin, proxyAddress: string, newContractName: string, solcInput: SolcInput, solcOutput: SolcOutput, solcVersion: string) {
  // build current contract first to get artefacts.
  const networkStatus = await plugin.call('blockchain', 'detectNetwork')
  const networkName = networkStatus.name === 'VM' ? await plugin.call('blockchain', 'getProvider') : networkStatus.name
  const identifier = networkName === 'custom' ? networkName + '-' + networkStatus.id : networkName
  const networkDeploymentsExists = await plugin.call('fileManager', 'exists', `.deploys/upgradeable-contracts/${identifier}/UUPS.json`)

  if (networkDeploymentsExists) {
    const networkFile: string = await plugin.call('fileManager', 'readFile', `.deploys/upgradeable-contracts/${identifier}/UUPS.json`)
    const parsedNetworkFile: NetworkDeploymentFile = JSON.parse(networkFile)

    if (parsedNetworkFile.deployments[proxyAddress] && parsedNetworkFile.deployments[proxyAddress].implementationAddress) {
      const solcBuildExists = await plugin.call('fileManager', 'exists', `.deploys/upgradeable-contracts/${identifier}/solc-${parsedNetworkFile.deployments[proxyAddress].implementationAddress}.json`)

      if (solcBuildExists) {
        const solcFile: string = await plugin.call('fileManager', 'readFile', `.deploys/upgradeable-contracts/${identifier}/solc-${parsedNetworkFile.deployments[proxyAddress].implementationAddress}.json`)
        const parsedSolcFile: SolcBuildFile = JSON.parse(solcFile)
        const oldImpl = new UpgradeableContract(parsedNetworkFile.deployments[proxyAddress].contractName, parsedSolcFile.solcInput, parsedSolcFile.solcOutput, { kind: 'uups' }, solcVersion)
        const newImpl = new UpgradeableContract(newContractName, solcInput, solcOutput, { kind: 'uups' }, solcVersion)
        const report = oldImpl.getStorageUpgradeReport(newImpl, { kind: 'uups' })

        return report
      } else {
        return { ok: false, pass: false, warning: true }
      }
    } else {
      return { ok: false, pass: false, warning: true }
    }
  } else {
    return { ok: false, pass: false, warning: true }
  }
}

export async function addContractFile (filePath: string, plugin: DeployPlugin, dispatch: React.Dispatch<Actions>) {
  if (filePath && filePath.endsWith('.sol')) {
    const contract: string = await plugin.call('fileManager', 'readFile', filePath)

    if (contract) {
      let contractName = null
      const match = contract.match(/contract\s+([A-Za-z_][A-Za-z0-9_]*)/)
      if (match) {
        contractName = match[1]
      }
      if (contractName) {
        dispatch({ type: 'ADD_CONTRACT_FILE', payload: { name: contractName, filePath } })
      }
    }
  } else if (filePath && filePath.endsWith('.yul')) {
    const contract: string = await plugin.call('fileManager', 'readFile', filePath)

    if (contract) {
      let contractName = null
      const match = contract.match(/object\s+"([^"]+)"/)
      if (match) {
        contractName = match[1]
      }
      if (contractName) {
        dispatch({ type: 'ADD_CONTRACT_FILE', payload: { name: contractName, filePath } })
      }
    }
  }
}
