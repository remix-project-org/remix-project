import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class SetCompilerLanguage extends EventEmitter {

  command(this: NightwatchBrowser, language: 'solidity' | 'yul'): NightwatchBrowser {
    this
      .clickLaunchIcon('solidity')
      .waitForElementVisible('*[data-id="compilerLanguageSelectorWrapper"]')
      .waitForElementVisible('*[id="compilerLanguageSelector"]')
      .click('*[id="compilerLanguageSelector"]')
      .pause()
    return this
  }
}
