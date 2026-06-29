import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class VerifyLoad extends EventEmitter {
  command(this: NightwatchBrowser) {
    browser
      .getBrowserLogs()
      .saveScreenshot('./reports/screenshots/verifyLoad.png').waitForElementPresent({
        selector: "//span[@data-id='typesloaded']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .waitForElementPresent({
        selector: "//span[@data-id='editorloaded']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .waitForElementPresent({
        selector: "//span[@data-id='workspaceloaded']",
        locateStrategy: 'xpath',
        timeout: 100000
      })
      .waitForElementPresent({
        selector: "//span[@data-id='apploaded']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
      .waitForElementPresent({
        selector: "//span[@data-id='compilerloaded']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .perform((done) => {
        done()
        this.emit('complete')
      })
  }
}

module.exports = VerifyLoad
