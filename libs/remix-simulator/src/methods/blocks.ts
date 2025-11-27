import { hexlify } from 'ethers'
import { VMContext } from '../vm-context'
import { bigIntToHex, bytesToHex } from '@ethereumjs/util'

export class Blocks {
  vmContext: VMContext
  coinbase: string
  TX_INDEX = '0x0' // currently there's always only 1 tx per block, so the transaction index will always be 0x0
  constructor (vmContext, _options) {
    this.vmContext = vmContext
    const options = _options || {}
    this.coinbase = options.coinbase || '0x0000000000000000000000000000000000000000'
  }

  methods (): Record<string, unknown> {
    return {
      eth_getBlockByNumber: this.eth_getBlockByNumber.bind(this),
      eth_gasPrice: this.eth_gasPrice.bind(this),
      eth_coinbase: this.eth_coinbase.bind(this),
      eth_blockNumber: this.eth_blockNumber.bind(this),
      eth_getBlockByHash: this.eth_getBlockByHash.bind(this),
      eth_getBlockTransactionCountByHash: this.eth_getBlockTransactionCountByHash.bind(this),
      eth_getBlockTransactionCountByNumber: this.eth_getBlockTransactionCountByNumber.bind(this),
      eth_getUncleCountByBlockHash: this.eth_getUncleCountByBlockHash.bind(this),
      eth_getUncleCountByBlockNumber: this.eth_getUncleCountByBlockNumber.bind(this),
      eth_getStorageAt: this.eth_getStorageAt.bind(this)
    }
  }

  eth_getBlockByNumber (payload, cb) {
    let blockIndex = payload.params[0]
    const includeTransactions = payload.params[1]
    if (blockIndex === 'latest') {
      blockIndex = this.vmContext.latestBlockNumber
    }

    if (Number.isInteger(blockIndex)) {
      blockIndex = '0x' + blockIndex.toString(16)
    }
    const block = this.vmContext.blocks[blockIndex]

    if (!block) {
      return cb(new Error('block not found'))
    }

    let transactions = []
    if (includeTransactions) {
      transactions = block.transactions.map((t) => {
        const hash = bytesToHex(t.hash())
        const tx = this.vmContext.txByHash[hash]
        const receipt = this.vmContext.currentVm.web3vm.txsReceipt[hash]
        if (receipt) {
          return {
            blockHash: bytesToHex(block.hash()),
            blockNumber: bigIntToHex(block.header.number),
            from: receipt.from,
            gas: bigIntToHex(receipt.gas),
            chainId: '0xd05',
            gasPrice: '0x4a817c800', // 20000000000
            hash: receipt.transactionHash,
            input: receipt.input,
            nonce: bigIntToHex(tx.nonce),
            transactionIndex: this.TX_INDEX,
            value: bigIntToHex(tx.value),
            to: receipt.to ? receipt.to : null,
            v: bigIntToHex(tx.v),
            r: bigIntToHex(tx.r),
            s: bigIntToHex(tx.s)
          }
        }
      })
    }

    const b = {
      baseFeePerGas: '0x01',
      number: bigIntToHex(block.header.number),
      hash: this.toHex(block.hash()),
      parentHash: this.toHex(block.header.parentHash),
      nonce: this.toHex(block.header.nonce),
      sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
      logsBloom: '0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99d05921026d1527331',
      transactionsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      stateRoot: this.toHex(block.header.stateRoot),
      miner: this.coinbase,
      difficulty: bigIntToHex(block.header.difficulty),
      totalDifficulty: bigIntToHex((block.header as any).totalDifficulty || 0),
      extraData: this.toHex(block.header.extraData),
      size: '0x027f07', // 163591
      gasLimit: bigIntToHex(block.header.gasLimit),
      gasUsed: bigIntToHex(block.header.gasUsed),
      timestamp: bigIntToHex(block.header.timestamp),
      transactions,
      uncles: []
    }
    cb(null, b)
  }

  toHex (value) {
    if (!value) return '0x00'
    const v = bytesToHex(value)
    // @ts-ignore
    return ((v === '0x' || v === '') ? '0x00' : v)
  }

  eth_getBlockByHash (payload, cb) {
    const block = this.vmContext.blocks[payload.params[0]]
    const includeTransactions = payload.params[1]
    let transactions = []
    if (includeTransactions) {
      transactions = block.transactions.map((t) => {
        const hash = bytesToHex(t.hash())
        const tx = this.vmContext.txByHash[hash]
        const receipt = this.vmContext.currentVm.web3vm.txsReceipt[hash]
        if (receipt) {
          return {
            blockHash: bytesToHex(block.hash()),
            blockNumber: bigIntToHex(block.header.number),
            from: receipt.from,
            gas: hexlify(receipt.gas),
            chainId: '0xd05',
            gasPrice: '0x4a817c800', // 20000000000
            hash: receipt.transactionHash,
            input: receipt.input,
            nonce: bigIntToHex(tx.nonce),
            transactionIndex: this.TX_INDEX,
            value: bigIntToHex(tx.value),
            to: receipt.to ? receipt.to : null,
            v: bigIntToHex(tx.v),
            r: bigIntToHex(tx.r),
            s: bigIntToHex(tx.s)
          }
        }
      })
    }

    const b = {
      baseFeePerGas: '0x01',
      number: bigIntToHex(block.header.number),
      hash: this.toHex(block.hash()),
      parentHash: this.toHex(block.header.parentHash),
      nonce: this.toHex(block.header.nonce),
      sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
      logsBloom: '0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99d05921026d1527331',
      transactionsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      stateRoot: this.toHex(block.header.stateRoot),
      miner: this.coinbase,
      difficulty: bigIntToHex(block.header.difficulty),
      totalDifficulty: bigIntToHex((block.header as any).totalDifficulty || 0),
      extraData: this.toHex(block.header.extraData),
      size: '0x027f07', // 163591
      gasLimit: bigIntToHex(block.header.gasLimit),
      gasUsed: bigIntToHex(block.header.gasUsed),
      timestamp: bigIntToHex(block.header.timestamp),
      transactions,
      uncles: []
    }

    cb(null, b)
  }

  eth_gasPrice (payload, cb) {
    cb(null, 1)
  }

  eth_coinbase (payload, cb) {
    cb(null, this.coinbase)
  }

  eth_blockNumber (payload, cb) {
    cb(null, parseInt(this.vmContext.latestBlockNumber))
  }

  eth_getBlockTransactionCountByHash (payload, cb) {
    const block = this.vmContext.blocks[payload.params[0]]

    cb(null, block.transactions.length)
  }

  eth_getBlockTransactionCountByNumber (payload, cb) {
    const block = this.vmContext.blocks[payload.params[0]]

    cb(null, block.transactions.length)
  }

  eth_getUncleCountByBlockHash (payload, cb) {
    cb(null, 0)
  }

  eth_getUncleCountByBlockNumber (payload, cb) {
    cb(null, 0)
  }

  eth_getStorageAt (payload, cb) {
    return this.vmContext.web3().getStorageAt(
      payload.params[0],
      payload.params[1],
      payload.params[2],
      cb)
  }
}
