'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Should start coding #group1': '' + function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="homeTabGetStartedremixDefault"]')
      .click('*[data-id="homeTabGetStartedremixDefault"]')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemcontracts/1_Storage.sol"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/2_Owner.sol"')
      .waitForElementVisible('*[data-id="treeViewDivDraggableItemREADME.txt"')
      .click('*[data-id="treeViewDivtreeViewItemcontracts/1_Storage.sol"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'pragma')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((editorContent) => {
        browser.assert.ok(editorContent.indexOf(`pragma solidity`) !== -1, 'unexpected content encountered!')
      })
  },

  'Should start with ERC20 workspace #group1': '' + function (browser: NightwatchBrowser) {
    browser
      .click('*[data-path="home"')
      .waitForElementVisible('*[data-id="homeTabGetStartedozerc20"]')
      .click('*[data-id="homeTabGetStartedozerc20"')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/MyToken.sol"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemremappings.txt"]')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemtests/MyToken_test.sol"]')
      .click('*[data-id="treeViewDivtreeViewItemtests/MyToken_test.sol"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'pragma')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((editorContent) => {
        browser.assert.ok(editorContent.indexOf(`import "../contracts/MyToken.sol";`) !== -1, 'content encountered!')
      })
  },
  'Should create a new file in the current workspace': '' +function (browser: NightwatchBrowser) {
    browser
      .click('*[data-path="home"]')
      .waitForElementVisible('*[data-id="homeTabNewFile"]')
      .click('*[data-id="homeTabNewFile"]')
      .waitForElementVisible('*[data-id$="fileExplorerTreeItemInput"]')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', 'HometabNewFile.txt')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemHometabNewFile.txt"]', 7000)
  }
}
