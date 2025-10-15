import { ContractData, FuncABI, NetworkDeploymentFile, SolcBuildFile, OverSizeLimit } from "@remix-project/core-plugin"
import { trackMatomoEvent } from '@remix-api'
import { RunTab } from "../types/run-tab"
import { CompilerAbstract as CompilerAbstractType } from '@remix-project/remix-solidity'
import * as remixLib from '@remix-project/remix-lib'
import { SolcInput, SolcOutput } from "@openzeppelin/upgrades-core"
// Used direct path to UpgradeableContract class to fix cyclic dependency error from @openzeppelin/upgrades-core library
import { UpgradeableContract } from '../../../../../../node_modules/@openzeppelin/upgrades-core/dist/standalone'
import { DeployMode, MainnetPrompt } from "../types"
import { displayNotification, fetchProxyDeploymentsSuccess, setDecodedResponse, updateInstancesBalance } from "./payload"
import { addInstance } from "./actions"
import { addressToString, logBuilder } from "@remix-ui/helper"
import { Web3 } from "web3"

const txHelper = remixLib.execution.txHelper
const txFormat = remixLib.execution.txFormat

const loadContractFromAddress = (plugin: RunTab, address, confirmCb, cb) => {
  if (/\.(abi)$/.exec(plugin.config.get('currentFile'))) {
    confirmCb(() => {
      let abi
      try {
        abi = JSON.parse(plugin.editor.currentContent())
        if (!Array.isArray(abi)) return cb('ABI should be an array object.')
      } catch (e) {
        return cb('Failed to parse the current file as JSON ABI.')
      }
      trackMatomoEvent(plugin, { category: 'udapp', action: 'useAtAddress', name: 'AtAddressLoadWithABI', isClick: true })
      cb(null, 'abi', abi)
    })
  } else {
    trackMatomoEvent(plugin, { category: 'udapp', action: 'useAtAddress', name: 'AtAddressLoadWithArtifacts', isClick: true })
    cb(null, 'instance')
  }
}

export const getSelectedContract = (contractName: string, compiler: CompilerAbstractType): ContractData => {
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
      return txHelper.getConstructorInterface(contract.object.abi)
    },
    getConstructorInputs: () => {
      const constructorInterface = txHelper.getConstructorInterface(contract.object.abi)

      return txHelper.inputParametersDeclarationToString(constructorInterface.inputs)
    },
    isOverSizeLimit: async (args: string) => {
      const encodedParams = await txFormat.encodeParams(args, txHelper.getConstructorInterface(contract.object.abi))
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

const getCompilerContracts = (plugin: RunTab) => {
  return plugin.compilersArtefacts.__last.getData().contracts
}

export const terminalLogger = (plugin: RunTab, view: JSX.Element) => {
  plugin.call('terminal', 'logHtml', view)
}

export const confirmationHandler = (plugin: RunTab, dispatch: React.Dispatch<any>, confirmDialogContent: MainnetPrompt, network, tx, gasEstimation, continueTxExecution, cancelCb) => {
  if (network.name !== 'Main') {
    return continueTxExecution(null)
  }
  const amount = plugin.blockchain.fromWei(tx.value, true, 'ether')
  const content = confirmDialogContent(tx, network, amount, gasEstimation, plugin.blockchain.determineGasFees(tx), plugin.blockchain.determineGasPrice.bind(plugin.blockchain))

  dispatch(displayNotification('Confirm transaction', content, 'Confirm', 'Cancel', () => {
    plugin.blockchain.config.setUnpersistedProperty('doNotShowTransactionConfirmationAgain', plugin.REACT_API.confirmSettings)
    // TODO: check if this is check is still valid given the refactor
    if (!plugin.REACT_API.gasPriceStatus) {
      cancelCb('Given transaction fee is not correct')
    } else {
      continueTxExecution({ maxFee: plugin.REACT_API.maxFee, maxPriorityFee: plugin.REACT_API.maxPriorityFee, baseFeePerGas: plugin.REACT_API.baseFeePerGas, gasPrice: plugin.REACT_API.gasPrice })
    }
  }, () => {
    return cancelCb('Transaction canceled by user.')
  }))
}

const getConfirmationCb = (plugin: RunTab, dispatch: React.Dispatch<any>, confirmDialogContent: MainnetPrompt) => {
  // this code is the same as in recorder.js. TODO need to be refactored out
  return (network, tx, gasEstimation, continueTxExecution, cancelCb) => {
    confirmationHandler(plugin, dispatch, confirmDialogContent, network, tx, gasEstimation, continueTxExecution, cancelCb)
  }
}

export const continueHandler = (dispatch: React.Dispatch<any>, gasEstimationPrompt: (msg: string) => JSX.Element, error, continueTxExecution, cancelCb) => {
  if (error) {
    let msg = ''
    if (typeof error === 'string') {
      msg = error
    }
    if (error && error.innerError) {
      msg += '\n' + error.innerError
    }
    if (error && error.message) {
      msg += '\n' + error.message
    }
    if (error && error.error) {
      msg += '\n' + error.error
    }

    if (msg.includes('invalid opcode')) msg += '\nThe EVM version used by the selected environment is not compatible with the compiler EVM version.'

    dispatch(displayNotification('Gas estimation failed', gasEstimationPrompt(msg), 'Send Transaction', 'Cancel Transaction', () => {
      continueTxExecution()
    }, () => {
      cancelCb(error)
    }))
  } else {
    continueTxExecution()
  }
}

export const promptHandler = (dispatch: React.Dispatch<any>, passphrasePrompt, okCb, cancelCb) => {
  dispatch(displayNotification('Passphrase requested', passphrasePrompt('Personal mode is enabled. Please provide passphrase of account'), 'OK', 'Cancel', okCb, cancelCb))
}

export const createInstance = async (
  plugin: RunTab,
  dispatch: React.Dispatch<any>,
  selectedContract: ContractData,
  gasEstimationPrompt: (msg: string) => JSX.Element,
  passphrasePrompt: (msg: string) => JSX.Element,
  publishToStorage: (storage: 'ipfs' | 'swarm',
  contract: ContractData) => void,
  mainnetPrompt: MainnetPrompt,
  isOverSizePrompt: (values: OverSizeLimit) => JSX.Element,
  args,
  deployMode: DeployMode[],
  isVerifyChecked: boolean) => {
  const isProxyDeployment = (deployMode || []).find(mode => mode === 'Deploy with Proxy')
  const isContractUpgrade = (deployMode || []).find(mode => mode === 'Upgrade with Proxy')
  const statusCb = (msg: string) => {
    const log = logBuilder(msg)

    return terminalLogger(plugin, log)
  }

  const finalCb = async (error, contractObject, address) => {
    if (error) {
      const log = logBuilder(error)
      return terminalLogger(plugin, log)
    }

    addInstance(dispatch, { contractData: contractObject, address, name: contractObject.name })
    const data = await plugin.compilersArtefacts.getCompilerAbstract(contractObject.contract.file)
    plugin.compilersArtefacts.addResolvedContract(addressToString(address), data)

    if (isVerifyChecked) {
      trackMatomoEvent(plugin, { category: 'udapp', action: 'DeployAndPublish', name: plugin.REACT_API.networkName, isClick: true })

      try {
        const status = plugin.blockchain.getCurrentNetworkStatus()
        if (status.error || !status.network) {
          throw new Error(`Could not get network status: ${status.error || 'Unknown error'}`)
        }
        const currentChainId = parseInt(status.network.id)

        const response = await fetch('https://chainid.network/chains.json')
        if (!response.ok) throw new Error('Could not fetch chains list from chainid.network.')
        const allChains = await response.json()
        const currentChain = allChains.find(chain => chain.chainId === currentChainId)

        if (!currentChain) {
          const errorMsg = `The current network (Chain ID: ${currentChainId}) is not supported for verification via this plugin. Please switch to a supported network like Sepolia or Mainnet.`
          const errorLog = logBuilder(errorMsg)
          terminalLogger(plugin, errorLog)
          return
        }

        const etherscanApiKey = await plugin.call('config', 'getAppParameter', 'etherscan-access-token')

        const verificationData = {
          chainId: currentChainId.toString(),
          currentChain: currentChain,
          contractAddress: addressToString(address),
          contractName: selectedContract.name,
          compilationResult: await plugin.compilersArtefacts.getCompilerAbstract(selectedContract.contract.file),
          constructorArgs: args,
          etherscanApiKey: etherscanApiKey
        }

        setTimeout(async () => {
          await plugin.call('contract-verification', 'verifyOnDeploy', verificationData)
        }, 1500)

      } catch (e) {
        const errorMsg = `Verification setup failed: ${e.message}`
        const errorLog = logBuilder(errorMsg)
        terminalLogger(plugin, errorLog)
      }

    } else {
      trackMatomoEvent(plugin, { category: 'udapp', action: 'DeployOnly', name: plugin.REACT_API.networkName, isClick: true })
    }

    if (isProxyDeployment) {
      const initABI = contractObject.abi.find(abi => abi.name === 'initialize')
      plugin.call('openzeppelin-proxy', 'executeUUPSProxy', addressToString(address), args, initABI, contractObject)
    } else if (isContractUpgrade) {
      plugin.call('openzeppelin-proxy', 'executeUUPSContractUpgrade', args, addressToString(address), contractObject)
    }
  }

  let contractMetadata
  try {
    contractMetadata = await plugin.call('compilerMetadata', 'deployMetadataOf', selectedContract.name, selectedContract.contract.file)
  } catch (error) {
    return statusCb(`creation of ${selectedContract.name} errored: ${error.message ? error.message : error}`)
  }

  const compilerContracts = getCompilerContracts(plugin)
  const confirmationCb = getConfirmationCb(plugin, dispatch, mainnetPrompt)

  const currentParams = !isProxyDeployment && !isContractUpgrade ? args : ''
  let overSize
  try {
    overSize = await selectedContract.isOverSizeLimit(currentParams)
  } catch (error) {
    return statusCb(`creation of ${selectedContract.name} errored: ${error.message ? error.message : error}`)
  }
  if (overSize && (overSize.overSizeEip170 || overSize.overSizeEip3860)) {
    return dispatch(displayNotification('Contract code size over limit', isOverSizePrompt(overSize), 'Force Send', 'Cancel', () => {
      deployContract(plugin, selectedContract, currentParams, contractMetadata, compilerContracts, {
        continueCb: (error, continueTxExecution, cancelCb) => {
          continueHandler(dispatch, gasEstimationPrompt, error, continueTxExecution, cancelCb)
        },
        promptCb: (okCb, cancelCb) => {
          promptHandler(dispatch, passphrasePrompt, okCb, cancelCb)
        },
        statusCb,
        finalCb
      }, confirmationCb)
    }, () => {
      const log = logBuilder(`creation of ${selectedContract.name} canceled by user.`)

      return terminalLogger(plugin, log)
    }))
  }
  deployContract(plugin, selectedContract, currentParams, contractMetadata, compilerContracts, {
    continueCb: (error, continueTxExecution, cancelCb) => {
      continueHandler(dispatch, gasEstimationPrompt, error, continueTxExecution, cancelCb)
    },
    promptCb: (okCb, cancelCb) => {
      promptHandler(dispatch, passphrasePrompt, okCb, cancelCb)
    },
    statusCb,
    finalCb
  }, confirmationCb)
}

const deployContract = (plugin: RunTab, selectedContract, args, contractMetadata, compilerContracts, callbacks, confirmationCb) => {
  trackMatomoEvent(plugin, { category: 'udapp', action: 'DeployContractTo', name: plugin.REACT_API.networkName, isClick: true })
  const { statusCb } = callbacks

  if (!contractMetadata || (contractMetadata && contractMetadata.autoDeployLib)) {
    return plugin.blockchain.deployContractAndLibraries(selectedContract, args, contractMetadata, compilerContracts, callbacks, confirmationCb)
  }
  if (Object.keys(selectedContract.bytecodeLinkReferences).length) statusCb(`linking ${JSON.stringify(selectedContract.bytecodeLinkReferences, null, '\t')} using ${JSON.stringify(contractMetadata.linkReferences, null, '\t')}`)
  plugin.blockchain.deployContractWithLibrary(selectedContract, args, contractMetadata, compilerContracts, callbacks, confirmationCb)
}

export const loadAddress = (plugin: RunTab, dispatch: React.Dispatch<any>, contract: ContractData, address: string) => {
  loadContractFromAddress(plugin, address,
    (cb) => {
      dispatch(displayNotification('At Address', `Do you really want to interact with ${address} using the current ABI definition?`, 'OK', 'Cancel', cb, null))
    },
    (error, loadType, abi) => {
      if (error) {
        return dispatch(displayNotification('Alert', error, 'OK', null))
      }
      if (loadType === 'abi') {
        const contractData = { name: '<at address>', abi, contract: { file: plugin.REACT_API.contracts.currentFile } } as ContractData
        return addInstance(dispatch, { contractData, address, name: '<at address>' })
      } else if (loadType === 'instance') {
        if (!contract) return plugin.call('notification', 'toast', 'No compiled contracts found.')
        const currentFile = plugin.REACT_API.contracts.currentFile
        const compiler = plugin.REACT_API.contracts.contractList[currentFile].find(item => item.alias === contract.name)
        const contractData = getSelectedContract(contract.name, compiler.compiler)
        return addInstance(dispatch, { contractData, address, name: contract.name })
      }
    }
  )
}

export const getContext = (plugin: RunTab) => {
  return plugin.blockchain.context()
}

export const syncContractsInternal = async (plugin: RunTab) => {
  if (await plugin.call('manager', 'isActive', 'truffle')) {
    plugin.call('truffle', 'sync')
  }
  if (await plugin.call('manager', 'isActive', 'hardhat')) {
    plugin.call('hardhat', 'sync')
  }
  if (await plugin.call('manager', 'isActive', 'foundry')) {
    plugin.call('foundry', 'sync')
  }
}

export const runTransactions = (
  plugin: RunTab,
  dispatch: React.Dispatch<any>,
  instanceIndex: number,
  lookupOnly: boolean,
  funcABI: FuncABI,
  inputsValues: string,
  contractName: string,
  contractABI, contract,
  address,
  logMsg:string,
  mainnetPrompt: MainnetPrompt,
  gasEstimationPrompt: (msg: string) => JSX.Element,
  passphrasePrompt: (msg: string) => JSX.Element,
  funcIndex?: number) => {
  let callinfo = ''
  let eventAction
  if (lookupOnly) {
    callinfo = 'call'
    eventAction = 'call'
  } else if (funcABI.type === 'fallback' || funcABI.type === 'receive') {
    callinfo = 'lowLevelinteractions'
    eventAction = 'lowLevelinteractions'
  } else {
    callinfo = 'transact'
    eventAction = 'transact'
  }
  trackMatomoEvent(plugin, { category: 'udapp', action: eventAction, name: plugin.REACT_API.networkName, isClick: true })

  const params = funcABI.type !== 'fallback' ? inputsValues : ''
  plugin.blockchain.runOrCallContractMethod(
    contractName,
    contractABI,
    funcABI,
    contract,
    inputsValues,
    address,
    params,
    lookupOnly,
    logMsg,
    (msg) => {
      const log = logBuilder(msg)

      return terminalLogger(plugin, log)
    },
    (returnValue) => {
      const response = txFormat.decodeResponse(returnValue, funcABI)

      dispatch(setDecodedResponse(instanceIndex, response, funcIndex))
    },
    (network, tx, gasEstimation, continueTxExecution, cancelCb) => {
      confirmationHandler(plugin, dispatch, mainnetPrompt, network, tx, gasEstimation, continueTxExecution, cancelCb)
    },
    (error, continueTxExecution, cancelCb) => {
      continueHandler(dispatch, gasEstimationPrompt, error, continueTxExecution, cancelCb)
    },
    (okCb, cancelCb) => {
      promptHandler(dispatch, passphrasePrompt, okCb, cancelCb)
    }
  )
}

export const getFuncABIInputs = (plugin: RunTab, funcABI: FuncABI) => {
  return plugin.blockchain.getInputs(funcABI)
}

export const updateInstanceBalance = async (plugin: RunTab, dispatch: React.Dispatch<any>) => {
  if (plugin.REACT_API?.instances?.instanceList?.length) {
    const instances = plugin.REACT_API?.instances?.instanceList?.length ? plugin.REACT_API?.instances?.instanceList : []
    for (const instance of instances) {
      const balInEth = await plugin.blockchain.getBalanceInEther(instance.address)
      instance.balance = balInEth
    }
    dispatch(updateInstanceBalance(instances, dispatch))
  }
}

export const isValidContractAddress = async (plugin: RunTab, address: string) => {
  if (!address) {
    return false
  } else {
    if (Web3.utils.isAddress(address)) {
      return await plugin.blockchain.web3().eth.getCode(address) !== '0x'
    } else {
      return false
    }
  }
}

export const getNetworkProxyAddresses = async (plugin: RunTab, dispatch: React.Dispatch<any>) => {
  const network = plugin.blockchain.networkStatus.network
  const identifier = network.name === 'custom' ? network.name + '-' + network.id : network.name
  const networkDeploymentsExists = await plugin.call('fileManager', 'exists', `.deploys/upgradeable-contracts/${identifier}/UUPS.json`)

  if (networkDeploymentsExists) {
    const networkFile: string = await plugin.call('fileManager', 'readFile', `.deploys/upgradeable-contracts/${identifier}/UUPS.json`)
    const parsedNetworkFile: NetworkDeploymentFile = JSON.parse(networkFile)
    const deployments = []

    for (const proxyAddress in Object.keys(parsedNetworkFile.deployments)) {
      if (parsedNetworkFile.deployments[proxyAddress] && parsedNetworkFile.deployments[proxyAddress].implementationAddress) {
        const solcBuildExists = await plugin.call('fileManager', 'exists', `.deploys/upgradeable-contracts/${identifier}/solc-${parsedNetworkFile.deployments[proxyAddress].implementationAddress}.json`)

        if (solcBuildExists) deployments.push({ address: proxyAddress, date: parsedNetworkFile.deployments[proxyAddress].date, contractName: parsedNetworkFile.deployments[proxyAddress].contractName })
      }
    }
    dispatch(fetchProxyDeploymentsSuccess(deployments))
  } else {
    dispatch(fetchProxyDeploymentsSuccess([]))
  }
}

export const isValidContractUpgrade = async (plugin: RunTab, proxyAddress: string, newContractName: string, solcInput: SolcInput, solcOutput: SolcOutput, solcVersion: string) => {
  // build current contract first to get artefacts.
  const network = plugin.blockchain.networkStatus.network
  const identifier = network.name === 'custom' ? network.name + '-' + network.id : network.name === 'VM' ? plugin.blockchain.getProvider() : network.name
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
