import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

// the contract wizard of the template explorer must be open. type: 'erc20' | 'erc721' | 'erc1155'
class SelectContractWizardType extends EventEmitter {
  command(this: NightwatchBrowser, type: string): NightwatchBrowser {
    this.api
      .waitForElementVisible('*[data-id="contract-wizard-contract-type-dropdown"]')
      .click('*[data-id="contract-wizard-contract-type-dropdown"]')
      .waitForElementVisible(`*[data-id="contract-wizard-contract-type-dropdown-item-${type}"]`)
      .click(`*[data-id="contract-wizard-contract-type-dropdown-item-${type}"]`)
      .waitForElementPresent(`*[data-id="contract-wizard-contract-type-dropdown"][data-value="${type.toUpperCase()}"]`)
      .perform(() => {
        this.emit('complete')
      })
    return this
  }
}

module.exports = SelectContractWizardType
