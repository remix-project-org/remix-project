import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class SetSolidityCompilerVersion extends EventEmitter {
  command(this: NightwatchBrowser, version: string): NightwatchBrowser {
    // the list is searched by long version: soljson-v0.8.20+commit.a1b79de6.js -> 0.8.20+commit.a1b79de6
    const longVersion = version.match(/^soljson-v(.+)\.js$/)?.[1]
    this.api
      .waitForElementVisible({
        selector: "//*[@id='versionSelector']",
        locateStrategy: 'xpath'
      })
      .click({
        selector: "//*[@id='versionSelector']",
        locateStrategy: 'xpath'
      })
      .perform((done: VoidFunction) => {
        // filter first so the item sits at the top of a short list, clear of the sticky search box
        if (!longVersion) return done()
        this.api
          .waitForElementVisible('*[data-id="versionSelectorSearch"]')
          .setValue('*[data-id="versionSelectorSearch"]', longVersion)
          .perform(() => done())
      })
      .waitForElementVisible(`[data-id="dropdown-item-${version}"]`)
      .click(`[data-id="dropdown-item-${version}"]`)
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded' and @data-version='${version}']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = SetSolidityCompilerVersion
