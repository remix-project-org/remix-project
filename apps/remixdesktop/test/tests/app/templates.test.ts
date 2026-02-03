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
}

module.exports = {
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
      .click('*[data-id="template-card-remixDefault-0"]')
      .waitForElementVisible('*[data-id="workspace-details-section"]')
      .waitForElementVisible('*[data-id="validateWorkspaceButton"]')
      .click('*[data-id="validateWorkspaceButton"]')
      .pause(3000)
      .windowHandles(function (result) {
        console.log(result.value)
        browser.hideToolTips().switchWindow(result.value[1])
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
  'open template explorer and add template to current': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton"]')
      .click('*[data-id="fileExplorerCreateButton"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .click('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .scrollInto('*[data-id="template-category-Solidity CREATE2"]')
      .waitForElementVisible('*[data-id="template-card-contractCreate2Factory-0"]')
      .click('*[data-id="template-card-contractCreate2Factory-0"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/libs"]')
      .openFile('contracts/libs')
      .openFile('contracts/libs/create2-factory.sol')
      .pause(1500)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`contract Create2Factory {`) !== -1,
          'Correct content')
      })
  }
}
