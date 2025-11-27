import { NightwatchBrowser } from 'nightwatch'

function openTemplatesExplorer(browser: NightwatchBrowser) {
  browser
    .click('*[data-id="workspacesSelect"]')
    .pause(2000)
    .click('*[data-id="workspacecreate"]')
    .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
    .waitForElementVisible('*[data-id="template-explorer-template-container"]')
    .click('*[data-id="template-explorer-template-container"]')
    .waitForElementPresent('*[data-id="template-card-remixDefault-0"]')
    .click('*[data-id="template-card-remixDefault-0"]')
    .waitForElementVisible('*[data-id="workspace-details-section"]')
}

const tests = {
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    browser.hideToolTips()
    done()
  },
  'open default template': function (browser: NightwatchBrowser) {
    browser
      .hideToolTips()
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)

    openTemplatesExplorer(browser)

    browser
      .pause(3000)
      .windowHandles(function (result) {
        console.log(result.value)
        browser.hideToolTips()
          .switchWindow(result.value[1])
          .hideToolTips()
          .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests"]')
          .click('*[data-id="treeViewLitreeViewItemtests"]')
          .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
          .click('*[data-id="treeViewLitreeViewItemcontracts"]')
          .waitForElementVisible('[data-id="treeViewLitreeViewItemcontracts/1_Storage.sol"]')
          .openFile('contracts/1_Storage.sol')
          .waitForElementVisible('*[id="editorView"]', 10000)
          .getEditorValue((content) => {
            browser.assert.ok(content.includes('function retrieve() public view returns (uint256){'))
          })
      })
  },
  'connect to Wallet': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('udapp')
      .waitForElementVisible('[data-id="settingsSelectEnvOptions"]')
      .click('[data-id="settingsSelectEnvOptions"] button')
      .waitForElementVisible(`[data-id="dropdown-item-desktopHost"]`)
      .click('[data-id="dropdown-item-desktopHost"]') // close the dropdown
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//*[@data-id="settingsNetworkEnv" and contains(.,"1337")]',
      })
      .clickLaunchIcon('solidity')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .pause(2000)
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-id="Deploy - transact (not payable)"]', 45000) // wait for the contract to compile
      .pause(2000)
      .click('*[data-id="Deploy - transact (not payable)"]')
      .waitForElementPresent('*[data-id="universalDappUiContractActionWrapper"]', 60000)
      .clickInstance(0)
      .clickFunction('store - transact (not payable)', { types: 'uint256 num', values: '10' })
      .clickFunction('retrieve - call')
      .waitForElementContainsText('[data-id="treeViewLi0"]', 'uint256: 10')
  },
}

module.exports = {
  ...tests,
}
