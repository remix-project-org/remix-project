import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ChatHistorySearchConversations extends EventEmitter {
  command(this: NightwatchBrowser, query: string): NightwatchBrowser {
    this.api.perform((done) => {
      searchConversations(this.api, query, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function searchConversations(browser: NightwatchBrowser, query: string, done: VoidFunction) {
  browser
    .waitForElementVisible('*[data-id="chat-history-sidebar"]', 10000)
    .waitForElementVisible('*[data-id="search-conversations-input"]', 5000)
    .click('*[data-id="search-conversations-input"]')
    .clearValue('*[data-id="search-conversations-input"]')
    .setValue('*[data-id="search-conversations-input"]', query)
    .pause(500) // Wait for search to filter

  done()
}

module.exports = ChatHistorySearchConversations
