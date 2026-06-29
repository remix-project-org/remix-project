import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ChatHistoryLoadConversation extends EventEmitter {
  command(this: NightwatchBrowser, conversationId: string): NightwatchBrowser {
    this.api.perform((done) => {
      loadConversation(this.api, conversationId, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function loadConversation(browser: NightwatchBrowser, conversationId: string, done: VoidFunction) {
  browser
    .waitForElementVisible('*[data-id="chat-history-sidebar"]', 10000)
    .waitForElementVisible(`*[data-id="conversation-item-${conversationId}"]`, 10000)
    .click(`*[data-id="conversation-item-${conversationId}"]`)
    .pause(1000) // Wait for messages to load

  done()
}

module.exports = ChatHistoryLoadConversation
