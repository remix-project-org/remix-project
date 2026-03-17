import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ClearTransactionsRecorder extends EventEmitter {
  command (this: NightwatchBrowser): NightwatchBrowser {
    this.api.perform((done: VoidFunction) => {
      clearTransactions(this.api, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function clearTransactions (browser: NightwatchBrowser, callback: VoidFunction) {
  browser
    .execute(function () {
      // Use JavaScript to click the button, avoiding sticky header issues
      const clearBtn = document.querySelector('[data-id="clearAllTransactions"]') as HTMLElement
      if (clearBtn) {
        clearBtn.scrollIntoView({ behavior: 'auto', block: 'center' })
        clearBtn.click()
      }
    })
    .waitForElementVisible('[data-id="confirmClearAllTransactions"]')
    .execute(function () {
      // Use JavaScript to click the confirm button
      const confirmBtn = document.querySelector('[data-id="confirmClearAllTransactions"]') as HTMLElement
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

module.exports = ClearTransactionsRecorder
