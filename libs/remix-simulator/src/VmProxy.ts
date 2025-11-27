
import { ConsoleLogs, hash, util, helpers } from '@remix-project/remix-lib'
const { toHexPaddedString, formatMemory, padHexToEven } = util
const { normalizeHexAddress } = helpers.ui
import { toChecksumAddress, bytesToHex, toBytes, createAddressFromString, PrefixedHexString } from '@ethereumjs/util'
import { Interface, zeroPadValue, keccak256, hexlify, toUtf8String, toUtf8Bytes, formatEther, parseEther, isAddress, formatUnits, parseUnits } from 'ethers'
import { VMContext } from './vm-context'
import type { StateManagerInterface } from '@ethereumjs/common'
import type { InterpreterStep } from '@ethereumjs/evm'
import type { AfterTxEvent, VM } from '@ethereumjs/vm'
import type { TypedTransaction } from '@ethereumjs/tx'

export class VmProxy {
  vmContext: VMContext
  vm: VM
  vmTraces
  txs
  txsReceipt
  hhLogs
  processingHash
  processingAddress
  processingIndex
  previousDepth
  incr
  eth
  debug
  providers
  currentProvider
  storageCache
  sha3Preimages
  sha3
  toHex
  toAscii
  fromAscii
  fromDecimal
  fromWei
  toWei
  toBigNumber
  isAddress
  txsMapBlock
  blocks
  stateCopy: StateManagerInterface
  flagrecordVMSteps: boolean
  lastMemoryUpdate: Array<string>
  callIncrement: bigint
  txRunning: boolean

  constructor (vmContext: VMContext) {
    this.vmContext = vmContext
    this.stateCopy
    this.vm = null
    this.vmTraces = {}
    this.txs = {}
    this.txsReceipt = {}
    this.hhLogs = {}
    this.processingHash = null
    this.processingAddress = null
    this.processingIndex = null
    this.previousDepth = 0
    this.incr = 0
    this.debug = {}
    this.debug.traceTransaction = (txHash, options, cb) => this.traceTransaction(txHash, options, cb)
    this.debug.storageRangeAt = (blockNumber, txIndex, address, start, maxLength, cb) => this.storageRangeAt(blockNumber, txIndex, address, start, maxLength, cb)
    this.debug.preimage = (hashedKey, cb) => this.preimage(hashedKey, cb)
    this.providers = { HttpProvider: function (url) {} }
    this.currentProvider = { host: 'vm provider' }
    this.storageCache = {}
    this.sha3Preimages = {}
    // util
    this.sha3 = (...args) => keccak256.apply(this, args)
    this.toHex = (...args) => hexlify.apply(this, args)
    this.toAscii = (...args) => toUtf8String.apply(this, args)
    this.fromAscii = (...args) => toUtf8Bytes.apply(this, args)
    this.fromWei = (...args) => formatUnits.apply(this, args)
    this.toWei = (...args) => parseUnits.apply(this, args)
    this.toBigNumber = (...args) => BigInt.apply(this, args)
    this.isAddress = (...args) => isAddress.apply(this, args)
    this.txsMapBlock = {}
    this.blocks = {}
    this.lastMemoryUpdate = []
    this.flagrecordVMSteps = true
    this.callIncrement = BigInt(1)
    this.txRunning = false
  }

  setVM (vm) {
    if (this.vm === vm) return
    this.vm = vm
    this.vm.evm.events.on('step', async (data: InterpreterStep, resolve: (result?: any) => void) => {
      await this.pushTrace(data)
      resolve()
    })
    this.vm.events.on('afterTx', async (data: AfterTxEvent, resolve: (result?: any) => void) => {
      await this.txProcessed(data)
      this.txRunning = false
      resolve()
    })
    this.vm.events.on('beforeTx', async (data: TypedTransaction, resolve: (result?: any) => void) => {
      this.txRunning = true
      await this.txWillProcess(data)
      resolve()
    })
  }

  releaseCurrentHash () {
    const ret = this.processingHash
    this.processingHash = undefined
    return ret
  }

  recordVMSteps (record) {
    this.flagrecordVMSteps = record
  }

  async txWillProcess (data: TypedTransaction) {
    if (!this.flagrecordVMSteps) return
    this.lastMemoryUpdate = []
    this.stateCopy = await this.vm.stateManager.shallowCopy()
    this.incr++
    this.processingHash = bytesToHex(data.hash())
    this.vmTraces[this.processingHash] = {
      gas: '0x0',
      return: '0x0',
      structLogs: []
    }
    const tx = {}
    tx['hash'] = this.processingHash
    tx['from'] = toChecksumAddress(data.getSenderAddress().toString())
    if (data.to) {
      tx['to'] = toChecksumAddress(data.to.toString())
    }
    this.processingAddress = tx['to']
    tx['input'] = bytesToHex(data.data)
    tx['gas'] = data.gasLimit.toString(10)
    if (data.value) {
      tx['value'] = data.value.toString(10)
    }
    this.txs[this.processingHash] = tx
    this.txsReceipt[this.processingHash] = tx
    this.storageCache[this.processingHash] = {}
    this.storageCache['after_' + this.processingHash] = {}
    if (data.to) {
      (async (processingHash, processingAccount, processingAddress, self) => {
        try {
          const storage = await self.stateCopy.dumpStorage(processingAccount)
          self.storageCache[processingHash][processingAddress] = storage
        } catch (e) {
          console.log(e)
        }
      })(this.processingHash, data.to, tx['to'], this)
    }
    this.processingIndex = 0
  }

  async txProcessed (data: AfterTxEvent) {
    if (!this.flagrecordVMSteps) return
    const lastOp = this.vmTraces[this.processingHash].structLogs[this.processingIndex - 1]
    if (lastOp) {
      lastOp.error = lastOp.op !== 'RETURN' && lastOp.op !== 'STOP' && lastOp.op !== 'DESTRUCT'
    }
    const gasUsed = '0x' + data.totalGasSpent.toString(16)
    this.vmTraces[this.processingHash].gas = gasUsed
    this.txsReceipt[this.processingHash].gasUsed = gasUsed
    const logs = []
    for (const l in data.execResult.logs) {
      const log = data.execResult.logs[l]
      const topics = []
      if (log[1].length > 0) {
        for (const k in log[1]) {
          // @ts-ignore
          topics.push(bytesToHex(log[1][k]))
        }
      } else {
        topics.push('0x')
      }
      logs.push({
        address: toChecksumAddress(bytesToHex(log[0])),
        data: bytesToHex(log[2]),
        topics: topics,
        rawVMResponse: log
      })
    }
    this.txsReceipt[this.processingHash].logs = logs
    this.txsReceipt[this.processingHash].transactionHash = this.processingHash
    const status = data.execResult.exceptionError ? 0 : 1
    this.txsReceipt[this.processingHash].status = `0x${status}`

    const to = this.txs[this.processingHash].to
    if (to) {
      try {
        await (async (processingHash, processingAddress, self) => {
          try {
            const account = createAddressFromString(processingAddress)
            const storage = await self.vm.stateManager.dumpStorage(account)
            self.storageCache['after_' + processingHash][processingAddress] = storage
          } catch (e) {
            console.log(e)
          }
        })(this.processingHash, to, this)
      } catch (e) {
        console.log(e)
      }
    }

    if (data.createdAddress) {
      const address = data.createdAddress.toString()
      const checksumedAddress = toChecksumAddress(address)
      this.vmTraces[this.processingHash].return = checksumedAddress
      this.txsReceipt[this.processingHash].contractAddress = checksumedAddress
    } else if (data.execResult.returnValue) {
      this.vmTraces[this.processingHash].return = bytesToHex(data.execResult.returnValue)
    } else {
      this.vmTraces[this.processingHash].return = '0x'
    }
    this.processingIndex = null
    this.processingAddress = null
    this.processingHash = null
    this.previousDepth = 0
    this.stateCopy = null
  }

  async pushTrace (data: InterpreterStep) {
    if (!this.flagrecordVMSteps) return

    try {
      const depth = data.depth + 1 // geth starts the depth from 1
      if (!this.processingHash) {
        return
      }
      let previousOpcode
      if (this.vmTraces[this.processingHash] && this.vmTraces[this.processingHash].structLogs[this.processingIndex - 1]) {
        previousOpcode = this.vmTraces[this.processingHash].structLogs[this.processingIndex - 1]
      }
      if (this.previousDepth > depth && previousOpcode) {
        // returning from context, set error it is not STOP, RETURN
        previousOpcode.invalidDepthChange = previousOpcode.op !== 'RETURN' && previousOpcode.op !== 'STOP'
      }
      const step = {
        stack: { ...data.stack },
        storage: {},
        memory: null,
        op: data.opcode.name,
        pc: data.pc,
        gasCost: data.opcode.fee.toString(),
        gas: data.gasLeft.toString(),
        depth: depth
      }
      step.stack.length = Object.keys(data.stack).length

      if (previousOpcode && (previousOpcode.op === 'CALLDATACOPY' || previousOpcode.op === 'CODECOPY' || previousOpcode.op === 'EXTCODECOPY' || previousOpcode.op === 'RETURNDATACOPY' || previousOpcode.op === 'MSTORE' || previousOpcode.op === 'MSTORE8')) {
        step.memory = new Uint8Array(data.memory)
        this.lastMemoryUpdate = step.memory
      }
      this.vmTraces[this.processingHash].structLogs.push(step)
      // Track hardhat console.log call
      if (step.op === 'STATICCALL' && toHexPaddedString(step.stack[step.stack.length - 2]) === '0x000000000000000000000000000000000000000000636f6e736f6c652e6c6f67') {
        const payloadStart = parseInt(toHexPaddedString(step.stack[step.stack.length - 3]), 16)
        const memory = formatMemory(data.memory)
        const memoryStr = memory.join('')
        let payload = memoryStr.substring(payloadStart * 2, memoryStr.length)
        const fnselectorStr = payload.substring(0, 8)
        const fnselectorStrInHex = '0x' + fnselectorStr
        const fnselector = parseInt(fnselectorStrInHex)
        const fnArgs = ConsoleLogs[fnselector]
        const iface = new Interface([`function log${fnArgs} view`])
        const functionDesc = iface.getFunction(`log${fnArgs}`)
        const sigHash = functionDesc.selector
        if (fnArgs.includes('uint') && sigHash !== fnselectorStrInHex) {
          payload = payload.replace(fnselectorStr, sigHash)
        } else {
          payload = '0x' + payload
        }
        const consoleArgs = iface.decodeFunctionData(functionDesc, payload)
        const consoleArgsMapped = consoleArgs.map((value) => {
          // Copied from: https://github.com/web3/web3.js/blob/e68194bdc590d811d4bf66dde12f99659861a110/packages/web3-utils/src/utils.js#L48C10-L48C10
          if (value && ((value.constructor && value.constructor.name === 'BigNumber') || typeof value === 'bigint')) {
            return value.toString()
          }
          return value
        })
        this.hhLogs[this.processingHash] = this.hhLogs[this.processingHash] ? this.hhLogs[this.processingHash] : []
        this.hhLogs[this.processingHash].push(consoleArgsMapped)
      }

      if (step.op === 'CREATE' || step.op === 'CALL') {
        if (step.op === 'CREATE') {
          this.processingAddress = '(Contract Creation - Step ' + this.processingIndex + ')'
          this.storageCache[this.processingHash][this.processingAddress] = {}
        } else {
          this.processingAddress = normalizeHexAddress(toHexPaddedString(step.stack[step.stack.length - 2]))
          this.processingAddress = toChecksumAddress(this.processingAddress)
          if (!this.storageCache[this.processingHash][this.processingAddress]) {
            (async (processingHash, processingAddress, self) => {
              try {
                const account = createAddressFromString(processingAddress)
                const storage = await self.stateCopy.dumpStorage(account)
                self.storageCache[processingHash][processingAddress] = storage
              } catch (e) {
                console.log(e)
              }
            })(this.processingHash, this.processingAddress, this)
          }
        }
      }
      if (previousOpcode && (previousOpcode.op === 'SHA3' || previousOpcode.op === 'KECCAK256')) {
        const preimage = this.getSha3Input(previousOpcode.stack, formatMemory(this.lastMemoryUpdate))
        const imageHash = toHexPaddedString(step.stack[step.stack.length - 1]).replace('0x', '')
        this.sha3Preimages[imageHash] = {
          preimage: preimage
        }
      }
      this.processingIndex++
      this.previousDepth = depth
    } catch (e) {
      console.log(e)
    }
  }

  getCode (address, cb) {
    address = toChecksumAddress(address)
    this.vm.stateManager.getCode(createAddressFromString(address)).then((result) => {
      cb(null, bytesToHex(result))
    }).catch((error) => {
      cb(error)
    })
  }

  setProvider (provider) {}

  traceTransaction (txHash, options, cb) {
    if (this.vmTraces[txHash]) {
      if (cb) {
        cb(null, this.vmTraces[txHash])
      }
      return this.vmTraces[txHash]
    }
    if (cb) {
      cb('unable to retrieve traces ' + txHash, null)
    }
  }

  getStorageAt (address: string, position: string, blockNumber: string, cb) {
    // we don't use the range params here
    address = toChecksumAddress(address)

    blockNumber = blockNumber === 'latest' ? this.vmContext.latestBlockNumber : blockNumber

    const block = this.vmContext.blocks[blockNumber]
    const txHash = bytesToHex(block.transactions[block.transactions.length - 1].hash())

    if (this.storageCache['after_' + txHash] && this.storageCache['after_' + txHash][address]) {
      const slot = bytesToHex(hash.keccak(toBytes(zeroPadValue(padHexToEven(position), 32) as PrefixedHexString)))
      const storage = this.storageCache['after_' + txHash][address]
      return cb(null, storage[slot].value)
    }
    // Before https://github.com/ethereum/remix-project/pull/1703, it used to throw error as
    // 'unable to retrieve storage ' + txIndex + ' ' + address
    cb(null, '0x0')
  }

  storageRangeAt (blockNumber, txIndex, address, start, maxLength, cb) {
    // we don't use the range params here
    address = toChecksumAddress(address)

    const block = this.vmContext.blocks[blockNumber]
    const txHash = bytesToHex(block.transactions[txIndex].hash())

    if (this.storageCache[txHash] && this.storageCache[txHash][address]) {
      const storage = this.storageCache[txHash][address]
      return cb(null, {
        storage: JSON.parse(JSON.stringify(storage)),
        nextKey: null
      })
    }
    // Before https://github.com/ethereum/remix-project/pull/1703, it used to throw error as
    // 'unable to retrieve storage ' + txIndex + ' ' + address
    cb(null, { storage: {} })
  }

  getBlockNumber (cb) { cb(null, 'vm provider') }

  getTransaction (txHash, cb) {
    if (this.txs[txHash]) {
      if (cb) {
        cb(null, this.txs[txHash])
      }
      return this.txs[txHash]
    }
    if (cb) {
      cb('unable to retrieve tx ' + txHash, null)
    }
  }

  getTransactionReceipt (txHash, cb) {
    // same as getTransaction but return the created address also
    if (this.txsReceipt[txHash]) {
      if (cb) {
        cb(null, this.txsReceipt[txHash])
      }
      return this.txsReceipt[txHash]
    }
    if (cb) {
      cb('unable to retrieve txReceipt ' + txHash, null)
    }
  }

  getTransactionFromBlock (blockNumber, txIndex, cb) {
    const mes = 'not supposed to be needed by remix in vmmode'
    console.log(mes)
    if (cb) {
      cb(mes, null)
    }
  }

  preimage (hashedKey, cb) {
    hashedKey = hashedKey.replace('0x', '')
    cb(null, this.sha3Preimages[hashedKey] !== undefined ? this.sha3Preimages[hashedKey].preimage : null)
  }

  getSha3Input (stack, memory) {
    const memoryStart = toHexPaddedString(stack[stack.length - 1])
    const memoryLength = toHexPaddedString(stack[stack.length - 2])
    const memStartDec = BigInt(memoryStart).toString(10)
    const memoryStartInt = parseInt(memStartDec) * 2
    const memLengthDec = BigInt(memoryLength).toString(10)
    const memoryLengthInt = parseInt(memLengthDec.toString()) * 2

    let i = Math.floor(memoryStartInt / 32)
    const maxIndex = Math.floor(memoryLengthInt / 32) + i
    if (!memory[i]) {
      return this.emptyFill(memoryLength)
    }
    let sha3Input = memory[i].slice(memoryStartInt - 32 * i)
    i++
    while (i < maxIndex) {
      sha3Input += memory[i] ? memory[i] : this.emptyFill(32)
      i++
    }
    if (sha3Input.length < memoryLength) {
      const leftSize = memoryLengthInt - sha3Input.length
      sha3Input += memory[i] ? memory[i].slice(0, leftSize) : this.emptyFill(leftSize)
    }
    return sha3Input
  }

  emptyFill (size) {
    return (new Array(size)).join('0')
  }
}
