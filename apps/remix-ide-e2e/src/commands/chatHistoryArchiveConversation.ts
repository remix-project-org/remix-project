import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ChatHistoryArchiveConversation extends EventEmitter {
  command(this: NightwatchBrowser, conversationId: string): NightwatchBrowser {
    this.api.perform((done) => {
      archiveConversation(this.api, conversationId, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function archiveConversation(browser: NightwatchBrowser, conversationId: string, done: VoidFunction) {
  browser
    .waitForElementVisible('*[data-id="chat-history-sidebar"]', 10000)
    .waitForElementVisible(`*[data-id="conversation-item-${conversationId}"]`, 10000)
    .waitForElementVisible(`*[data-id="conversation-menu-${conversationId}"]`, 5000)
    .click(`*[data-id="conversation-menu-${conversationId}"]`)
    .pause(300)
    .waitForElementVisible('.conversation-menu', 5000)
    .click('.conversation-menu .conversation-menu-item:first-child') // Archive is first item
    .pause(500)

  done()
}

module.exports = ChatHistoryArchiveConversation
