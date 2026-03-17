import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class debugTransaction extends EventEmitter {
  command(this: NightwatchBrowser, index = 0): NightwatchBrowser {
    this.api.perform((done) => {
      checkStyle(this.api, index, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function checkStyle(browser: NightwatchBrowser, index: number, callback: VoidFunction) {
  let elementsFound = 0
  browser.waitUntil(() => {
    browser.findElements({
      selector: '*[data-shared="txLoggerDebugButton"]',
      timeout: 60000,
    }, (result) => {
      if (Array.isArray(result.value) && result.value.length > 0) {
        elementsFound = result.value.length
      }
    })
    return elementsFound > index
  }, 60000)
  .execute(function (index: number) {
    const debugBtn = document.querySelectorAll('*[data-shared="txLoggerDebugButton"]')[index] as HTMLInputElement

    debugBtn && debugBtn.click()
  }, [index], function () {
    browser.waitForElementVisible('*[data-id="callTraceHeader"]', 60000).perform(() => callback())
  })

}

module.exports = debugTransaction
