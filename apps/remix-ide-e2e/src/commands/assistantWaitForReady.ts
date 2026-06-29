import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class AssistantWaitForReady extends EventEmitter {
  command(this: NightwatchBrowser, timeout = 120000): NightwatchBrowser {
    this.api.perform((done) => {
      waitForReady(this.api, timeout, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function waitForReady(browser: NightwatchBrowser, timeout: number, done: VoidFunction) {
  browser
    .waitForElementVisible('*[data-id="remix-ai-assistant"]', timeout)
    .waitForElementPresent({
      selector: "//*[@data-id='remix-ai-assistant-ready']",
      locateStrategy: 'xpath',
      timeout
    })
    .perform(() => done())
}

module.exports = AssistantWaitForReady
