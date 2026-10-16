'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const tabSelector = (fileName: string) => `.remix-ui-tabs div.tab[data-path$="${fileName}"]`
const activeTabSelector = (fileName: string) => `.remix-ui-tabs [data-id="tab-active"][data-path$="${fileName}"]`

// WebDriver's drag and drop doesn't fire HTML5 drag events, so dispatch them from the page
const dragTab = (browser: NightwatchBrowser, fromFile: string, toSelector: string, side: 'before' | 'after') => {
  return browser.execute(function (fromSelector: string, toSelector: string, side: string) {
    const source = document.querySelector(fromSelector) as HTMLElement
    const target = document.querySelector(toSelector) as HTMLElement
    const rect = target.getBoundingClientRect()
    const clientX = side === 'before' ? rect.left + 2 : rect.right - 2
    const clientY = rect.top + rect.height / 2
    const dataTransfer = new DataTransfer()
    const fire = (el: HTMLElement, type: string) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX, clientY, dataTransfer }))
    fire(source, 'dragstart')
    fire(target, 'dragover')
    fire(target, 'drop')
    fire(source, 'dragend')
  }, [tabSelector(fromFile), toSelector, side])
}

const expectSolTabsOrder = (browser: NightwatchBrowser, expected: string[]) => {
  return browser.execute(function () {
    return Array.from(document.querySelectorAll('.remix-ui-tabs div.tab'))
      .map((el) => (el as HTMLElement).getAttribute('data-path'))
      .filter((path) => path && path.endsWith('.sol'))
      .map((path) => path.split('/').pop())
  }, [], (result) => {
    browser.assert.deepStrictEqual(result.value, expected)
  })
}

module.exports = {
  '@disabled': true,
  'before': function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', true)
  },

  'Should open three files in tabs #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('div[data-id="mainPanelPluginsContainer"]')
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('div[data-id="filePanelFileExplorerTree"]')
      .openFile('contracts')
      .openFile('contracts/1_Storage.sol')
      .openFile('contracts/2_Owner.sol')
      .openFile('contracts/3_Ballot.sol')
      .waitForElementVisible(tabSelector('3_Ballot.sol'))
    expectSolTabsOrder(browser, ['1_Storage.sol', '2_Owner.sol', '3_Ballot.sol'])
  },

  'Should move a tab before another one by dragging it #group1': function (browser: NightwatchBrowser) {
    dragTab(browser, '3_Ballot.sol', tabSelector('1_Storage.sol'), 'before')
    expectSolTabsOrder(browser, ['3_Ballot.sol', '1_Storage.sol', '2_Owner.sol'])
    // the active tab is still the one being edited
    browser.waitForElementVisible(activeTabSelector('3_Ballot.sol'), 5000)
  },

  'Should move a tab after another one by dragging it #group1': function (browser: NightwatchBrowser) {
    dragTab(browser, '1_Storage.sol', tabSelector('2_Owner.sol'), 'after')
    expectSolTabsOrder(browser, ['3_Ballot.sol', '2_Owner.sol', '1_Storage.sol'])
    browser.waitForElementVisible(activeTabSelector('3_Ballot.sol'), 5000)
  },

  'Should move a tab to the end by dropping it after the last tab #group1': function (browser: NightwatchBrowser) {
    dragTab(browser, '3_Ballot.sol', '#dummyElForLastXVisibility', 'after')
    expectSolTabsOrder(browser, ['2_Owner.sol', '1_Storage.sol', '3_Ballot.sol'])
    browser.waitForElementVisible(activeTabSelector('3_Ballot.sol'), 5000)
  },

  'Should create a new file from the + button after the tabs #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="tabsNewFile"]')
      .click('*[data-id="tabsNewFile"]')
      .waitForElementVisible('*[data-id$="fileExplorerTreeItemInput"]')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', 'TabsNewFile.sol')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemTabsNewFile.sol"]', 7000)
      .waitForElementVisible(activeTabSelector('TabsNewFile.sol'), 5000)
    expectSolTabsOrder(browser, ['2_Owner.sol', '1_Storage.sol', '3_Ballot.sol', 'TabsNewFile.sol'])
  },

  'Should close the active tab and activate its left neighbour after reordering #group1': function (browser: NightwatchBrowser) {
    browser
      .click(tabSelector('1_Storage.sol'))
      .waitForElementVisible(activeTabSelector('1_Storage.sol'), 5000)
      .click(`${tabSelector('1_Storage.sol')} .close-tabs`)
      .waitForElementNotPresent(tabSelector('1_Storage.sol'))
      .waitForElementVisible(activeTabSelector('2_Owner.sol'), 5000)
      .end()
  }
}
