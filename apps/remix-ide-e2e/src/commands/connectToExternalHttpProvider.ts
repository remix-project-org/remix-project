import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ConnectToExternalHttpProvider extends EventEmitter {
  command(this: NightwatchBrowser, url: string, identifier: string): NightwatchBrowser {
    this.api.element('xpath', `//*[@class='udapp_environment' and contains(.,'${identifier}')]`,
      (result) => {
        if (result.status as any === -1) {
          console.log("No connection to external provider found. Adding one.", url)
          this.api
            // Close any existing modal
            .click({
              locateStrategy: 'css selector',
              selector: '[data-id="basic-http-provider-modal-footer-ok-react"]',
              abortOnFailure: false,
              suppressNotFoundErrors: true,
              timeout: 5000
            })
            // Close any open sub-category dropdown first
            .click({
              locateStrategy: 'css selector',
              selector: 'body',
              abortOnFailure: false,
              suppressNotFoundErrors: true
            })
            .pause(500)
            // Now switch to the provider
            .switchEnvironment('basic-http-provider')
            .waitForElementPresent('[data-id="basic-http-provider-modal-footer-ok-react"]', 10000)
            .pause(500)
            .execute(() => {
              const input = document.querySelector('*[data-id="basic-http-providerModalDialogContainer-react"] input[data-id="modalDialogCustomPromp"]') as any
              if (input) input.focus()
            }, [], () => { })
            .clearValue('[data-id="modalDialogCustomPromp"]')
            .setValue('[data-id="modalDialogCustomPromp"]', url)
            .pause(500)
            .modalFooterOKClick('basic-http-provider')
            .pause(1000)
            .perform((done: VoidFunction) => {
              done()
              this.emit('complete')
            })
        } else {
          this.api.perform((done: VoidFunction) => {
            done()
            this.emit('complete')
          })
        }
      }
    )
    return this
  }
}

module.exports = ConnectToExternalHttpProvider
