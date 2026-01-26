import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ChatHistoryDeleteConversation extends EventEmitter {
  command(this: NightwatchBrowser, conversationId: string): NightwatchBrowser {
    this.api.perform((done) => {
      deleteConversation(this.api, conversationId, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function deleteConversation(browser: NightwatchBrowser, conversationId: string, done: VoidFunction) {
  browser
    .waitForElementVisible('*[data-id="chat-history-sidebar"]', 10000)
    .waitForElementVisible(`*[data-id="conversation-item-${conversationId}"]`, 10000)
    .waitForElementVisible(`*[data-id="conversation-menu-${conversationId}"]`, 5000)
    .click(`*[data-id="conversation-menu-${conversationId}"]`)
    .pause(300)
    .waitForElementVisible('.conversation-menu', 5000)
    .click('.conversation-menu .conversation-menu-item:last-child') // Delete is last item
    .pause(300)
    // Confirm deletion if modal appears
    .perform((done) => {
      browser.isVisible('[data-id="topbarModalStaticModalDialogModalFooter-react"] .modal-ok', (result) => {
        if (result.value) {
          browser
            .click('[data-id="topbarModalStaticModalDialogModalFooter-react"] .modal-ok')
            .pause(500)
        }
        done()
      })
    })

  done()
}

module.exports = ChatHistoryDeleteConversation
