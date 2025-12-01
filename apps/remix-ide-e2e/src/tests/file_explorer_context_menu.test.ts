'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  // file copy file name tests
  'Should copy file name and paste in root with new file button and it will contain a new file #group1 ': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .rightClick('*[data-id="treeViewLitreeViewItemREADME.txt"]')
      .click('[data-id="contextMenuItemcopyFileName"]')

      .click('*[data-id="fileExplorerCreateButton"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton-newBlankFile"]')
      .click('[data-id="fileExplorerCreateButton-newBlankFile"]')
      .waitForElementVisible('*[data-id$="fileExplorerTreeItemInput"]')
      .pause(1000)
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.CONTROL + 'v')
      .pause(1000)
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME1.txt"]', 7000)
  },
  'Should copy file name and paste in another folder with new file button and it will contain a new file #group1 ': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.txt"]')
      .click('*[data-id="treeViewLitreeViewItemREADME.txt"]')
      .pause(1000)
      .rightClick('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .waitForElementPresent('[data-id="contextMenuItemcopyFileName"]')
      .click('[data-id="contextMenuItemcopyFileName"]')
      .click('[data-id="treeViewLitreeViewItemtests"]')
      .waitForElementVisible('[data-id="treeViewLitreeViewItemtests"]')
      .moveTo(null, 0, 0, () => {
        browser.click('*[data-id="fileExplorerHoverIcons-createNewFile"]')
      })
      .pause(1500)
      .waitForElementVisible('*[data-id$="fileExplorerTreeItemInput"]')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.CONTROL + 'v')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .pause()
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests/README.txt"]', 7000)
  },
  'Should copy file name and paste in another folder that has the same filename with new file button and it will contain a new file #group1 ': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .rightClick('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .waitForElementPresent('[data-id="contextMenuItemcopyFileName"]')
      .click('[data-id="contextMenuItemcopyFileName"]')
      .click('[data-id="treeViewLitreeViewItemcontracts"]')
      .rightClickCustom('[data-id="treeViewLitreeViewItemcontracts"]')
      .click('*[data-id="contextMenuItemnewFile"]')
      .pause(1000)
      .waitForElementVisible('*[data-id$="fileExplorerTreeItemInput"]')
      .pause(1000)
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.CONTROL + 'v')
      .pause(1000)
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/README.txt"]', 7000)
  },
  'Should copy file name and paste in root with right click and it will contain a new file #group1 ': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .rightClick('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .waitForElementPresent('[data-id="contextMenuItemcopyFileName"]')
      .click('[data-id="contextMenuItemcopyFileName"]')
      .rightClick('*[data-id="treeViewUltreeViewMenu"]')
      .click('*[data-id="contextMenuItemnewFile"]')
      .pause(1000)
      .waitForElementVisible('*[data-id$="fileExplorerTreeItemInput"]')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.CONTROL + 'v')
      .pause(1000)
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME2.txt"]', 7000)
  },
  'Should copy file name and paste in contracts with right click and it will contain a new file #group1 ': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .rightClick('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .waitForElementPresent('[data-id="contextMenuItemcopyFileName"]')
      .click('[data-id="contextMenuItemcopyFileName"]')
      .rightClick('*[data-id="treeViewLitreeViewItemcontracts"]')
      .click('*[data-id="contextMenuItemnewFile"]')
      .pause(1000)
      .waitForElementVisible('*[data-id$="fileExplorerTreeItemInput"]')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.CONTROL + 'v')
      .pause(1000)
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME2.txt"]', 7000)
  },
  // file copy paste tests
  'Should copy file and paste in root with right click and it will contain a new file #group1 ': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .rightClick('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .waitForElementPresent('[data-id="contextMenuItemcopy')
      .click('[data-id="contextMenuItemcopy"]')
      .rightClick('*[data-id="treeViewUltreeViewMenu"]')
      .saveScreenshot('./reports/screenshot/file_explorer_context_menu.png')
      .click('*[data-id="contextMenuItempaste"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME1.txt"]', 7000)
  },
  'Should copy file and paste in contracts with right click and it will contain a new file #group1 ': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .rightClick('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .waitForElementPresent('[data-id="contextMenuItemcopy')
      .click('[data-id="contextMenuItemcopy"]')
      .rightClick('*[data-id="treeViewLitreeViewItemcontracts"]')
      .click('*[data-id="contextMenuItempaste"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/README1.txt"]', 7000)
  },
  // folder copy paste tests
  'Should copy folder and paste in root with right click and it will contain a copied folder #group1 ': function (browser: NightwatchBrowser) {
    browser
      .rightClick('li[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementPresent('[data-id="contextMenuItemcopy')
      .click('[data-id="contextMenuItemcopy"]')
      .rightClick('*[data-id="treeViewUltreeViewMenu"]')
      .click('*[data-id="contextMenuItempaste"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemCopy_contracts"]', 7000)
  },
  'Should copy folder and paste in contracts with right click and it will contain a copied folder #group1 ': function (browser: NightwatchBrowser) {
    browser
      .pause(1000)
      .waitForElementVisible('li[data-id="treeViewLitreeViewItemscripts"]')
      .rightClick('li[data-id="treeViewLitreeViewItemscripts"]')
      .waitForElementPresent('[data-id="contextMenuItemcopy')
      .click('[data-id="contextMenuItemcopy"]')
      .rightClick('*[data-id="treeViewLitreeViewItemcontracts"]')
      .click('*[data-id="contextMenuItempaste"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/Copy_scripts"]', 7000)
  }
}
