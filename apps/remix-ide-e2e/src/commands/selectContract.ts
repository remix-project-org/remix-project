import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class SelectContract extends EventEmitter {
  command(this: NightwatchBrowser, contractName: string): NightwatchBrowser {
    this.api
      .useCss()
      .waitForElementPresent('[data-id="contractDropdownToggle"]', 10000)
      .execute(function () {
        // Use JavaScript to click the dropdown, avoiding sticky header issues
        const dropdownBtn = document.querySelector(`[data-id="contractDropdownToggle"]`) as HTMLElement
        if (dropdownBtn) {
          dropdownBtn.scrollIntoView({ behavior: 'auto', block: 'center' })
        }
      })
      .click('[data-id="contractDropdownToggle"]')
      // Wait for dropdown menu to be visible
      .waitForElementVisible('[data-id="contractDropdownMenu"]', 10000)
      // Wait for the specific contract item and click it
      .waitForElementPresent(`[data-id="contractDropdownItem-${contractName}"]`, 10000)
      .click(`[data-id="contractDropdownItem-${contractName}"]`)
      .perform(() => this.emit('complete'))
    return this
  }
}

module.exports = SelectContract
