import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class AssistantWorkspace extends EventEmitter {
  command(this: NightwatchBrowser, prompt: string, provider: string): NightwatchBrowser {
    this.api.perform((done) => {
      workspaceGenerate(this.api, prompt, provider, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function workspaceGenerate(browser: NightwatchBrowser, prompt: string, provider: string, done: VoidFunction) {
  browser
    .assistantWaitForReady()
    .assistantSetProvider(provider)
    .execute(function (prompt) {
      (window as any).remixAIChat.current.sendChat(`/workspace ${prompt}`);
    }, [prompt])
    .waitForElementVisible({
      locateStrategy: 'xpath',
      selector: `//*[contains(@class,"chat-bubble") and contains(.,"/workspace ${prompt}")]`
    })
  done()
}

module.exports = AssistantWorkspace;
