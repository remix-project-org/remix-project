import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ClearDeployedContracts extends EventEmitter {
  command (this: NightwatchBrowser): NightwatchBrowser {
    this.api.perform((done: VoidFunction) => {
      clearContracts(this.api, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function clearContracts (browser: NightwatchBrowser, callback: VoidFunction) {
  browser
    .clickLaunchIcon('udapp')
    .waitForElementVisible('[data-id="deployedContractsContainer"]')
    .waitForElementVisible('[data-id="clearAllDeployedContracts"]')
    .pause(500)
    .execute(function () {
      // Use JavaScript to click the button, avoiding sticky header issues
      const clearBtn = document.querySelector('[data-id="clearAllDeployedContracts"]') as HTMLElement
      if (clearBtn) {
        clearBtn.scrollIntoView({ behavior: 'auto', block: 'center' })
        clearBtn.click()
      }
    })
    .waitForElementVisible('[data-id="confirmClearAll"]')
    .execute(function () {
      // Use JavaScript to click the confirm button
      const confirmBtn = document.querySelector('[data-id="confirmClearAll"]') as HTMLElement
      if (confirmBtn) {
        confirmBtn.scrollIntoView({ behavior: 'auto', block: 'center' })
        confirmBtn.click()
      }
    })
    .pause(500)
    .perform(() => {
      callback()
    })
}

module.exports = ClearDeployedContracts
