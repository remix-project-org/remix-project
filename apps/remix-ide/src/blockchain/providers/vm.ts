import { privateToAddress, bytesToHex } from '@ethereumjs/util'
import { extendProvider, JSONRPCRequestPayload, JSONRPCResponseCallback } from '@remix-project/remix-simulator'
import { ExecutionContext } from '../execution-context'
import { BrowserProvider, formatUnits, ethers, hashMessage, toUtf8Bytes, keccak256 } from 'ethers'

export class VMProvider {
  executionContext: ExecutionContext
  web3: BrowserProvider
  worker: Worker
  provider: {
    sendAsync: (query: JSONRPCRequestPayload, callback: JSONRPCResponseCallback) => void
    request: (query: JSONRPCRequestPayload) => Promise<any>
  }
  newAccountCallback: {[stamp: number]: (error: Error, address: string) => void}
  constructor (executionContext: ExecutionContext) {
    this.executionContext = executionContext
    this.worker = null
    this.provider = null
    this.newAccountCallback = {}
  }

  getAccounts (cb) {
    this.web3.send("eth_requestAccounts", [])
      .then(accounts => cb(null, accounts))
      .catch(err => {
        cb('No accounts?')
      })
  }

  async resetEnvironment (stringifiedState?: string) {
    if (this.worker) this.worker.terminate()
    this.worker = new Worker(new URL('./worker-vm', import.meta.url))
    const provider = this.executionContext.getProviderObject()

    let incr = 0
    const stamps = {}

    return new Promise((resolve, reject) => {
      this.worker.addEventListener('message', (msg) => {
        if (msg.data.cmd === 'requestResult' && stamps[msg.data.stamp]) {
          if (msg.data.error) {
            stamps[msg.data.stamp].reject(msg.data.error)
          } else {
            stamps[msg.data.stamp].resolve(msg.data.result)
          }
        } else if (msg.data.cmd === 'sendAsyncResult' && stamps[msg.data.stamp]) {
          if (stamps[msg.data.stamp].callback) {
            stamps[msg.data.stamp].callback(msg.data.error, msg.data.result)
            return
          }
          if (msg.data.error) {
            stamps[msg.data.stamp].reject(msg.data.error)
          } else {
            stamps[msg.data.stamp].resolve(msg.data.result)
          }
        } else if (msg.data.cmd === 'initiateResult') {
          if (!msg.data.error) {
            this.provider = {
              sendAsync: (query, callback) => {
                return new Promise((resolve, reject) => {
                  const stamp = Date.now() + incr
                  incr++
                  stamps[stamp] = { callback, resolve, reject }
                  this.worker.postMessage({ cmd: 'sendAsync', query, stamp })
                })
              },
              request: (query) => {
                return new Promise((resolve, reject) => {
                  const stamp = Date.now() + incr
                  incr++
                  stamps[stamp] = { resolve, reject }
                  this.worker.postMessage({ cmd: 'request', query, stamp })
                })
              }
            }
            this.web3 = new ethers.BrowserProvider(this.provider)
            extendProvider(this.web3)
            this.executionContext.setWeb3(this.executionContext.getProvider(), this.web3)
            resolve({})
          } else {
            reject(new Error(msg.data.error))
          }
        } else if (msg.data.cmd === 'newAccountResult') {
          if (this.newAccountCallback[msg.data.stamp]) {
            this.newAccountCallback[msg.data.stamp](msg.data.error, msg.data.result)
            delete this.newAccountCallback[msg.data.stamp]
          }
        }
      })
      if (stringifiedState) {
        try {
          const blockchainState = JSON.parse(stringifiedState)
          const blockNumber = parseInt(blockchainState.latestBlockNumber, 16)
          const stateDb = blockchainState.db

          this.worker.postMessage({
            cmd: 'init',
            fork: this.executionContext.getCurrentFork(),
            nodeUrl: blockchainState.nodeUrl || provider?.options['nodeUrl'],
            blockNumber,
            stateDb,
            baseBlockNumer: blockchainState.baseBlockNumber,
            blocks: blockchainState.blocks
          })
        } catch (e) {
          console.error(e)
        }
      } else {
        this.worker.postMessage({
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
    const stamp = Date.now()
    this.newAccountCallback[stamp] = cb
    this.worker.postMessage({ cmd: 'newAccount', stamp })
  }

  async getBalanceInEther (address) {
    const balance = await this.web3.getBalance(address)
    const balInString = BigInt(balance).toString(10)
    return balInString === '0' ? balInString : formatUnits(balInString, 'ether')
  }

  getGasPrice (cb) {
    this.web3.getFeeData().then((result => cb(null, result.gasPrice)))
  }

  signMessage (message, account, _passphrase, cb) {
    const messageHash = hashMessage(message)
    this.web3.getSigner(account).then((signer) => {
      signer._legacySignMessage(toUtf8Bytes(message))
        .then(signedData => cb(null, messageHash, signedData))
        .catch(error => cb(error))
    })
  }
}
