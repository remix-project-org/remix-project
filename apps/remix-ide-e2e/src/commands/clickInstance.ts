import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ClickInstance extends EventEmitter {
  command (this: NightwatchBrowser, index: number): NightwatchBrowser {
    const selector = `[data-id="deployedContractItem-${index}"]`
    const expandedContentSelector = `[data-id="functionDropdown-${index}"]`

    this.api
      .closeBetaPopUp()
      .waitForElementPresent({
        locateStrategy: 'css selector',
        selector,
        timeout: 80000
      }).waitForElementContainsText(selector, '', 80000)
      .isVisible(expandedContentSelector, (result) => {
        // Only click to expand if the contract is currently collapsed
        if (!result.value) {
          this.api.scrollAndClick(selector)
        }
      })
      .perform(() => { this.emit('complete') })
    return this
  }
}

module.exports = ClickInstance
