import * as async from 'async'
import * as remixLib from '@remix-project/remix-lib'
import { bytesToHex } from '@ethereumjs/util'
import { hash } from '@remix-project/remix-lib'
import { Plugin } from '@remixproject/engine'
import * as packageJson from '../../../../.././../../package.json'
import { trackMatomoEvent } from '@remix-api'
const EventManager = remixLib.EventManager
const format = remixLib.execution.txFormat
const txHelper = remixLib.execution.txHelper
import { addressToString } from '@remix-ui/helper'

interface RecorderData {
  _listen: boolean;
  _replay: boolean;
  journal: any[];
  _createdContracts: { [key: string]: any };
  _createdContractsReverse: { [key: string]: any };
  _usedAccounts: { [key: string]: any };
  _abis: { [key: string]: any };
  _contractABIReferences: { [key: string]: any };
  _linkReferences: { [key: string]: any };
}

interface RecorderRecord {
  value: any;
  inputs: any;
  parameters: any;
  name: any;
  type: any;
  abi?: any;
  contractName?: any;
  bytecode?: any;
  linkReferences?: any;
  to?: any;
  from?: any;
}

interface JournalEntry {
  timestamp: string | number;
  record: RecorderRecord;
}

const profile = {
  name: 'recorder',
  displayName: 'Recorder',
  description: 'Records transactions to save and run',
  version: packageJson.version,
  methods: []
}
/**
  * Record transaction as long as the user create them.
  */
export class Recorder extends Plugin {
  event: any;
  blockchain: any;
  data: RecorderData;

  constructor (blockchain: any) {
    super(profile)
    this.event = new EventManager()
    this.blockchain = blockchain
    this.data = { _listen: true, _replay: false, journal: [], _createdContracts: {}, _createdContractsReverse: {}, _usedAccounts: {}, _abis: {}, _contractABIReferences: {}, _linkReferences: {} }

    this.blockchain.event.register('initiatingTransaction', (timestamp, tx, payLoad) => {
      if (tx.useCall) return
      const { from, to, value } = tx

      // convert to and from to tokens
      if (this.data._listen) {
        const record: RecorderRecord = {
          value,
          inputs: txHelper.serializeInputs(payLoad.funAbi),
          parameters: payLoad.funArgs,
          name: payLoad.funAbi.name,
          type: payLoad.funAbi.type
        }
        if (!to) {
          const abi = payLoad.contractABI
          const keccak = bytesToHex(hash.keccakFromString(JSON.stringify(abi)))
          record.abi = keccak
          record.contractName = payLoad.contractName
          record.bytecode = payLoad.contractBytecode
          record.linkReferences = payLoad.linkReferences
          if (record.linkReferences && Object.keys(record.linkReferences).length) {
            for (const file in record.linkReferences) {
              for (const lib in record.linkReferences[file]) {
                this.data._linkReferences[lib] = '<address>'
              }
            }
          }
          this.data._abis[keccak] = abi

          this.data._contractABIReferences[timestamp] = keccak
        } else {
          const creationTimestamp = this.data._createdContracts[to]
          record.to = `created{${creationTimestamp}}`
          record.abi = this.data._contractABIReferences[creationTimestamp]
        }
        for (const p in record.parameters) {
          const thisarg = record.parameters[p]
          const thistimestamp = this.data._createdContracts[thisarg]
          if (thistimestamp) record.parameters[p] = `created{${thistimestamp}}`
        }

        this.blockchain.getAccounts((error, accounts) => {
          if (error) return console.log(error)
          record.from = `account{${accounts.indexOf(from)}}`
          this.data._usedAccounts[record.from] = from
          this.append(timestamp, record)
        })
      }
    })

    this.blockchain.event.register('transactionExecuted', (error, from, to, data, call, txResult, timestamp, _payload) => {
      if (error) return console.log(error)
      if (call) return
      const rawAddress = txResult.receipt.contractAddress
      if (!rawAddress) return // not a contract creation
      const address = addressToString(rawAddress)
      // save back created addresses for the conversion from tokens to real addresses
      this.data._createdContracts[address] = timestamp
      this.data._createdContractsReverse[timestamp] = address
    })
    this.blockchain.event.register('contextChanged', this.clearAll.bind(this))
    this.event.register('newTxRecorded', (count) => {
      this.event.trigger('recorderCountChange', [count])
    })
    this.event.register('cleared', () => {
      this.event.trigger('recorderCountChange', [0])
    })
  }

  /**
    * stop/start saving txs. If not listening, is basically in replay mode
    *
    * @param {Bool} listen
    */
  setListen (listen) {
    this.data._listen = listen
    this.data._replay = !listen
  }

  extractTimestamp (value) {
    const stamp = /created{(.*)}/g.exec(value)
    if (stamp) {
      return stamp[1]
    }
    return null
  }

  /**
    * convert back from/to from tokens to real addresses
    *
    * @param {Object} record
    * @param {Object} accounts
    * @param {Object} options
    *
    */
  resolveAddress (record, accounts, options) {
    if (record.to) {
      const stamp = this.extractTimestamp(record.to)
      if (stamp) {
        record.to = this.data._createdContractsReverse[stamp]
      }
    }
    record.from = accounts[record.from]
    // @TODO: writing browser test
    return record
  }

  /**
    * save the given @arg record
    *
    * @param {Number/String} timestamp
    * @param {Object} record
    *
    */
  append (timestamp, record) {
    this.data.journal.push({ timestamp, record })
    this.event.trigger('newTxRecorded', [this.data.journal.length])
  }

  /**
    * basically return the records + associate values (like abis / accounts)
    *
    */
  getAll () {
    const records = [].concat(this.data.journal)
    return {
      accounts: this.data._usedAccounts,
      linkReferences: this.data._linkReferences,
      transactions: records.sort((A, B) => {
        const stampA = A.timestamp
        const stampB = B.timestamp
        return stampA - stampB
      }),
      abis: this.data._abis
    }
  }

  /**
    * delete the seen transactions
    *
    */
  clearAll () {
    this.data._listen = true
    this.data._replay = false
    this.data.journal = []
    this.data._createdContracts = {}
    this.data._createdContractsReverse = {}
    this.data._usedAccounts = {}
    this.data._abis = {}
    this.data._contractABIReferences = {}
    this.data._linkReferences = {}
    this.event.trigger('cleared', [])
  }

  /**
    * run the list of records
    *
    * @param {Object} records
    * @param {Object} accounts
    * @param {Object} options
    * @param {Object} abis
    * @param {Object} linkReferences
    * @param {Function} confirmationCb
    * @param {Function} continueCb
    * @param {Function} promptCb
    * @param {Function} alertCb
    * @param {Function} logCallBack
    * @param {Function} liveMode
    * @param {Function} newContractFn
    *
    */
  run (records, accounts, options, abis, linkReferences, confirmationCb, continueCb, promptCb, alertCb, logCallBack, liveMode, newContractFn) {
    this.setListen(false)
    const liveMsg = liveMode ? ' with updated contracts' : ''
    logCallBack(`Running ${records.length} transaction(s)${liveMsg} ...`)
    async.eachOfSeries(records, async (tx: JournalEntry, index, cb) => {
      if (liveMode && tx.record.type === 'constructor') {
        // resolve the bytecode and ABI using the contract name, this ensure getting the last compiled one.
        const data = await this.call('compilerArtefacts', 'getArtefactsByContractName', tx.record.contractName)
        tx.record.bytecode = data.artefact.evm.bytecode.object
        const updatedABIKeccak = bytesToHex(hash.keccakFromString(JSON.stringify(data.artefact.abi)))
        abis[updatedABIKeccak] = data.artefact.abi
        tx.record.abi = updatedABIKeccak
      }
      const record = this.resolveAddress(tx.record, accounts, options)
      const abi = abis[tx.record.abi]
      if (!abi) {
        return alertCb('cannot find ABI for ' + tx.record.abi + '.  Execution stopped at ' + index)
      }
      /* Resolve Library */
      if (record.linkReferences && Object.keys(record.linkReferences).length) {
        for (const k in linkReferences) {
          let link = linkReferences[k]
          const timestamp = this.extractTimestamp(link)
          if (timestamp && this.data._createdContractsReverse[timestamp]) {
            link = this.data._createdContractsReverse[timestamp]
          }
          tx.record.bytecode = format.linkLibraryStandardFromlinkReferences(k, link.replace('0x', ''), tx.record.bytecode, tx.record.linkReferences)
        }
      }
      /* Encode params */
      let fnABI
      if (tx.record.type === 'constructor') {
        fnABI = txHelper.getConstructorInterface(abi)
      } else if (tx.record.type === 'fallback') {
        fnABI = txHelper.getFallbackInterface(abi)
      } else if (tx.record.type === 'receive') {
        fnABI = txHelper.getReceiveInterface(abi)
      } else {
        fnABI = txHelper.getFunction(abi, record.name + record.inputs)
      }
      if (!fnABI) {
        alertCb('cannot resolve abi of ' + JSON.stringify(record, null, '\t') + '. Execution stopped at ' + index)
        return cb(new Error('cannot resolve abi'))
      }
      if (tx.record.parameters) {
        /* check if we have some params to resolve */
        try {
          tx.record.parameters.forEach((value, index) => {
            let isString = true
            if (typeof value !== 'string') {
              isString = false
              value = JSON.stringify(value)
            }
            for (const timestamp in this.data._createdContractsReverse) {
              value = value.replace(new RegExp('created\\{' + timestamp + '\\}', 'g'), this.data._createdContractsReverse[timestamp])
            }
            if (!isString) value = JSON.parse(value)
            tx.record.parameters[index] = value
          })
        } catch (e) {
          return alertCb('cannot resolve input parameters ' + JSON.stringify(tx.record.parameters) + '. Execution stopped at ' + index)
        }
      }
      const data = format.encodeData(fnABI, tx.record.parameters, tx.record.bytecode)
      if (data.error) {
        alertCb(data.error + '. Record:' + JSON.stringify(record, null, '\t') + '. Execution stopped at ' + index)
        return cb(new Error(data.error))
      }
      logCallBack(`(${index}) ${JSON.stringify(record, null, '\t')}`)
      logCallBack(`(${index}) data: ${data.data}`)
      record.data = { dataHex: data.data, funArgs: tx.record.parameters, funAbi: fnABI, contractBytecode: tx.record.bytecode, contractName: tx.record.contractName, timestamp: tx.timestamp }

      this.blockchain.runTx(record, confirmationCb, continueCb, promptCb,
        (err, txResult, rawAddress) => {
          if (err) {
            console.error(err)
            return logCallBack(err + '. Execution failed at ' + index)
          }
          if (rawAddress) {
            const address = addressToString(rawAddress)
            // save back created addresses for the conversion from tokens to real addresses
            this.data._createdContracts[address] = tx.timestamp
            this.data._createdContractsReverse[tx.timestamp] = address
            newContractFn(abi, address, record.contractName)
          }
          cb(err)
        }
      )
    }, () => { this.setListen(true) })
  }

  runScenario (liveMode, json, continueCb, promptCb, alertCb, confirmationCb, logCallBack, cb) {
    trackMatomoEvent(this, { category: 'run', action: 'recorder', name: 'start', isClick: true })
    if (!json) {
      trackMatomoEvent(this, { category: 'run', action: 'recorder', name: 'wrong-json', isClick: false })
      return cb('a json content must be provided')
    }
    if (typeof json === 'string') {
      try {
        json = JSON.parse(json)
      } catch (e) {
        return cb('A scenario file is required. It must be json formatted')
      }
    }

    let txArray
    let accounts
    let options
    let abis
    let linkReferences
    try {
      txArray = json.transactions || []
      accounts = json.accounts || []
      options = json.options || {}
      abis = json.abis || {}
      linkReferences = json.linkReferences || {}
    } catch (e) {
      return cb('Invalid scenario file. Please try again')
    }

    if (!txArray.length) {
      return cb('No transactions found in scenario file')
    }

    this.run(txArray, accounts, options, abis, linkReferences, confirmationCb, continueCb, promptCb, alertCb, logCallBack, liveMode, (abi, address, contractName) => {
      cb(null, abi, address, contractName)
    })
  }
}
