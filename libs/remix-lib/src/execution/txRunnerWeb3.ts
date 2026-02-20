'use strict'
import { EventManager } from '../eventManager'
import type { Transaction as InternalTransaction, TxResult } from '../index'
import { BrowserProvider, getAddress, parseUnits, formatUnits } from 'ethers'
import { normalizeHexAddress } from '../helpers/uiHelper'
import { aaSupportedNetworks, aaLocalStorageKey, getPimlicoBundlerURL, aaDeterminiticProxyAddress } from '../helpers/aaConstants'
import { randomBytes } from 'crypto'
import "viem/window"
import { custom, http, createWalletClient, createPublicClient, encodePacked, getContractAddress, toHex } from "viem"
import * as chains from "viem/chains"
import { entryPoint07Address } from "viem/account-abstraction"
import { Registry } from '../registry'
const { createSmartAccountClient } = require("permissionless")
const { toSafeSmartAccount } = require("permissionless/accounts")
const { createPimlicoClient } = require("permissionless/clients/pimlico")
import { Plugin } from '@remixproject/engine'
import { toInt } from './typeConversion'

export class TxRunnerWeb3 {
  event
  _api: Plugin

  constructor (wrapperAPI: Plugin) {
    this.event = new EventManager()
    this._api = wrapperAPI
  }

  async _executeTx (tx, network, txFee) {
    if (network && network.lastBlock && network.lastBlock.baseFeePerGas) {
      // the sending stack (web3.js / metamask need to have the type defined)
      // this is to avoid the following issue: https://github.com/MetaMask/metamask-extension/issues/11824
      tx.type = '0x2'
    } else {
      // tx.type = '0x1'
    }
    if (txFee) {
      if (txFee.baseFeePerGas) {
        tx.maxPriorityFeePerGas = toHex(BigInt(parseUnits(txFee.maxPriorityFee, 'gwei')))
        tx.maxFeePerGas = toHex(BigInt(parseUnits(txFee.maxFee, 'gwei')))
        tx.type = '0x2'
      } else {
        tx.gasPrice = toHex(BigInt(parseUnits(txFee.gasPrice, 'gwei')))
        // tx.type = '0x1'
      }
      if (tx.authorizationList) {
        tx.type = '0x4'
      }
    }

    const isCreation = !tx.to
    const provider = tx.provider || await this._api.call('blockchain', 'getProvider')
    const isPersonalMode = provider === 'web3' ? (Registry.getInstance().get('config').api).get('settings/personal-mode') : false

    if (isPersonalMode) {
      return new Promise((resolve, reject) => {
        this._api.call('notification', 'prompt', {
          id: 'passphrase-requested',
          title: 'Passphrase requested',
          message: 'Personal mode is enabled. Please provide passphrase of account',
          defaultValue: '',
          okLabel: 'OK',
          okFn: async (value) => {
            try {
              const web3 = tx.web3 || await this._api.call('blockchain', 'getWeb3')
              const res = await (await web3.getSigner(tx.from || 0)).sendTransaction({ ...tx, value })
              resolve(await this.broadcastTx(tx, res.hash, isCreation, false, null))

            } catch (e) {
              console.log(`Send transaction failed: ${e.message || e.error} . if you use an injected provider, please check it is properly unlocked. `)
              // in case the receipt is available, we consider that only the execution failed but the transaction went through.
              // So we don't consider this to be an error.
              if (e.receipt) resolve(await this.broadcastTx(tx, e.receipt.hash, isCreation, false, null))
              else reject(e)
            }
          },
          cancelLabel: 'Cancel',
          cancelFn: () => {
            reject(new Error('Canceled by user.'))
          }
        })
      })
    } else {
      try {
        if (tx.fromSmartAccount) {
          const { txHash, contractAddress } = await this.sendUserOp(tx, network.id)
          return await this.broadcastTx(tx, txHash, isCreation, true, contractAddress)
        } else {
          const web3 = tx.web3 || await this._api.call('blockchain', 'getWeb3')
          const signer = await web3.getSigner(tx.from)
          const res = await signer.sendTransaction(tx)

          return await this.broadcastTx(tx, res.hash, isCreation, false, null)
        }
      } catch (e) {
        if (!e.message) e.message = ''
        if (e.error) {
          e.message = e.message + ' ' + e.error
        }
        console.log(`Send transaction failed: ${e.message} . if you use an injected provider, please check it is properly unlocked. `)
        // in case the receipt is available, we consider that only the execution failed but the transaction went through.
        // So we don't consider this to be an error.
        if (e.receipt) return await this.broadcastTx(tx, e.receipt.hash, isCreation, false, null)
        else throw (e)
      }
    }
  }

  async broadcastTx (tx, resp, isCreation: boolean, isUserOp, contractAddress) {
    this._api.emit('transactionBroadcasted', [resp, isUserOp])
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      try {
        const web3 = tx.web3 || await this._api.call('blockchain', 'getWeb3')
        const receipt = await tryTillReceiptAvailable(resp, web3)
        const originTo = tx.to
        tx = await tryTillTxAvailable(resp, web3)
        if (isCreation && !receipt.contractAddress) {
          // if it is a isCreation, contractAddress should be defined.
          // if it's not the case look for the event ContractCreated(uint256,address,uint256,bytes32) and extract the address
          // topic id: 0xa1fb700aaee2ae4a2ff6f91ce7eba292f89c2f5488b8ec4c5c5c8150692595c3
          if (receipt.logs && receipt.logs.length) {
            receipt.logs.map((log) => {
              if (log.topics[0] === '0xa1fb700aaee2ae4a2ff6f91ce7eba292f89c2f5488b8ec4c5c5c8150692595c3') {
                (receipt as any).contractAddress = getAddress(normalizeHexAddress(toHex(log.topics[2])))
              }
            })
          }
        }
        if (isUserOp) {
          tx.isUserOp = isUserOp
          tx.originTo = originTo
          if (contractAddress && !receipt.contractAddress) (receipt as any).contractAddress = contractAddress
        }
        resolve({
          receipt,
          tx,
          transactionHash: receipt ? receipt['hash'] : null
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  async execute (args: InternalTransaction) {
    const result = await this.runInNode(args)

    return result
  }

  async runInNode (args: InternalTransaction) {
    const tx = { from: args.from, fromSmartAccount: args.fromSmartAccount, deployedBytecode: args.deployedBytecode, to: args.to, data: args.data, value: args.value, web3: args.web3, provider: args.provider, isVM: args.isVM }
    if (!args.from) throw new Error('the value of "from" is not defined. Please make sure an account is selected.')
    if (args.useCall) {
      const isVM = tx.isVM !== undefined ? tx.isVM : await this._api.call('blockchain', 'isVM')
      const web3 = tx.web3 || await this._api.call('blockchain', 'getWeb3')

      if (isVM) {
        web3.remix.registerCallId(args.timestamp)
      }
      const result = await web3.call(tx)

      return {
        result: result
      }
    }
    const network = await this._api.call('network', 'detectNetwork')
    const txCopy = { ...tx, type: undefined, maxFeePerGas: undefined, gasPrice: undefined }

    if (network && network.lastBlock) {
      if (network.lastBlock.baseFeePerGas) {
        // the sending stack (web3.js / metamask need to have the type defined)
        // this is to avoid the following issue: https://github.com/MetaMask/metamask-extension/issues/11824
        txCopy.type = '0x2'
        txCopy.maxFeePerGas = Math.ceil(Number((BigInt(network.lastBlock.baseFeePerGas) + BigInt(network.lastBlock.baseFeePerGas) / BigInt(3)).toString()))
      } else {
        txCopy.type = '0x1'
        txCopy.gasPrice = undefined
      }
    }
    const ethersProvider = tx.web3 || await this._api.call('blockchain', 'getWeb3')
    const config = Registry.getInstance().get('config').api

    try {
      const gasEstimationBigInt = await ethersProvider.estimateGas(txCopy)
      // continueTxExecution()
      const gasEstimation = Number(gasEstimationBigInt)
      /*
        * gasLimit is a value that can be set in the UI to hardcap value that can be put in a tx.
        * e.g if the gasestimate
        */
      const gasLimitNum = typeof args.gasLimit === 'string' ? parseInt(args.gasLimit, 16) : args.gasLimit
      if (args.gasLimit !== '0x0' && gasEstimation > gasLimitNum) {
        throw new Error(`estimated gas for this transaction (${gasEstimation}) is higher than gasLimit set in the configuration  (${args.gasLimit}). Please raise the gas limit.`)
      }

      if (args.gasLimit === '0x0') {
        tx['gasLimit'] = gasEstimation
      } else {
        tx['gasLimit'] = args.gasLimit
      }

      if (config.getUnpersistedProperty('doNotShowTransactionConfirmationAgain')) {
        return await this._executeTx(tx, network, null)
      }

      if (network.name !== 'Main') {
        return await this._executeTx(tx, network, null)
      }
      return await this.confirmTransaction(tx, network, tx['gasLimit'], args.determineGasPrice)
    } catch (err) {
      console.error(err)
      if (err && err.error && err.error.indexOf('Invalid JSON RPC response') !== -1) {
        // // @todo(#378) this should be removed when https://github.com/WalletConnect/walletconnect-monorepo/issues/334 is fixed
        // Should log in terminal
        throw new Error('Gas estimation failed because of an unknown internal error. This may indicated that the transaction will fail.')
      }
      const defaultGasLimit = 3000000

      tx['gasLimit'] = args.gasLimit === '0x0' ? '0x' + defaultGasLimit.toString(16) : args.gasLimit
      if (network.name === 'VM') {
        return await this._executeTx(tx, network, null)
      } else {
        if (tx.fromSmartAccount && tx.value === "0" &&
              err && err.message && err.message.includes('missing revert data')
        ) {
          // Do not show dialog for 'missing revert data'
          // tx fees can be managed by paymaster in case of smart account tx
          // @todo If paymaster is used, check if balance/credits are available
          if (config.getUnpersistedProperty('doNotShowTransactionConfirmationAgain')) {
            return await this._executeTx(tx, network, null)
          }
          return await this.confirmTransaction(tx, network, tx['gasLimit'], args.determineGasPrice)
        } else {
          let msg = ''
          if (typeof err === 'string') {
            msg = err
          }
          if (err && err.innerError) {
            msg += '\n' + err.innerError
          }
          if (err && err.message) {
            msg += '\n' + err.message
          }
          if (err && err.error) {
            msg += '\n' + err.error
          }

          if (msg.includes('invalid opcode')) msg += '\nThe EVM version used by the selected environment is not compatible with the compiler EVM version.'

          const gasEstimationPrompt = await this._api.call('udappDeploy', 'getGasEstimationPrompt', msg)
          return new Promise((resolve, reject) => {
            this._api.call('notification', 'modal', {
              id: 'gas-estimation-failed',
              title: 'Gas estimation failed',
              message: gasEstimationPrompt,
              okLabel: 'Send Transaction',
              okFn: async () => {
                try {
                  const result = await this._executeTx(tx, network, null)
                  resolve(result)
                } catch (error) {
                  reject(error)
                }
              },
              cancelLabel: 'Cancel Transaction',
              cancelFn: () => {
                reject(new Error('Transaction canceled by user.'))
              }
            })
          })
        }
      }
    }
  }

  async confirmTransaction (tx, network, gasEstimation, gasPriceValue) {
    const amount = formatUnits(toInt(tx.value), 'ether') // Direct call to avoid circular callback deadlock
    const content = await this._api.call('udappDeploy', 'getMainnetPrompt', tx, network, amount, gasEstimation, gasPriceValue)

    return new Promise((resolve, reject) => {
      this._api.call('notification', 'modal', {
        id: 'confirm-transaction',
        title: 'Confirm transaction',
        message: content,
        okLabel: 'Confirm',
        cancelLabel: 'Cancel',
        okFn: async () => {
          try {
            // @ts-ignore
            const confirmSettings = await this._api.call('udappDeploy', 'getConfirmSettings')
            // @ts-ignore
            const gasPriceStatus = await this._api.call('udappDeploy', 'getGasPriceStatus')
            // @ts-ignore
            const maxFee = await this._api.call('udappDeploy', 'getMaxFee')
            // @ts-ignore
            const maxPriorityFee = await this._api.call('udappDeploy', 'getMaxPriorityFee')
            // @ts-ignore
            const baseFeePerGas = await this._api.call('udappDeploy', 'getBaseFeePerGas')
            // @ts-ignore
            const gasPrice = await this._api.call('udappDeploy', 'getGasPrice')

            ;(Registry.getInstance().get('config').api).setUnpersistedProperty('doNotShowTransactionConfirmationAgain', confirmSettings)
            if (!gasPriceStatus) {
              reject(new Error('Given transaction fee is not correct'))
            } else {
              const result = await this._executeTx(tx, network, { maxFee, maxPriorityFee, baseFeePerGas, gasPrice })
              resolve(result)
            }
          } catch (error) {
            reject(error)
          }
        },
        cancelFn: () => {
          reject(new Error('Transaction canceled by user.'))
        }
      })
    })
  }

  async sendUserOp (tx, chainId) {
    const chain = chains[aaSupportedNetworks[chainId].name]
    const PUBLIC_NODE_URL = aaSupportedNetworks[chainId].publicNodeUrl
    const BUNDLER_URL = getPimlicoBundlerURL(chainId)

    // Check that saOwner is there in MM addresses
    let smartAccountsObj = localStorage.getItem(aaLocalStorageKey)
    smartAccountsObj = JSON.parse(smartAccountsObj)
    const saDetails = smartAccountsObj[chain.id][tx.from]
    const saOwner = saDetails['ownerEOA']

    // both are needed. public client to get nonce and read blockchain. wallet client to sign the useroperation
    const walletClient = createWalletClient({
      account: saOwner,
      chain,
      transport: custom(window.ethereum!),
    })

    const publicClient = createPublicClient({
      chain,
      transport: http(PUBLIC_NODE_URL)
    })

    const safeAccount = await toSafeSmartAccount({
      client: publicClient,
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
      owners: [walletClient],
      version: "1.4.1",
      address: tx.from // tx.from & saDetails['address'] should be same
    })

    const paymasterClient = createPimlicoClient({
      transport: http(BUNDLER_URL),
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
    })
    const saClient = createSmartAccountClient({
      account: safeAccount,
      chain,
      paymaster: paymasterClient,
      bundlerTransport: http(BUNDLER_URL),
      userOperation: {
        estimateFeesPerGas: async () => (await paymasterClient.getUserOperationGasPrice()).fast,
      }
    })

    const salt: `0x${string}` = `0x${randomBytes(32).toString('hex')}`
    const bytecode = tx.data

    const expectedDeploymentAddress = getContractAddress({
      bytecode,
      from: aaDeterminiticProxyAddress,
      opcode: 'CREATE2',
      salt
    })
    let txHash, contractAddress
    if (!tx.to) {
      // contract deployment transaction
      txHash = await saClient.sendTransaction({
        to:  aaDeterminiticProxyAddress,
        data: encodePacked(["bytes32", "bytes"], [salt, bytecode])
      })
      // check if code is deployed to expectedDeployment Address
      const expectedBytecode = await publicClient.getCode({
        address: expectedDeploymentAddress,
      })
      if (expectedBytecode === tx.deployedBytecode) {
        contractAddress = expectedDeploymentAddress
      } else {
        contractAddress = undefined
        console.error('Error in contract deployment using smart account')
      }
    } else {
      // contract interaction transaction
      txHash = await saClient.sendTransaction({
        to:  tx.to,
        data: tx.data,
        value: tx.value
      })
    }
    return { txHash, contractAddress }
  }
}

async function tryTillReceiptAvailable (txhash: string, provider: BrowserProvider) {
  try {
    const receipt = await provider.getTransactionReceipt(txhash)
    if (receipt) {
      if (!receipt.to && !receipt.contractAddress) {
        // this is a contract creation and the receipt doesn't contain a contract address. we have to keep polling...
        console.log('this is a contract creation and the receipt does not contain a contract address. we have to keep polling...')
      } else
        return receipt
    }
  } catch (e) {}
  await pause()
  return await tryTillReceiptAvailable(txhash, provider)
}

async function tryTillTxAvailable (txhash: string, provider: BrowserProvider) {
  try {
    const tx = await provider.getTransaction(txhash)
    if (tx && tx.blockHash) return tx
  } catch (e) {}
  return await tryTillTxAvailable(txhash, provider)
}

async function pause () { return new Promise((resolve, reject) => { setTimeout(resolve, 500) }) }
