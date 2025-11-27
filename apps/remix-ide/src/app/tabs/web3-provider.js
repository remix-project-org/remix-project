import { Plugin } from '@remixproject/engine'
import * as packageJson from '../../../../../package.json'
import { addressToString } from "@remix-ui/helper"

export const profile = {
  name: 'web3Provider',
  displayName: 'Global Web3 Provider',
  description: 'Represent the current web3 provider used by the app at global scope',
  methods: ['sendAsync'],
  version: packageJson.version,
  kind: 'provider'
}

const replacer = (key, value) => {
  if (typeof value === 'bigint') value = value.toString()
  return value
}

export class Web3ProviderModule extends Plugin {
  constructor(blockchain) {
    super(profile)
    this.blockchain = blockchain
  }

  async updateRemix(txHash) {
    const receipt = await this.tryTillReceiptAvailable(txHash)
    if (!receipt.contractAddress) {
      console.log('receipt available but contract address not present', receipt)
      return
    }
    const contractAddressStr = addressToString(receipt.contractAddress)
    const contractData = await this.call('compilerArtefacts', 'getContractDataFromAddress', contractAddressStr)
    if (contractData) {
      const data = await this.call('compilerArtefacts', 'getCompilerAbstract', contractData.file)
      const contractObject = {
        name: contractData.name,
        abi: contractData.contract.abi,
        compiler: data,
        contract: {
          file : contractData.file,
          object: contractData.contract
        }
      }
      this.call('udapp', 'addInstance', contractAddressStr, contractData.contract.abi, contractData.name, contractObject)
      await this.call('compilerArtefacts', 'addResolvedContract', contractAddressStr, data)
    }
  }

  async request (payload) {
    const res = await this.sendAsync(payload)
    if (res && res.error) throw new Error(res.error)
    return res.result
  } 

  send (payload) {
    return this.sendAsync(payload)
  }

  /*
    that is used by plugins to call the current ethereum provider.
    Should be taken carefully and probably not be release as it is now.
  */
  sendAsync(payload) {
    return new Promise((resolve, reject) => {
      this.askUserPermission('sendAsync', `Calling ${payload.method} with parameters ${JSON.stringify(payload.params, replacer, '\t')}`).then(
        async (result) => {
          if (result) {
            const provider = this.blockchain.getProviderObject().provider
            const resultFn = async (error, response) => {
              const message = response && response.result && response.result.jsonrpc ? response.result : response
              if (error) {
                // Handle 'The method "debug_traceTransaction" does not exist / is not available.' error
                if(error.message && error.code && error.code === -32601) {
                  this.call('terminal', 'log', { value: error.message, type: 'error' } )
                  return reject(error.message)
                } else {
                  const errorData = error.data || error.message || error
                  // See: https://github.com/ethers-io/ethers.js/issues/901
                  if (!(typeof errorData === 'string' && errorData.includes("unknown method eth_chainId"))) this.call('terminal', 'log', { value: error.data || error.message, type: 'error' } )
                  return reject(errorData)
                }
              }
              if (message && message.error) {
                const errorMsg = message.error?.message || message.error
                this.call('terminal', 'log', { value: errorMsg, type: 'error' } )
                return reject(errorMsg)
              }
              if (payload.method === 'eth_sendTransaction') {
                const txHash = response && response.result && response.result.jsonrpc ? response.result.result : response.result
                if (payload.params.length && !payload.params[0].to && txHash) {
                  this.emit('transactionBroadcasted', txHash)
                  setTimeout(async () => {
                    this.updateRemix(txHash)         
                  }, 1000)
                  this.call('blockchain', 'dumpState')
                }
              }
              resolve(message)
            }
            try {
              // browserProvider._send(payload: JsonRpcPayload | Array<JsonRpcPayload>) => Promise<Array<JsonRpcResult | JsonRpcError>>
              resultFn(null, await provider.send(payload))
            } catch (e) {
              resultFn(e.error ? e.error : e)
            }
          } else {
            reject(new Error('User denied permission'))
          }
        }).catch((e) => {
        reject(e)
      })
    })
  }

  async tryTillReceiptAvailable(txhash) {
    try {
      const receipt = await this.call('blockchain', 'getTransactionReceipt', txhash)
      if (receipt) return receipt
    } catch (e) {
      // do nothing
    }
    await this.pause()
    return await this.tryTillReceiptAvailable(txhash)
  }

  async pause() {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, 500)
    })
  }
}
