import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ChatHistoryCreateConversation extends EventEmitter {
  command(this: NightwatchBrowser): NightwatchBrowser {
    this.api.perform((done) => {
      createConversation(this.api, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function createConversation(browser: NightwatchBrowser, done: VoidFunction) {
  browser
    .clickLaunchIcon('remixaiassistant')
    .waitForElementVisible('*[data-id="chat-history-sidebar"]', 10000)
    .waitForElementVisible('*[data-id="new-conversation-btn"]', 5000)
    .click('*[data-id="new-conversation-btn"]')
    .pause(500)

  done()
}

module.exports = ChatHistoryCreateConversation
