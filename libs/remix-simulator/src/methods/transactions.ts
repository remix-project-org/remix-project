import { toChecksumAddress, bigIntToHex, bytesToHex, createAddressFromString } from '@ethereumjs/util'
import { processTx } from './txProcess'
import { execution } from '@remix-project/remix-lib'
import { AbiCoder, toNumber } from 'ethers'
import { VMexecutionResult } from '@remix-project/remix-lib'
import { VMContext } from '../vm-context'
import { Log, EVMError } from '@ethereumjs/evm'
const TxRunnerVM = execution.TxRunnerVM
const TxRunner = execution.TxRunner

export type VMExecResult = {
  exceptionError: EVMError
  executionGasUsed: bigint
  gas: bigint
  gasRefund: bigint
  logs: Log[]
  returnValue: string
}

export class Transactions {
  vmContext: VMContext
  accounts
  tags
  txRunnerVMInstance
  txRunnerInstance
  TX_INDEX = '0x0' // currently there's always only 1 tx per block, so the transaction index will always be 0x0
  comingCallId

  constructor (vmContext) {
    this.vmContext = vmContext
    this.tags = {}
  }

  init (accounts, blocksData: Buffer[]) {
    this.accounts = accounts
    const api = {
      logMessage: (msg) => {
      },
      logHtmlMessage: (msg) => {
      },
      config: {
        getUnpersistedProperty: (key) => {
          return true
        },
        get: () => {
          return true
        }
      },
      detectNetwork: (cb) => {
        cb()
      },
      personalMode: () => {
        return false
      }
    }

    this.txRunnerVMInstance = new TxRunnerVM(accounts, api, _ => this.vmContext.vmObject(), blocksData)
    this.txRunnerInstance = new TxRunner(this.txRunnerVMInstance, {})
    this.txRunnerInstance.vmaccounts = accounts
  }

  methods () {
    return {
      eth_sendTransaction: this.eth_sendTransaction.bind(this),
      eth_sendRawTransaction: this.eth_sendRawTransaction.bind(this),
      eth_getTransactionReceipt: this.eth_getTransactionReceipt.bind(this),
      eth_getCode: this.eth_getCode.bind(this),
      eth_call: this.eth_call.bind(this),
      eth_estimateGas: this.eth_estimateGas.bind(this),
      eth_maxPriorityFeePerGas: this.eth_maxPriorityFeePerGas.bind(this),
      eth_getTransactionCount: this.eth_getTransactionCount.bind(this),
      eth_getTransactionByHash: this.eth_getTransactionByHash.bind(this),
      eth_getTransactionByBlockHashAndIndex: this.eth_getTransactionByBlockHashAndIndex.bind(this),
      eth_getTransactionByBlockNumberAndIndex: this.eth_getTransactionByBlockNumberAndIndex.bind(this),
      eth_getExecutionResultFromSimulator: this.eth_getExecutionResultFromSimulator.bind(this),
      eth_getHHLogsForTx: this.eth_getHHLogsForTx.bind(this),
      eth_getHashFromTagBySimulator: this.eth_getHashFromTagBySimulator.bind(this),
      eth_registerCallId: this.eth_registerCallId.bind(this),
      eth_getStateDb: this.eth_getStateDb.bind(this),
      eth_getBlocksData: this.eth_getBlocksData.bind(this)
    }
  }

  eth_maxPriorityFeePerGas (payload, cb) {
    cb (null, '0xaa')
  }

  eth_sendRawTransaction (payload, cb) {
    payload.params[0] = { data: payload.params[0], signed: true }
    processTx(this.txRunnerInstance, payload, false, (error, result: VMexecutionResult) => {
      if (!error && result) {
        this.vmContext.addBlock(result.block)
        const hash = bytesToHex(result.tx.hash())
        this.vmContext.trackTx(hash, result.block, result.tx)
        const returnValue = `${bytesToHex(result.result.execResult.returnValue) || '0x0'}`
        const execResult: VMExecResult = {
          exceptionError: result.result.execResult.exceptionError,
          executionGasUsed: result.result.execResult.executionGasUsed,
          gas: result.result.execResult.gas,
          gasRefund: result.result.execResult.gasRefund,
          logs: result.result.execResult.logs,
          returnValue
        }
        this.vmContext.trackExecResult(hash, execResult)
        return cb(null, result.transactionHash)
      }
      cb(error)
    })
  }

  eth_sendTransaction (payload, cb) {
    // from might be lowercased address (web3)
    if (payload.params && payload.params.length > 0 && payload.params[0].from) {
      payload.params[0].from = toChecksumAddress(payload.params[0].from)
    }
    processTx(this.txRunnerInstance, payload, false, (error, result: VMexecutionResult) => {
      if (!error && result) {
        this.vmContext.addBlock(result.block)
        const hash = bytesToHex(result.tx.hash())
        this.vmContext.trackTx(hash, result.block, result.tx)
        const returnValue = `${bytesToHex(result.result.execResult.returnValue) || '0x0'}`
        const execResult: VMExecResult = {
          exceptionError: result.result.execResult.exceptionError,
          executionGasUsed: result.result.execResult.executionGasUsed,
          gas: result.result.execResult.gas,
          gasRefund: result.result.execResult.gasRefund,
          logs: result.result.execResult.logs,
          returnValue
        }
        this.vmContext.trackExecResult(hash, execResult)
        return cb(null, result.transactionHash)
      }
      cb(error)
    })
  }

  eth_getExecutionResultFromSimulator (payload, cb) {
    const txHash = payload.params[0]
    cb(null, this.vmContext.exeResults[txHash])
  }

  eth_getHHLogsForTx (payload, cb) {
    const txHash = payload.params[0]
    cb(null, this.vmContext.currentVm.web3vm.hhLogs[txHash] ? this.vmContext.currentVm.web3vm.hhLogs[txHash] : [])
  }

  eth_getTransactionReceipt (payload, cb) {
    this.vmContext.web3().getTransactionReceipt(payload.params[0], (error, receipt) => {
      if (error) {
        return cb(error)
      }

      const txBlock = this.vmContext.blockByTxHash[receipt.hash]

      const logs = this.vmContext.logsManager.getLogsByTxHash(receipt.hash)

      const r: Record <string, unknown> = {
        transactionHash: receipt.hash,
        transactionIndex: this.TX_INDEX,
        blockHash: bytesToHex(txBlock.hash()),
        blockNumber: bigIntToHex(txBlock.header.number),
        gasUsed: receipt.gasUsed,
        cumulativeGasUsed: receipt.gasUsed, // only 1 tx per block
        contractAddress: receipt.contractAddress,
        logs,
        status: receipt.status,
        to: receipt.to
      }

      if (r.blockNumber === '0x') {
        r.blockNumber = '0x0'
      }

      cb(null, r)
    })
  }

  eth_estimateGas (payload, cb) {
    // from might be lowercased address (web3)
    if (payload.params && payload.params.length > 0 && payload.params[0].from) {
      payload.params[0].from = toChecksumAddress(payload.params[0].from)
    }
    if (payload.params && payload.params.length > 0 && payload.params[0].to) {
      payload.params[0].to = toChecksumAddress(payload.params[0].to)
    }

    payload.params[0].gas = 16777216 // Equal to EIP-7825 Transaction Gas Limit Cap, 2^24
    this.vmContext.web3().recordVMSteps(false)
    this.txRunnerInstance.internalRunner.standaloneTx = true
    processTx(this.txRunnerInstance, payload, true, (error, value: VMexecutionResult) => {
      this.txRunnerInstance.internalRunner.standaloneTx = false
      this.vmContext.web3().recordVMSteps(true)
      if (error) return cb(error)
      const result: any = value.result
      if ((result as any).receipt?.status === '0x0' || (result as any).receipt?.status === 0) {
        try {
          const msg = `${bytesToHex(result.execResult.returnValue) || '0x00'}`
          const abiCoder = new AbiCoder()
          const reason = abiCoder.decode(['string'], '0x' + msg.slice(10))[0]
          return cb('revert ' + reason)
        } catch (e) {
          return cb(e.message)
        }
      }
      if (result.execResult && result.execResult.exceptionError && result.execResult.exceptionError.errorType === 'EvmError') {
        return cb(result.execResult.exceptionError.error)
      }
      let gasUsed = Number(toNumber(result.execResult.executionGasUsed))
      if (result.execResult.gasRefund) {
        gasUsed += Number(toNumber(result.execResult.gasRefund))
      }
      gasUsed = gasUsed + Number(toNumber(value.tx.getIntrinsicGas()))
      cb(null, Math.ceil(gasUsed + (15 * gasUsed) / 100))
    })
  }

  eth_getCode (payload, cb) {
    const address = payload.params[0]

    this.vmContext.web3().getCode(address, (error, result) => {
      if (error) {
        console.dir('error getting code')
        console.dir(error)
      }
      cb(error, result)
    })
  }

  eth_registerCallId (payload, cb) {
    this.comingCallId = payload.params[0]
    cb()
  }

  eth_getStateDb (_, cb) {
    const run = async () => {
      if ((this.vmContext.currentVm.stateManager as any)._getCodeDB) {
        return cb(null, await (this.vmContext.currentVm.stateManager as any)._getCodeDB())
      }
      throw new Error('current state does not support "getStateDetails"')
    }
    run()
  }

  eth_getBlocksData (_, cb) {
    cb(null, {
      blocks: this.txRunnerVMInstance.blocks,
      latestBlockNumber: this.txRunnerVMInstance.blocks.length - 1,
      baseBlockNumber: this.vmContext.currentVm.baseBlockNumber
    })
  }

  eth_call (payload, cb) {
    // from might be lowercased address (web3)
    if (payload.params && payload.params.length > 0 && payload.params[0].from) {
      payload.params[0].from = toChecksumAddress(payload.params[0].from)
    }
    if (payload.params && payload.params.length > 0 && payload.params[0].to) {
      payload.params[0].to = toChecksumAddress(payload.params[0].to)
    }

    payload.params[0].value = undefined
    const tag = payload.params[0].timestamp
    processTx(this.txRunnerInstance, payload, true, (error, result: VMexecutionResult) => {
      if (!error && result) {
        this.vmContext.addBlock(result.block, null, true)
        const hash = bytesToHex(result.tx.hash())
        this.vmContext.trackTx(hash, result.block, result.tx)
        const returnValue = `${bytesToHex(result.result.execResult.returnValue) || '0x0'}`
        const execResult: VMExecResult = {
          exceptionError: result.result.execResult.exceptionError,
          executionGasUsed: result.result.execResult.executionGasUsed,
          gas: result.result.execResult.gas,
          gasRefund: result.result.execResult.gasRefund,
          logs: result.result.execResult.logs,
          returnValue: returnValue
        }
        // calls are not supposed to return a transaction hash. we do this for keeping track of it and allowing debugging calls.
        // either the tag is specified as a timestamp in a tx or the caller should call registerCallId before calling the call.
        if (tag) this.tags[tag] = result.transactionHash
        else if (this.comingCallId) {
          this.tags[this.comingCallId] = result.transactionHash
          this.comingCallId = null
        }
        this.vmContext.trackExecResult(hash, execResult)
        return cb(null, returnValue)
      }
      cb(error)
    })
  }

  eth_getHashFromTagBySimulator (payload, cb) {
    return cb(null, this.tags[payload.params[0]])
  }

  eth_getTransactionCount (payload, cb) {
    const address = payload.params[0]

    this.vmContext.vm().stateManager.getAccount(createAddressFromString(address)).then((account) => {
      const nonce = BigInt(account.nonce).toString(10)
      cb(null, nonce)
    }).catch((error) => {
      cb(error)
    })
  }

  eth_getTransactionByHash (payload, cb) {
    const address = payload.params[0]

    this.vmContext.web3().getTransactionReceipt(address, (error, receipt) => {
      if (error) {
        return cb(error)
      }

      const txBlock = this.vmContext.blockByTxHash[receipt.transactionHash]
      const tx = this.vmContext.txByHash[receipt.transactionHash]
      // TODO: params to add later
      const r: Record<string, unknown> = {
        blockHash: bytesToHex(txBlock.hash()),
        blockNumber: bigIntToHex(txBlock.header.number),
        from: receipt.from,
        gas: bigIntToHex(BigInt(receipt.gas)),
        chainId: '0xd05',
        // 'gasPrice': '2000000000000', // 0x123
        gasPrice: '0x4a817c800', // 20000000000
        hash: receipt.transactionHash,
        input: receipt.input,
        nonce: bigIntToHex(tx.nonce),
        transactionIndex: this.TX_INDEX,
        value: bigIntToHex(tx.value),
        v: bigIntToHex(tx.v),
        r: bigIntToHex(tx.r),
        s: bigIntToHex(tx.s)
      }

      if (receipt.to) {
        r['to'] = receipt.to
      }

      if (r.value === '0x') {
        r.value = '0x0'
      }

      if (r.blockNumber === '0x') {
        r.blockNumber = '0x0'
      }

      cb(null, r)
    })
  }

  eth_getTransactionByBlockHashAndIndex (payload, cb) {
    const txIndex = payload.params[1]

    const txBlock = this.vmContext.blocks[payload.params[0]]
    const txHash = bytesToHex(txBlock.transactions[toNumber(txIndex) as number].hash())

    this.vmContext.web3().getTransactionReceipt(txHash, (error, receipt) => {
      if (error) {
        return cb(error)
      }

      const tx = this.vmContext.txByHash[receipt.transactionHash]

      // TODO: params to add later
      const r: Record<string, unknown> = {
        blockHash: bytesToHex(txBlock.hash()),
        blockNumber: bigIntToHex(txBlock.header.number),
        from: receipt.from,
        gas: bigIntToHex(BigInt(receipt.gas)),
        chainId: '0xd05',
        // 'gasPrice': '2000000000000', // 0x123
        gasPrice: '0x4a817c800', // 20000000000
        hash: receipt.transactionHash,
        input: receipt.input,
        nonce: bigIntToHex(tx.nonce),
        transactionIndex: this.TX_INDEX,
        value: receipt.value
        // "value":"0xf3dbb76162000" // 4290000000000000
        // "v": "0x25", // 37
        // "r": "0x1b5e176d927f8e9ab405058b2d2457392da3e20f328b16ddabcebc33eaac5fea",
        // "s": "0x4ba69724e8f69de52f0125ad8b3c5c2cef33019bac3249e2c0a2192766d1721c"
      }

      if (receipt.to) {
        r['to'] = receipt.to
      }

      if (r.value === '0x') {
        r.value = '0x0'
      }

      cb(null, r)
    })
  }

  eth_getTransactionByBlockNumberAndIndex (payload, cb) {
    const txIndex = payload.params[1]

    const txBlock = this.vmContext.blocks[payload.params[0]]
    const txHash = bytesToHex(txBlock.transactions[toNumber(txIndex) as number].hash())

    this.vmContext.web3().getTransactionReceipt(txHash, (error, receipt) => {
      if (error) {
        return cb(error)
      }

      const tx = this.vmContext.txByHash[receipt.transactionHash]

      // TODO: params to add later
      const r: Record<string, unknown> = {
        blockHash: bytesToHex(txBlock.hash()),
        blockNumber: bigIntToHex(txBlock.header.number),
        from: receipt.from,
        gas: bigIntToHex(BigInt(receipt.gas)),
        // 'gasPrice': '2000000000000', // 0x123
        chainId: '0xd05',
        gasPrice: '0x4a817c800', // 20000000000
        hash: receipt.transactionHash,
        input: receipt.input,
        nonce: bigIntToHex(tx.nonce),
        transactionIndex: this.TX_INDEX,
        value: receipt.value
        // "value":"0xf3dbb76162000" // 4290000000000000
        // "v": "0x25", // 37
        // "r": "0x1b5e176d927f8e9ab405058b2d2457392da3e20f328b16ddabcebc33eaac5fea",
        // "s": "0x4ba69724e8f69de52f0125ad8b3c5c2cef33019bac3249e2c0a2192766d1721c"
      }

      if (receipt.to) {
        r['to'] = receipt.to
      }

      if (r.value === '0x') {
        r.value = '0x0'
      }

      cb(null, r)
    })
  }
}
