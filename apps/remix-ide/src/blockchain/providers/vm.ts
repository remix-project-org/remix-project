import { privateToAddress, bytesToHex } from '@ethereumjs/util'
import { extendProvider, JSONRPCRequestPayload, JSONRPCResponseCallback } from '@remix-project/remix-simulator'
import { ExecutionContext } from '../execution-context'
import { BrowserProvider, formatUnits, ethers, hashMessage, toUtf8Bytes, keccak256 } from 'ethers'

export class VMProvider {
  executionContext: ExecutionContext
  web3: BrowserProvider
  worker: Worker
  provider: {
    sendAsync: (query: JSONRPCRequestPayload, callback?: JSONRPCResponseCallback) => void | Promise<any>
    request: (query: JSONRPCRequestPayload) => Promise<any>
  }
  private stopWorker: () => void
  private sendWorkerRequest: (cmd: string, payload?: object) => Promise<any>
  constructor (executionContext: ExecutionContext) {
    this.executionContext = executionContext
    this.worker = null
    this.provider = null
  }

  getAccounts (cb) {
    this.web3.send("eth_requestAccounts", [])
      .then(accounts => cb(null, accounts))
      .catch(err => {
        cb('No accounts?')
      })
  }

  async resetEnvironment (stringifiedState?: string) {
    this.stopWorker?.()
    const worker = new Worker(new URL('./worker-vm', import.meta.url))
    this.worker = worker
    const provider = this.executionContext.getProviderObject()
    const context = this.executionContext.getProvider()

    let incr = 0
    let active = true
    let web3: BrowserProvider
    const resetError = new Error('VM environment was reset')
    const pending = new Map<number, { resolve: (result: any) => void; reject: (error: any) => void }>()

    // Each provider keeps its own worker and request registry, including after a reset.
    const send = (cmd: string, payload: object = {}) => new Promise<any>((resolve, reject) => {
      if (!active) return reject(resetError)
      const stamp = ++incr
      pending.set(stamp, { resolve, reject })
      try {
        worker.postMessage({ cmd, ...payload, stamp })
      } catch (error) {
        pending.delete(stamp)
        reject(error)
      }
    })
    this.sendWorkerRequest = send

    return new Promise((resolve, reject) => {
      const onMessage = (msg: MessageEvent) => {
        if (!active) return
        if (['requestResult', 'sendAsyncResult', 'newAccountResult'].includes(msg.data.cmd)) {
          const request = pending.get(msg.data.stamp)
          if (request) {
            pending.delete(msg.data.stamp)
            if (msg.data.error) request.reject(msg.data.error)
            else request.resolve(msg.data.result)
          }
        } else if (msg.data.cmd === 'initiateResult') {
          if (!msg.data.error) {
            this.provider = {
              sendAsync: (query, callback) => {
                const result = send('sendAsync', { query })
                if (!callback) return result
                // Callback callers do not consume a second, potentially rejected promise.
                result.then(value => callback(null, value), error => callback(error))
              },
              request: (query) => send('request', { query })
            }
            web3 = new ethers.BrowserProvider(this.provider)
            extendProvider(web3)
            this.web3 = web3
            this.executionContext.setWeb3(context, web3)
            resolve({})
          } else {
            reject(new Error(msg.data.error.message || msg.data.error))
          }
        }
      }
      worker.addEventListener('message', onMessage)
      this.stopWorker = () => {
        active = false
        worker.removeEventListener('message', onMessage)
        worker.terminate()
        // Also settle initialization if a second switch interrupted it.
        reject(resetError)
        for (const request of pending.values()) request.reject(resetError)
        pending.clear()
        web3?.destroy()
      }
      if (stringifiedState) {
        try {
          const blockchainState = JSON.parse(stringifiedState)
          const blockNumber = parseInt(blockchainState.latestBlockNumber, 16)
          const stateDb = blockchainState.db

          worker.postMessage({
            cmd: 'init',
            fork: this.executionContext.getCurrentFork(),
            nodeUrl: blockchainState.nodeUrl || provider?.options['nodeUrl'],
            blockNumber,
            stateDb,
            baseBlockNumer: blockchainState.baseBlockNumber,
            blocks: blockchainState.blocks
          })
        } catch (e) {
          reject(e)
        }
      } else {
        worker.postMessage({
          cmd: 'init',
          fork: this.executionContext.getCurrentFork(),
          nodeUrl: provider?.options['nodeUrl'],
          blockNumber: provider?.options['blockNumber']
        })
      }
    })
  }

  // TODO: is still here because of the plugin API
  // can be removed later when we update the API
  createVMAccount (newAccount) {
    const { privateKey, balance } = newAccount
    this.worker.postMessage({ cmd: 'addAccount', privateKey: privateKey, balance })
    const privKey: any = Buffer.from(privateKey, 'hex')
    return bytesToHex(privateToAddress(privKey))
  }

  newAccount (_passwordPromptCb, cb) {
    this.sendWorkerRequest('newAccount').then(address => cb(null, address), error => cb(error))
  }

  async getBalanceInEther (address) {
    const balance = await this.web3.getBalance(address)
    const balInString = BigInt(balance).toString(10)
    return balInString === '0' ? balInString : formatUnits(balInString, 'ether')
  }

  getGasPrice (cb) {
    this.web3.getFeeData().then(result => cb(null, result.gasPrice), error => cb(error))
  }

  signMessage (message, account, _passphrase, cb) {
    const messageHash = hashMessage(message)
    this.web3.getSigner(account)
      .then(signer => signer._legacySignMessage(toUtf8Bytes(message)))
      .then(signedData => cb(null, messageHash, signedData), error => cb(error))
  }
}
