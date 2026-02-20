import { Plugin } from '@remixproject/engine'
import { AppModal, AlertModal, ModalTypes } from '@remix-ui/app'
import type { Blockchain } from 'apps/remix-ide/src/blockchain/blockchain' // eslint-disable-line
import { JsonRpcProvider } from 'ethers'

export type JsonDataRequest = {
  id: number
  jsonrpc: string // version
  method: string
  params: Array<any>
}

export type JsonDataResult = {
  id: number
  jsonrpc: string // version
  result?: any
  error?: {
    code: number,
    message: string
    data?: string
  }
  errorData?: any
}

export type RejectRequest = (error: JsonDataResult) => void
export type SuccessRequest = (data: JsonDataResult) => void

export interface IProvider {
  options: { [id: string]: any }
  init(): Promise<{ [id: string]: any }>
  body(): JSX.Element
  sendAsync(data: JsonDataRequest): Promise<JsonDataResult>
}

export abstract class AbstractProvider extends Plugin implements IProvider {
  provider: JsonRpcProvider
  blockchain: Blockchain
  defaultUrl: string
  connected: boolean
  nodeUrl: string
  options: { [id: string]: any } = {}

  constructor(profile, blockchain, defaultUrl) {
    super(profile)
    this.defaultUrl = defaultUrl
    this.provider = null
    this.connected = false
    this.blockchain = blockchain
    this.nodeUrl = 'http://localhost:8545'
  }

  abstract body(): JSX.Element

  onDeactivation() {
    this.provider = null
  }

  async init() {
    this.nodeUrl = await ((): Promise<string> => {
      return new Promise((resolve, reject) => {
        const modalContent: AppModal = {
          id: this.profile.name,
          title: this.profile.displayName,
          message: this.body(),
          modalType: ModalTypes.prompt,
          okLabel: 'OK',
          cancelLabel: 'Cancel',
          validationFn: (value) => {
            if (!value) return { valid: false, message: 'value is empty' }
            if (value.startsWith('https://') || value.startsWith('http://')) {
              return {
                valid: true,
                message: ''
              }
            } else {
              return {
                valid: false,
                message: 'the provided value should contain the protocol ( e.g starts with http:// or https:// )'
              }
            }
          },
          okFn: (value: string) => {
            setTimeout(() => resolve(value), 0)
          },
          cancelFn: () => {
            setTimeout(() => reject(new Error('Canceled')), 0)
          },
          hideFn: () => {
            setTimeout(() => reject(new Error('Hide')), 0)
          },
          defaultValue: this.defaultUrl
        }
        this.call('notification', 'modal', modalContent)
      })
    })()
    this.provider = new JsonRpcProvider(this.nodeUrl)
    return {
      nodeUrl: this.nodeUrl
    }
  }

  sendAsync(data: JsonDataRequest): Promise<JsonDataResult> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      if (!this.provider) return reject({ jsonrpc: '2.0', id: data.id, error: { message: 'provider not set', code: -32603 } } as JsonDataResult)
      this.sendAsyncInternal(data, resolve, reject)
    })
  }

  private async switchAway(showError: boolean, msg: string) {
    if (!this.provider) return
    this.provider.destroy()
    if (showError) {
      this.call('terminal', 'log', { type: 'error', value: 'Error while querying the provider: ' + msg })
    }
    return
  }

  private async sendAsyncInternal(data: JsonDataRequest, resolve: SuccessRequest, reject: RejectRequest): Promise<void> {
    if (this.provider) {
      try {
        const result = await this.provider.send(data.method, data.params)
        resolve({ jsonrpc: '2.0', result, id: data.id })
      } catch (error) {
        if (error && error.message &&
            (error.message.includes('SERVER_ERROR') ||
            error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError'))) {
          try {
            // replace escaped quotes with normal quotes
            const errorString = String(error.message).replace(/\\"/g, '"');
            const messageMatches = Array.from(errorString.matchAll(/"message":"(.*?)"/g));
            // Extract the message values
            const messages = messageMatches.map(match => match[1]);
            if (messages && messages.length > 0) {
              this.switchAway(true, messages[0])
            } else {
              this.switchAway(true, error.message ? `${error.message} ${data.method} ${data.params}` : error.error ? error.error : error)
            }
          } catch (error) {
            this.switchAway(true, error.message ? `${error.message} ${data.method} ${data.params}` : error.error ? error.error : error)
          }
        }
        reject({ jsonrpc: '2.0', error: { message: error.message, code: -32603 }, id: data.id })
      }
    } else {
      const result = data.method === 'net_listening' ? 'canceled' : []
      resolve({ jsonrpc: '2.0', result: result, id: data.id })
    }
  }
}
