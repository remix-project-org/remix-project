import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class AssistantGenerate extends EventEmitter {
  command(this: NightwatchBrowser, prompt: string, provider: string): NightwatchBrowser {
    this.api.perform((done) => {
      generate(this.api, prompt, provider, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function generate(browser: NightwatchBrowser, prompt: string, provider: string, done: VoidFunction) {

  console.log('Generating with prompt:', prompt, 'and provider:', provider)
  browser
    .assistantWaitForReady()
    .assistantSetProvider(provider)
    .waitForElementPresent({
      locateStrategy: 'xpath',
      selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']",
    })

    .execute(function (prompt) {
      (window as any).remixAIChat.current.sendChat(`/generate ${prompt}`);
    }, [prompt])
    .waitForElementVisible({
      locateStrategy: 'xpath',
      selector: `//*[contains(@class,"chat-bubble") and contains(.,"/generate ${prompt}")]`
    })

  done()
}

module.exports = AssistantGenerate;
