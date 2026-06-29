import { NightwatchBrowser } from 'nightwatch'
import EventEmitter from 'events'

class addAtAddressInstance extends EventEmitter {
  command (this: NightwatchBrowser, address: string, isValidFormat: boolean, isValidChecksum: boolean, isAbi = true): NightwatchBrowser {
    this.api.perform((done: VoidFunction) => {
      addInstance(this.api, address, isValidFormat, isValidChecksum, isAbi, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function addInstance (browser: NightwatchBrowser, address: string, isValidFormat: boolean, isValidChecksum: boolean, isAbi: boolean, callback: VoidFunction) {
  browser
    .clickLaunchIcon('udapp')
    .waitForElementVisible('[data-id="addDeployedContract"]')
    .pause(500) // Wait for any UI transitions to complete
    .execute(function () {
    // Use JavaScript to click the button, avoiding sticky header issues
      const button = document.querySelector('[data-id="addDeployedContract"]') as HTMLElement
      if (button) {
        button.scrollIntoView({ behavior: 'auto', block: 'center' })
        button.click()
      }
    })
    .waitForElementVisible('[data-id="deployedContractAddressInput"]')
    .setValue('[data-id="deployedContractAddressInput"]', address, function () {
      if (!isValidFormat || !isValidChecksum) browser.assert.elementPresent('[data-id="addDeployedContractButton"]:disabled')
      else if (isAbi) {
        browser
          .click('[data-id="addDeployedContractButton"]') // Click Add button in dialog
          .waitForElementPresent('[data-id="deployedContractsAtAddress-modal-footer-ok-react"]', 5000)
          .execute(function () {
            const modal = document.querySelector('[data-id="deployedContractsAtAddress-modal-footer-ok-react"]') as any

            modal.click()
          })
      } else {
        browser.click('[data-id="addDeployedContractButton"]') // Click Add button in dialog
      }
      callback()
    })
}

module.exports = addAtAddressInstance
