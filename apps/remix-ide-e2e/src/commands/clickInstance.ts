import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class ClickInstance extends EventEmitter {
  command (this: NightwatchBrowser, index: number): NightwatchBrowser {
    const selector = `[data-id="deployedContractItem-${index}"]`
    const functionDropdownSelector = `[data-id="functionDropdown-${index}"]`
    const lowLevelBtnSelector = `[data-id="btnLowLevel-${index}"]`

    this.api
      .closeBetaPopUp()
      .waitForElementPresent({
        locateStrategy: 'css selector',
        selector,
        timeout: 80000
      }).waitForElementContainsText(selector, '', 80000)
      .perform((done: () => void) => {
        // Check if either function dropdown or low-level button is visible (contract expanded)
        this.api.isVisible({ selector: functionDropdownSelector, suppressNotFoundErrors: true, timeout: 500 }, (funcResult) => {
          if (funcResult.value) {
            // Function dropdown is visible, contract is already expanded
            done()
          } else {
            // Check if low-level button is visible
            this.api.isVisible({ selector: lowLevelBtnSelector, suppressNotFoundErrors: true, timeout: 500 }, (lowLevelResult) => {
              if (lowLevelResult.value) {
                // Low-level button is visible, contract is already expanded
                done()
              } else {
                // Neither visible, contract is collapsed - click to expand
                this.api.scrollAndClick(selector)
                  .pause(1000)
                  .waitForElementPresent(lowLevelBtnSelector, 10000)
                  .perform(() => done())
              }
            })
          }
        })
      })
      .perform(() => { this.emit('complete') })
    return this
  }
}

module.exports = ClickInstance
