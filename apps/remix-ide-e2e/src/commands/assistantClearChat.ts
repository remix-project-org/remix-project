import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class AssistantClearChat extends EventEmitter {
  command(this: NightwatchBrowser): NightwatchBrowser {
    this.api.perform((done) => {
      clearChat(this.api, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function clearChat(browser: NightwatchBrowser, done: VoidFunction) {
  browser
    .assistantWaitForReady()
    .execute(function () {
      (window as any).remixAIChat.current.clearChat()
    }, [])

  done()
}

module.exports = AssistantClearChat
