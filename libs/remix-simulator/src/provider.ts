import { Blocks } from './methods/blocks'

import { info } from './utils/logs'
import merge from 'merge'

import { Web3Accounts } from './methods/accounts'
import { Filters } from './methods/filters'
import { methods as miscMethods } from './methods/misc'
import { Net } from './methods/net'
import { Transactions } from './methods/transactions'
import { Miner } from './methods/miner'
import { Debug } from './methods/debug'
import { EVM } from './methods/evm'
import { VMContext } from './vm-context'

export interface JSONRPCRequestPayload {
  params: any[];
  method: string;
  id: number;
  jsonrpc: string;
}

export interface JSONRPCResponsePayload {
  result: any;
  id: number;
  jsonrpc: string;
}

export type JSONRPCResponseCallback = (err: Error, result?: JSONRPCResponsePayload) => void

export type State = Record<string, string>

export type ProviderOptions = {
  chainId?: number
  fork?: string,
  nodeUrl?: string,
  blockNumber?: number | 'latest',
  baseBlockNumber?: string, // hex
  stateDb?: State,
  details?: boolean
  blocks?: string[],
  coinbase?: string
}

export class Provider {
  options: ProviderOptions
  vmContext
  Accounts
  Transactions
  methods
  connected: boolean
  initialized: boolean
  initializing: boolean
  pendingRequests: Array<any>

  constructor (options: ProviderOptions = {} as ProviderOptions) {
    this.options = options
    this.connected = true
    this.vmContext = new VMContext(options['fork'], options['nodeUrl'], options['blockNumber'], options['stateDb'], options['blocks'], options['baseBlockNumber'])

    this.Accounts = new Web3Accounts(this.vmContext, options)
    this.Transactions = new Transactions(this.vmContext)

    this.methods = {}
    this.methods = merge(this.methods, this.Accounts.methods())
    this.methods = merge(this.methods, (new Blocks(this.vmContext, options)).methods())
    this.methods = merge(this.methods, miscMethods())
    this.methods = merge(this.methods, (new Filters(this.vmContext)).methods())
    this.methods = merge(this.methods, (new Net(this.vmContext, options)).methods())
    this.methods = merge(this.methods, this.Transactions.methods())
    this.methods = merge(this.methods, (new Debug(this.vmContext)).methods())
    this.methods = merge(this.methods, (new EVM(this.vmContext, this.Transactions)).methods())
    this.methods = merge(this.methods, (new Miner(this.vmContext)).methods())
  }

  async init () {
    this.initializing = true
    this.initialized = false
    this.pendingRequests = []
    await this.vmContext.init()
    await this.Accounts.resetAccounts()
    this.Transactions.init(this.Accounts.accounts, this.vmContext.serializedBlocks)
    this.initialized = true
    if (this.pendingRequests.length > 0) {
      this.pendingRequests.map((req) => {
        this.sendAsync(req.payload, req.callback)
      })
      this.pendingRequests = []
    }
    this.initializing = false
  }

  _send(payload: JSONRPCRequestPayload, callback: (err: Error, result?: JSONRPCResponsePayload) => void) {
    // log.info('payload method is ', payload.method) // commented because, this floods the IDE console
    if (!this.initialized) {
      this.pendingRequests.push({ payload, callback })
      return
    }
    const method = this.methods[payload.method]
    if (this.options.details) {
      info(payload)
    }
    if (method) {
      return method.call(method, payload, (err, result) => {
        if (this.options.details) {
          info(err)
          info(result)
        }
        if (err) {
          return callback(err)
        }
        const response = { id: payload.id, jsonrpc: '2.0', result: result }
        callback(null, response)
      })
    }
    callback(new Error('unknown method ' + payload.method))
  }

  async sendAsync (payload: JSONRPCRequestPayload, callback?: (err: Error, result?: JSONRPCResponsePayload) => void) : Promise<JSONRPCResponsePayload> {
    return new Promise((resolve,reject)=>{
      const cb = (err, result) => {
        if (typeof callback==='function'){
          return callback(err, result)
        }
        if (err){
          return reject(err)
        }
        return resolve(result)
      }
      this._send(payload, cb)
    })
  }

  send (payload, callback) {
    this.sendAsync(payload, callback)
  }

  async request (payload: JSONRPCRequestPayload) : Promise<any> {
    const ret = await this.sendAsync(payload)
    return ret.result
  }

  isConnected () {
    return true
  }

  disconnect () {
    return false
  }

  supportsSubscriptions () {
    return true
  }

  on (type, cb) {
    this.vmContext.logsManager.addListener(type, cb)
  }
}

export function extendProvider (provider) { // Provider should be ethers.js provider

  if (!provider.remix) provider.remix = {}

  provider.remix.getExecutionResultFromSimulator = async (transactionHash) => {
    return await provider.send('eth_getExecutionResultFromSimulator', [transactionHash])
  }

  provider.remix.getHHLogsForTx = async (transactionHash) => {
    return await provider.send('eth_getHHLogsForTx',[transactionHash])
  }

  provider.remix.getHashFromTagBySimulator = async (timestamp) => {
    return await provider.send('eth_getHashFromTagBySimulator', [timestamp])
  }

  provider.remix.registerCallId = async (id) => {
    return await provider.send('eth_registerCallId',[id])
  }

  provider.remix.getStateDb = async () => {
    return await provider.send('eth_getStateDb', [])
  }

  provider.remix.getBlocksData = async () => {
    return await provider.send('eth_getBlocksData',[])
  }
}
