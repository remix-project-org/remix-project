import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class clearTransactions extends EventEmitter {
  command (this: NightwatchBrowser): NightwatchBrowser {
    const browser = this
    this.api.clickLaunchIcon('udapp').element('css selector', '[data-id="clearAllDeployedContracts"]', function (visible: any) {
      if (visible.status && visible.status === -1) {
        browser.api.perform((done) => {
          done()
          browser.emit('complete')
        })
      } else {
        browser.api
          .pause(500)
          .execute(function () {
            const clearBtn = document.querySelector('[data-id="clearAllDeployedContracts"]') as HTMLElement
            if (clearBtn) {
              clearBtn.scrollIntoView({ behavior: 'auto', block: 'center' })
              clearBtn.click()
            }
          })
          .waitForElementVisible('[data-id="confirmClearAll"]')
          .execute(function () {
            const confirmBtn = document.querySelector('[data-id="confirmClearAll"]') as HTMLElement
            if (confirmBtn) {
              confirmBtn.scrollIntoView({ behavior: 'auto', block: 'center' })
              confirmBtn.click()
            }
          })
          .pause(500)
          .perform((done) => {
            done()
            browser.emit('complete')
          })
      }
    })
    return this
  }
}

module.exports = clearTransactions
