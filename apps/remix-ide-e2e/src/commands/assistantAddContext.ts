import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class AssistantAddCtx extends EventEmitter {
  command(this: NightwatchBrowser, prompt: string): NightwatchBrowser {
    this.api.perform((done) => {
      selectCtx(this.api, prompt, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function selectCtx(browser: NightwatchBrowser, ctx: string, done: VoidFunction) {
  browser
    .assistantWaitForReady()
    .waitForElementVisible('*[data-id="composer-ai-add-context"]')
    .click({
      locateStrategy: 'xpath',
      selector: '//*[@data-id="composer-ai-add-context"]'
    })
    .waitForElementVisible('*[data-id="currentFile-context-option"]')
    .perform(async ()=> {
      switch (ctx) {
      case 'currentFile':
        browser.click({
          locateStrategy: 'xpath',
          selector: '//*[@data-id="currentFile-context-option"]'
        });
        break;
      case 'workspace':
        browser.click({
          locateStrategy: 'xpath',
          selector: '//*[@data-id="workspace-context-option"]'
        });
        break;
      case 'openedFiles':
        browser.click({
          locateStrategy: 'xpath',
          selector: '//*[@data-id="allOpenedFiles-context-option"]'
        });
        break;
      default:
        break;
      }
    })
  done()
}

module.exports = AssistantAddCtx;
