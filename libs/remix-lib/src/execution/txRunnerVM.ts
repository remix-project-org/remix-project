'use strict'
import { RunBlockResult, RunTxResult, runBlock, runTx } from '@ethereumjs/vm'
import type { VM } from '@ethereumjs/vm'
import { ConsensusType } from '@ethereumjs/common'
import { LegacyTx, createLegacyTx, createFeeMarket1559Tx, createEOACode7702Tx, createLegacyTxFromRLP, createFeeMarket1559TxFromRLP } from '@ethereumjs/tx'
import { Block, createBlock, createBlockFromRLP } from '@ethereumjs/block'
import { bytesToHex, hexToBytes, createAddressFromString } from '@ethereumjs/util'
import type { AddressLike, BigIntLike, PrefixedHexString } from '@ethereumjs/util'
import { EventManager } from '../eventManager'
import { LogsManager } from './logsManager'
import type { Transaction as InternalTransaction } from './txRunner'

export type VMexecutionResult = {
  result: RunTxResult,
  transactionHash: string
  block: Block,
  tx: LegacyTx
}

export type VMExecutionCallBack = (error: string | Error, result?: VMexecutionResult) => void

export class TxRunnerVM {
  event
  blockNumber
  pendingTxs
  vmaccounts
  queueTxs
  blocks: Uint8Array[]
  logsManager
  commonContext
  blockParentHash
  nextNonceForCall: number
  standaloneTx: boolean
  baseBlockNumber: string
  getVMObject: () => any

  constructor (vmaccounts, api, getVMObject, blocks: Uint8Array[] = []) {
    this.event = new EventManager()
    this.logsManager = new LogsManager()
    // has a default for now for backwards compatibility
    this.getVMObject = getVMObject
    this.commonContext = this.getVMObject().common
    this.baseBlockNumber = this.getVMObject().baseBlockNumber
    this.pendingTxs = {}
    this.vmaccounts = vmaccounts
    this.queueTxs = []
    /*
      txHash is generated using the nonce,
      in order to have unique transaction hash, we need to keep using different nonce (in case of a call)
      so we increment this value after each call.
      For this to function we also need to skip nonce validation, in the vm: `{ skipNonce: true }`
    */
    this.nextNonceForCall = 0

    const vm = this.getVMObject().vm
    if (Array.isArray(blocks) && (blocks || []).length > 0) {
      const lastBlock = createBlockFromRLP(blocks[blocks.length - 1], { common: this.commonContext })

      this.blockParentHash = lastBlock.hash()
      this.blocks = blocks
    } else {
      this.blockParentHash = vm.blockchain.genesisBlock.hash()
      this.blocks = [vm.blockchain.genesisBlock.serialize()]
    }
  }

  execute (args: InternalTransaction, confirmationCb, gasEstimationForceSend, promptCb, callback: VMExecutionCallBack) {
    try {
      this.runInVm(args, callback)
    } catch (e) {
      callback(e, null)
    }
  }

  runEmptyBlock (callback: VMExecutionCallBack) {
    const EIP1559 = this.commonContext.hardfork() !== 'berlin' // berlin is the only pre eip1559 fork that we handle.
    const coinbases = ['0x0e9281e9c6a0808672eaba6bd1220e144c9bb07a', '0x8945a1288dc78a6d8952a92c77aee6730b414778', '0x94d76e24f818426ae84aa404140e8d5f60e10e7e'] as AddressLike[]
    const difficulties = [69762765929000, 70762765929000, 71762765929000]
    const difficulty = this.commonContext.consensusType() === ConsensusType.ProofOfStake ? 0 : difficulties[this.blocks.length % difficulties.length]
    const block = createBlock({
      header: {
        timestamp: new Date().getTime() / 1000 | 0,
        number: this.blocks.length,
        coinbase: coinbases[this.blocks.length % coinbases.length],
        difficulty,
        gasLimit: 0,
        baseFeePerGas: EIP1559 ? '0x1' : undefined,
        parentHash: this.blockParentHash
      }
    }, { common: this.commonContext })

    this.blockParentHash = block.hash()
    this.runBlockInVm(null, block, async (err, result) => {
      if (!err) {
        this.getVMObject().vm.blockchain.putBlock(block)
        this.blocks.push(block.serialize())
      }
      callback(err, result)
    })
  }

  async runInVm (tx: InternalTransaction, callback: VMExecutionCallBack) {
    const { to, data, value, gasLimit, useCall, signed, authorizationList } = tx
    let { from } = tx
    let account

    try {
      const EIP1559 = this.commonContext.hardfork() !== 'berlin' // berlin is the only pre eip1559 fork that we handle.
      let tx
      if (signed) {
        const txData = hexToBytes(data as PrefixedHexString)
        // Check the actual transaction type from the serialized data
        // Legacy transactions start with 0xf8 or higher (RLP list encoding)
        // EIP-1559 transactions start with 0x02 (transaction type byte)
        const txType = txData[0]

        if (txType <= 0x7f) {
          // Typed transaction (EIP-2718): first byte is the transaction type
          if (txType === 0x02) {
            // EIP-1559 transaction
            // Don't pass common - let it derive chain ID from the signed transaction
            tx = createFeeMarket1559TxFromRLP(txData)
          } else {
            // For other transaction types, try to parse as EIP-1559 first, then fall back to legacy
            try {
              tx = createFeeMarket1559TxFromRLP(txData)
            } catch (e) {
              tx = createLegacyTxFromRLP(txData)
            }
          }
        } else {
          // Legacy transaction (RLP-encoded, starts with 0xc0 or higher for a list)
          // Don't pass common - let it derive chain ID from the signed transaction
          tx = createLegacyTxFromRLP(txData)
        }
      }
      else {
        if (!from && useCall && Object.keys(this.vmaccounts).length) {
          from = Object.keys(this.vmaccounts)[0]
          account = this.vmaccounts[from]
        } else account = this.vmaccounts[from]

        if (!account) {
          return callback('Invalid account selected')
        }

        const res = await this.getVMObject().stateManager.getAccount(createAddressFromString(from))
        if (authorizationList) {
          tx = createEOACode7702Tx({
            nonce: useCall ? this.nextNonceForCall : res.nonce,
            maxPriorityFeePerGas: '0x01',
            maxFeePerGas: '0x7',
            gasLimit: gasLimit,
            to: (to as AddressLike),
            value: (value as BigIntLike),
            data: hexToBytes(data as PrefixedHexString),
            authorizationList: authorizationList
          }, { common: this.commonContext }).sign(account.privateKey)
        } else if (!EIP1559) {
          tx = createLegacyTx({
            nonce: useCall ? this.nextNonceForCall : res.nonce,
            gasPrice: '0x1',
            gasLimit: gasLimit,
            to: (to as AddressLike),
            value: (value as BigIntLike),
            data: hexToBytes(data as PrefixedHexString)
          }, { common: this.commonContext }).sign(account.privateKey)
        } else {
          tx = createFeeMarket1559Tx({
            nonce: useCall ? this.nextNonceForCall : res.nonce,
            maxPriorityFeePerGas: '0x01',
            maxFeePerGas: '0x7',
            gasLimit: gasLimit,
            to: (to as AddressLike),
            value: (value as BigIntLike),
            data: hexToBytes(data as PrefixedHexString)
          }, { common: this.commonContext }).sign(account.privateKey)
        }
      }

      if (useCall) this.nextNonceForCall++

      const coinbases = ['0x0e9281e9c6a0808672eaba6bd1220e144c9bb07a', '0x8945a1288dc78a6d8952a92c77aee6730b414778', '0x94d76e24f818426ae84aa404140e8d5f60e10e7e'] as AddressLike[]
      const difficulties = [69762765929000, 70762765929000, 71762765929000]
      const difficulty = this.commonContext.consensusType() === ConsensusType.ProofOfStake ? 0 : difficulties[this.blocks.length % difficulties.length]
      const blockNumber = this.baseBlockNumber ? parseInt(this.baseBlockNumber) + this.blocks.length : this.blocks.length
      const block = createBlock({
        header: {
          timestamp: new Date().getTime() / 1000 | 0,
          number: blockNumber,
          coinbase: coinbases[this.blocks.length % coinbases.length],
          difficulty,
          gasLimit,
          baseFeePerGas: EIP1559 ? '0x1' : undefined,
          parentHash: this.blockParentHash
        },
        transactions: [tx]
      }, { common: this.commonContext })

      // standaloneTx represents a gas estimation call
      if (this.standaloneTx || useCall) {
        const root = await this.getVMObject().stateManager.getStateRoot()
        this.runBlockInVm(tx, block, async (err, result) => {
          await this.getVMObject().stateManager.setStateRoot(root)
          callback(err, result)
        })
      } else {
        this.blockParentHash = block.hash()
        this.runBlockInVm(tx, block, async (err, result) => {
          if (!err) {
            if (!useCall) {
              this.getVMObject().vm.blockchain.putBlock(block)
              this.blocks.push(block.serialize())
            }
          }
          callback(err, result)
        })
      }
    } catch (e) {
      callback(e)
    }
  }

  runTxInVm (tx, block, callback) {
    const vm: VM = this.getVMObject().vm
    runTx(vm, { tx, skipNonce: true, skipBalance: false }).then((result: RunTxResult) => {
      callback(null, {
        result,
        transactionHash: bytesToHex((tx.hash())),
        block,
        tx
      })
    }).catch(function (err) {
      callback(err)
    })
  }

  runBlockInVm (tx, block, callback) {
    const vm: VM = this.getVMObject().vm
    runBlock(vm, { block: block, generate: true, skipHeaderValidation: true, skipNonce: true, skipBlockValidation: true, skipBalance: false }).then((results: RunBlockResult) => {
      const result: RunTxResult = results.results[0]
      callback(null, {
        result,
        transactionHash: tx ? bytesToHex(tx.hash()) : null,
        block,
        tx
      })
    }).catch(function (err) {
      callback(err)
    })
  }
}
