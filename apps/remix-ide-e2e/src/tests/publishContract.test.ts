'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  '@sources': function () {
    return []
  },

  'Publish on IPFS': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#icon-panel', 10000)
      .clickLaunchIcon('filePanel')
      .click('[data-id="treeViewLitreeViewItemcontracts"]')
      .openFile('contracts/3_Ballot.sol')
      .verifyContracts(['Ballot'])
      .click('*[data-id="contractMoreMenu"]')
      .waitForElementVisible('#publishOnIpfs')
      .click('#publishOnIpfs')
      .pause(2000)
      .waitForElementVisible('[data-id="publishToStorageModalDialogModalBody-react"]', 60000)
      .click('[data-id="publishToStorage-modal-footer-ok-react"]')
      .pause(8000)
      .waitForElementVisible('[data-id="publishToStorageModalDialogModalBody-react"]', 60000)
      .getText('[data-id="publishToStorageModalDialogModalBody-react"]', (result) => {
        const value = <string>(result.value)

        browser.perform((done) => {
          if (value.indexOf('Metadata and sources of "ballot" were published successfully.') === -1) browser.assert.fail('ipfs deploy failed')
          done()
        })
      })
      .click('[data-id="publishToStorage-modal-footer-ok-react"]')
      .openFile('ipfs/QmSUodhSvoorFL5m5CNqve8YvmuBpjCq17NbTf4GUX8ydw')
      .openFile('ipfs/QmXYUS1ueS22EqNVRaKuZa31EgHLjKZ8uTM8vWhQLxa3pw')
  },

  
  'Publish on Swarm': '' + function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="contractMoreMenu"]')
      .waitForElementVisible('#publishOnSwarm')
      .click('#publishOnSwarm')
      .pause(8000)
      .getText('[data-id="publishToStorageModalDialogModalBody-react"]', (result) => {
        const value = <string>(result.value)

        browser.perform((done) => {
          if (value.indexOf('Metadata and sources of "ballot" were published successfully.') === -1) browser.assert.fail('swarm deploy failed')
          if (value.indexOf('bzz') === -1) browser.assert.fail('swarm deploy failed')
          done()
        })
      })
      .click('[data-id="publishToStorage-modal-footer-ok-react"]')
  },
  

  'Should publish contract metadata to ipfs on deploy': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#icon-panel')
      .clickLaunchIcon('filePanel')
      .openFile('contracts/1_Storage.sol')
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-id="contractDropdownIpfsCheckbox"]')
      .click('*[data-id="contractDropdownIpfsCheckbox"]')
      .waitForElementVisible('*[data-id="Deploy - transact (not payable)"]')
      .click('*[data-id="Deploy - transact (not payable)"]')
      .pause(5000)
      .waitForElementVisible('[data-id="udappModalDialogModalBody-react"]', 60000)
      .modalFooterOKClick('udapp')
      .pause(8000)
      .getText('[data-id="udappModalDialogModalBody-react"]', (result) => {
        const value = typeof result.value === 'string' ? result.value : null

        if (value.indexOf('Metadata and sources of "storage" were published successfully.') === -1) browser.assert.fail('ipfs deploy failed')
      })
      .modalFooterOKClick('udapp')
  },

  'Should remember choice after page refresh': function (browser: NightwatchBrowser) {
    browser
      .refreshPage()
      .waitForElementVisible('[data-id="treeViewLitreeViewItemcontracts"]')
      .click('[data-id="treeViewLitreeViewItemcontracts"]')
      .openFile('contracts/1_Storage.sol')
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-id="contractDropdownIpfsCheckbox"]')
      .verify.elementPresent('*[data-id="contractDropdownIpfsCheckbox"]:checked')
      .end()
  }
}
