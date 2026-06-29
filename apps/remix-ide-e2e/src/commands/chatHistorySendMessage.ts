import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ChatHistorySendMessage extends EventEmitter {
  command(this: NightwatchBrowser, message: string): NightwatchBrowser {
    this.api.perform((done) => {
      sendMessage(this.api, message, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function sendMessage(browser: NightwatchBrowser, message: string, done: VoidFunction) {
  browser
    .waitForElementVisible('*[data-id="remix-ai-composer-input"]', 10000)
    .click('*[data-id="remix-ai-composer-input"]')
    .clearValue('*[data-id="remix-ai-composer-input"]')
    .setValue('*[data-id="remix-ai-composer-input"]', message)
    .waitForElementVisible('*[data-id="remix-ai-composer-send-btn"]', 5000)
    .click('*[data-id="remix-ai-composer-send-btn"]')
    .waitForElementPresent({
      selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
      locateStrategy: 'xpath',
      timeout: 60000
    })

  done()
}

module.exports = ChatHistorySendMessage
