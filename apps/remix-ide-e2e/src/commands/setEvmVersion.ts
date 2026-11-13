import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

// the compiler settings card must be open
class SetEvmVersion extends EventEmitter {
  command(this: NightwatchBrowser, version: string): NightwatchBrowser {
    this.api
      .waitForElementVisible('#evmVersionSelector')
      .click('#evmVersionSelector')
      .waitForElementVisible(`[data-id="evmVersionSelector-${version}"]`)
      .click(`[data-id="evmVersionSelector-${version}"]`)
      .waitForElementPresent(`#evmVersionSelector[data-value="${version}"]`)
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = SetEvmVersion
