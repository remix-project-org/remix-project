import { Plugin } from "@remixproject/engine"

export class ProviderWrapper {
  udapp: Plugin
  name: string

  constructor(udapp: Plugin, name: string) {
    this.udapp = udapp
    this.name = name
  }

  sendAsync (payload) {
    return this.udapp.call(this.name, 'sendAsync', payload)
  }

  send (payload) {
    return this.udapp.call(this.name, 'sendAsync', payload)
  }
  request (payload): Promise<any> {
    return new Promise((resolve, reject) => {
      this.udapp.call(this.name, 'sendAsync', payload).then((response) => {
        if (response.error) {
          reject(response.error)
        } else {
          // unwrap JSON-RPC envelopes even when the result is null (e.g. a tx the node doesn't know yet), as EIP-1193 expects
          const isEnvelope = response !== null && typeof response === 'object' && ('result' in response || 'jsonrpc' in response)
          resolve(isEnvelope ? response.result : response)
        }
      }).catch((err) => {
        reject(err.error ? err.error : err)
      })
    })
  }
}