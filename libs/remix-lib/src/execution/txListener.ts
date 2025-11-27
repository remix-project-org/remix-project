'use strict'
import { AbiCoder, Block } from 'ethers'
import { toBytes, addHexPrefix } from '@ethereumjs/util'
import { EventManager } from '../eventManager'
import { compareByteCode, getinputParameters } from '../util'
import { decodeResponse } from './txFormat'
import { getFunction, getReceiveInterface, getConstructorInterface, visitContracts, makeFullTypeDefinition } from './txHelper'

function addExecutionCosts (txResult, tx, execResult) {
  if (txResult) {
    if (execResult) {
      tx.returnValue = execResult.returnValue
      if (execResult.executionGasUsed) tx.executionCost = execResult.executionGasUsed.toString(10)
    }
    if (txResult.receipt && txResult.receipt.gasUsed) tx.transactionCost = txResult.receipt.gasUsed.toString(10)
  }
}

/**
  * poll web3 each 2s if web3
  * listen on transaction executed event if VM
  * attention: blocks returned by the event `newBlock` have slightly different json properties whether web3 or the VM is used
  * trigger 'newBlock'
  *
  */
export class TxListener {
  event
  executionContext
  _resolvedTransactions
  _api
  _resolvedContracts
  _isListening: boolean
  _listenOnNetwork:boolean
  _loopId
  blocks

  constructor (opt, executionContext) {
    this.event = new EventManager()
    // has a default for now for backwards compatibility
    this.executionContext = executionContext
    this._api = opt.api
    this._resolvedTransactions = {}
    this._resolvedContracts = {}
    this._isListening = false
    this._listenOnNetwork = false
    this._loopId = null
    this.init()
    this.executionContext.event.register('contextChanged', (context) => {
      if (this._isListening) {
        this.stopListening()
        this.startListening()
      }
    })

    opt.event.udapp.register('callExecuted', async (error, from, to, data, lookupOnly, txResult) => {
      if (error) return
      // we go for that case if
      // in VM mode
      // in web3 mode && listen remix txs only
      if (!this._isListening) return // we don't listen
      if (this._loopId) return // we seems to already listen on a "web3" network

      let returnValue
      let execResult
      if (this.executionContext.isVM()) {
        execResult = await this.executionContext.web3().remix.getExecutionResultFromSimulator(txResult.transactionHash)
        returnValue = toBytes(execResult.returnValue)
      } else {
        returnValue = toBytes(addHexPrefix(txResult.result))
      }
      const call = {
        from: from,
        to: to,
        input: data,
        hash: txResult.transactionHash ? txResult.transactionHash : 'call' + (from || '') + to + data,
        isCall: true,
        returnValue,
        envMode: this.executionContext.getProvider()
      }

      addExecutionCosts(txResult, call, execResult)
      this._resolveTx(call, call, (error, resolvedData) => {
        if (!error) {
          this.event.trigger('newCall', [call])
        }
      })
    })

    opt.event.udapp.register('transactionExecuted', (error, from, to, data, lookupOnly, txResult) => {
      if (error) return
      if (lookupOnly) return
      // we go for that case if
      // in VM mode
      // in web3 mode && listen remix txs only
      if (!this._isListening) return // we don't listen
      if (this._loopId) return // we seems to already listen on a "web3" network
      this.executionContext.web3().getTransaction(txResult.transactionHash).then(async tx=>{
        let execResult
        if (this.executionContext.isVM()) {
          execResult = await this.executionContext.web3().remix.getExecutionResultFromSimulator(txResult.transactionHash)
        }

        addExecutionCosts(txResult, tx, execResult)
        tx.envMode = this.executionContext.getProvider()
        tx.status = txResult.receipt.status
        tx.isUserOp = txResult.tx.isUserOp
        tx.originTo = txResult.tx.originTo
        this._resolve([tx])
      }).catch(error=>console.log(error))
    })
  }

  /**
    * define if txlistener should listen on the network or if only tx created from remix are managed
    *
    * @param {Bool} type - true if listen on the network
    */
  setListenOnNetwork (listenOnNetwork) {
    this._listenOnNetwork = listenOnNetwork
    if (this._loopId) {
      clearInterval(this._loopId)
    }
    this._listenOnNetwork ? this.startListening() : this.stopListening()
  }

  /**
    * reset recorded transactions
    */
  init () {
    this.blocks = []
  }

  /**
    * start listening for incoming transactions
    *
    * @param {String} type - type/name of the provider to add
    * @param {Object} obj  - provider
    */
  startListening () {
    this.init()
    this._isListening = true
    if (this._listenOnNetwork && !this.executionContext.isVM()) {
      this._startListenOnNetwork()
    }
  }

  /**
    * stop listening for incoming transactions. do not reset the recorded pool.
    *
    * @param {String} type - type/name of the provider to add
    * @param {Object} obj  - provider
    */
  stopListening () {
    if (this._loopId) {
      clearInterval(this._loopId)
    }
    this._loopId = null
    this._isListening = false
  }

  async _startListenOnNetwork () {
    let lastSeenBlock = BigInt(this.executionContext.lastBlock?.number) - BigInt(1)
    let processingBlock = false
    const processBlocks = async () => {
      if (!this._isListening) return
      if (processingBlock) return
      processingBlock = true
      const currentLoopId = this._loopId
      if (this._loopId === null) {
        processingBlock = false
        return
      }
      if (!lastSeenBlock) {
        lastSeenBlock = this.executionContext.lastBlock?.number // trying to resynchronize
        console.log('listen on blocks, resynchronising')
        processingBlock = false
        return
      }
      const current = this.executionContext.lastBlock?.number
      if (!current) {
        console.log(new Error('no last block found'))
        processingBlock = false
        return
      }
      if (currentLoopId === this._loopId && lastSeenBlock < current) {
        while (lastSeenBlock <= current) {
          try {
            if (!this._isListening) break
            await this._manageBlock(lastSeenBlock)
          } catch (e) {
            console.log(e)
          }
          lastSeenBlock++
        }
        lastSeenBlock = current
      }
      processingBlock = false
    }
    this._loopId = setInterval(processBlocks, 20000)
    processBlocks()
  }

  async _manageBlock (blockNumber) {
    try {
      const result: Block = await this.executionContext.web3().getBlock(blockNumber, true)
      return await this._newBlock(Object.assign(result, { type: 'web3' } ))
    } catch (e) { }
  }

  /**
    * try to resolve the contract name from the given @arg address
    *
    * @param {String} address - contract address to resolve
    * @return {String} - contract name
    */
  resolvedContract (address) {
    if (this._resolvedContracts[address]) return this._resolvedContracts[address].name
    return null
  }

  /**
    * try to resolve the transaction from the given @arg txHash
    *
    * @param {String} txHash - contract address to resolve
    * @return {String} - contract name
    */
  resolvedTransaction (txHash) {
    return this._resolvedTransactions[txHash]
  }

  async _newBlock (block) {
    this.blocks.push(block)
    await this._resolve(block.prefetchedTransactions || block.transactions)
    this.event.trigger('newBlock', [block])
  }

  _resolveAsync (tx) {
    return new Promise((resolve, reject) => {
      this._api.resolveReceipt(tx, (error, receipt) => {
        if (error) return reject(error)
        this._resolveTx(tx, receipt, (error, resolvedData) => {
          if (error) return reject(error)
          if (resolvedData) {
            this.event.trigger('txResolved', [tx, receipt, resolvedData])
          }
          this.event.trigger('newTransaction', [tx, receipt])
          resolve({})
        })
      })
    })
  }

  async _resolve (transactions) {
    for (const tx of transactions) {
      try {
        if (!this._isListening) break
        await this._resolveAsync(tx)
      } catch (e) { console.error(e)}
    }
  }

  _resolveTx (tx, receipt, cb) {
    const contracts = this._api.contracts()
    if (!contracts) return cb()
    let fun
    let contract
    if (!tx.to || tx.to === '0x0') { // testrpc returns 0x0 in that case
      // contract creation / resolve using the creation bytes code
      // if web3: we have to call getTransactionReceipt to get the created address
      // if VM: created address already included
      const code = tx.data
      contract = this._tryResolveContract(code, contracts, true)
      if (contract) {
        const address = receipt.contractAddress
        this._resolvedContracts[address] = contract
        fun = this._resolveFunction(contract, tx, true)
        if (this._resolvedTransactions[tx.hash]) {
          this._resolvedTransactions[tx.hash].contractAddress = address
        }
        return cb(null, { to: null, contractName: contract.name, function: fun, creationAddress: address })
      }
      return cb()
    } else {
      // first check known contract, resolve against the `runtimeBytecode` if not known
      contract = this._resolvedContracts[tx.to]
      if (!contract) {
        this.executionContext.web3().getCode(tx.to).then(code=>{
          if (code) {
            const contract = this._tryResolveContract(code, contracts, false)
            if (contract) {
              this._resolvedContracts[tx.to] = contract
              const fun = this._resolveFunction(contract, tx, false)
              return cb(null, { to: tx.to, contractName: contract.name, function: fun })
            }
          }
          return cb()
        }).catch(error=>cb(error))
        return
      }
      if (contract) {
        fun = this._resolveFunction(contract, tx, false)
        return cb(null, { to: tx.to, contractName: contract.name, function: fun })
      }
      return cb()
    }
  }

  _resolveFunction (contract, tx, isCtor) {
    if (!contract) {
      console.log('txListener: cannot resolve contract - contract is null')
      return
    }
    const abi = contract.object.abi
    const txInput = tx.data || tx.input
    const inputData = txInput.replace('0x', '')
    if (!isCtor) {
      const methodIdentifiers = contract.object.evm.methodIdentifiers
      for (const fn in methodIdentifiers) {
        if (methodIdentifiers[fn] === inputData.substring(0, 8)) {
          const fnabi = getFunction(abi, fn)
          this._resolvedTransactions[tx.hash] = {
            contractName: contract.name,
            to: tx.to,
            fn: fn,
            params: this._decodeInputParams(inputData.substring(8), fnabi)
          }
          if (tx.returnValue) {
            this._resolvedTransactions[tx.hash].decodedReturnValue = decodeResponse(tx.returnValue, fnabi)
          }
          return this._resolvedTransactions[tx.hash]
        }
      }
      // receive function
      if (!inputData && getReceiveInterface(abi)) {
        this._resolvedTransactions[tx.hash] = {
          contractName: contract.name,
          to: tx.to,
          fn: '(receive)',
          params: null
        }
      } else {
        // fallback function
        this._resolvedTransactions[tx.hash] = {
          contractName: contract.name,
          to: tx.to,
          fn: '(fallback)',
          params: null
        }
      }
    } else {
      const bytecode = contract.object.evm.bytecode.object
      let params = null
      if (bytecode && bytecode.length) {
        params = this._decodeInputParams(getinputParameters(inputData), getConstructorInterface(abi))
      }
      this._resolvedTransactions[tx.hash] = {
        contractName: contract.name,
        to: null,
        fn: '(constructor)',
        params: params
      }
    }
    return this._resolvedTransactions[tx.hash]
  }

  _tryResolveContract (codeToResolve, compiledContracts, isCreation) {
    let found = null
    visitContracts(compiledContracts, (contract) => {
      const bytes = isCreation ? contract.object.evm.bytecode.object : contract.object.evm.deployedBytecode.object
      if (compareByteCode(codeToResolve, '0x' + bytes)) {
        found = contract
        return true
      }
    })
    return found
  }

  _decodeInputParams (data, abi) {
    data = toBytes(addHexPrefix(data))
    if (!data.length) data = new Uint8Array(32 * abi.inputs.length) // ensuring the data is at least filled by 0 cause `AbiCoder` throws if there's not enough data

    const inputTypes = []
    for (let i = 0; i < abi.inputs.length; i++) {
      const type = abi.inputs[i].type
      inputTypes.push(type.indexOf('tuple') === 0 ? makeFullTypeDefinition(abi.inputs[i]) : type)
    }
    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(inputTypes, data)
    const ret = {}
    for (const k in abi.inputs) {
      ret[abi.inputs[k].type + ' ' + abi.inputs[k].name] = decoded[k]
    }
    return ret
  }
}
