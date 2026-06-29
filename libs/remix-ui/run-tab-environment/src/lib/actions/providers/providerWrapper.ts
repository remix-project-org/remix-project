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
          resolve((response !== null && response.result !== null && response.result !== undefined) ? response.result : response)
        }
      }).catch((err) => {
        reject(err.error ? err.error : err)
      })
    })
  }
}