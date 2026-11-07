import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

// the compiler settings card must be open
class SetCompilerLanguage extends EventEmitter {
  command(this: NightwatchBrowser, language: 'Solidity' | 'Yul'): NightwatchBrowser {
    this.api
      .waitForElementVisible('#compilerLanguageSelector')
      .click('#compilerLanguageSelector')
      .waitForElementVisible(`[data-id="compilerLanguageSelector-${language}"]`)
      .click(`[data-id="compilerLanguageSelector-${language}"]`)
      .waitForElementPresent(`#compilerLanguageSelector[data-value="${language}"]`)
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = SetCompilerLanguage
