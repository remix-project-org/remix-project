import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  "@disabled": true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Should select multiple items in file explorer #group1': function (browser: NightwatchBrowser) {
    const selectedElements = []
    browser
      .expandAllFolders()
      .click({ selector: '//*[@data-id="treeViewDivtreeViewItemcontracts/1_Storage.sol"]', locateStrategy: 'xpath' })
      .pause(500)
      .findElement({ selector: '//*[@data-id="treeViewDivtreeViewItemcontracts/2_Owner.sol"]', locateStrategy: 'xpath' }, (el) => {
        selectedElements.push(el)
      })
    browser.findElement({ selector: '//*[@data-id="treeViewDivtreeViewItemtests"]', locateStrategy: 'xpath' },
      (el: any) => {
        selectedElements.push(el)
      })
    browser.selectFiles(selectedElements)
      .assert.visible('.bg-secondary[data-id="treeViewLitreeViewItemcontracts/1_Storage.sol"]')
      .assert.visible('.bg-secondary[data-id="treeViewLitreeViewItemcontracts/2_Owner.sol"]')
      .assert.visible('.bg-secondary[data-id="treeViewLitreeViewItemtests"]')
  },
  'Should drag and drop multiple files in file explorer to tests folder #group1': function (browser: NightwatchBrowser) {
    const selectedElements = []
    if (browser.options.desiredCapabilities?.browserName === 'firefox') {
      console.log('Skipping test for firefox')
      browser.end()
      return;
    } else {
      browser
        .click({ selector: '//*[@data-id="treeViewUltreeViewMenu"]', locateStrategy: 'xpath' })
        .click({ selector: '//*[@data-id="treeViewLitreeViewItemcontracts/1_Storage.sol"]', locateStrategy: 'xpath' })
        .findElement({ selector: '//*[@data-id="treeViewLitreeViewItemcontracts/2_Owner.sol"]', locateStrategy: 'xpath' }, (el) => {
          selectedElements.push(el)
        })
      browser.selectFiles(selectedElements)
        .perform((done) => {
          browser.findElement({ selector: '//*[@data-id="treeViewLitreeViewItemtests"]', locateStrategy: 'xpath' },
            (el: any) => {
              const id = (el as any).value.getId()
              browser
                .waitForElementVisible({ selector: 'li[data-id="treeViewLitreeViewItemtests"]', abortOnFailure: false })
                .dragAndDrop('li[data-id="treeViewLitreeViewItemcontracts/1_Storage.sol"]', id)
                .waitForElementPresent({ selector: '[data-id="fileSystemModalDialogModalFooter-react"] .modal-ok', abortOnFailure: false })
                .execute(function () { (document.querySelector('[data-id="fileSystemModalDialogModalFooter-react"] .modal-ok') as HTMLElement).click() })
                .openFile('tests/1_Storage.sol')
                .openFile('tests/2_Owner.sol')
                .waitForElementVisible({ selector: 'li[data-id="treeViewLitreeViewItemtests/1_Storage.sol"]', abortOnFailure: false })
                .waitForElementVisible({ selector: 'li[data-id="treeViewLitreeViewItemtests/2_Owner.sol"]', abortOnFailure: false })
                .waitForElementNotPresent({ selector: 'li[data-id="treeViewLitreeViewItemcontracts/1_Storage.sol"]', abortOnFailure: false })
                .waitForElementNotPresent({ selector: 'li[data-id="treeViewLitreeViewItemcontracts/2_Owner.sol"]', abortOnFailure: false })
                .perform(() => done())
            })
        })
    }
  },

  'should drag and drop multiple files and folders in file explorer to contracts folder #group3': function (browser: NightwatchBrowser) {
    const selectedElements = []
    if (browser.options.desiredCapabilities?.browserName === 'firefox') {
      console.log('Skipping test for firefox')
      browser.end()
      return;
    } else {
      browser
        .clickLaunchIcon('filePanel')
        .click({ selector: '//*[@data-id="treeViewLitreeViewItemtests"]', locateStrategy: 'xpath' })
        .findElement({ selector: '//*[@data-id="treeViewDivtreeViewItemscripts"]', locateStrategy: 'xpath' }, (el) => {
          selectedElements.push(el)
        })
      browser.findElement({ selector: '//*[@data-id="treeViewDivtreeViewItemREADME.txt"]', locateStrategy: 'xpath' },
        (el: any) => {
          selectedElements.push(el)
        })
      browser.selectFiles(selectedElements)
        .perform((done) => {
          browser.findElement({ selector: '//*[@data-id="treeViewLitreeViewItemcontracts"]', locateStrategy: 'xpath' },
            (el: any) => {
              const id = (el as any).value.getId()
              browser
                .waitForElementVisible({ selector: 'li[data-id="treeViewLitreeViewItemcontracts"]', abortOnFailure: false })
                .dragAndDrop('li[data-id="treeViewLitreeViewItemtests"]', id)
                .waitForElementPresent({ selector: '[data-id="fileSystemModalDialogModalFooter-react"] .modal-ok', abortOnFailure: false })
                .execute(function () { (document.querySelector('[data-id="fileSystemModalDialogModalFooter-react"] .modal-ok') as HTMLElement).click() })
                .openFile('contracts/tests')
                .waitForElementVisible({ selector: 'li[data-id="treeViewLitreeViewItemcontracts/tests"]', abortOnFailure: false })
                .waitForElementVisible({ selector: 'li[data-id="treeViewLitreeViewItemcontracts/README.txt"]', abortOnFailure: false })
                .waitForElementVisible({ selector: 'li[data-id="treeViewLitreeViewItemcontracts/scripts"]', abortOnFailure: false })
                .waitForElementNotPresent({ selector: 'li[data-id="treeViewLitreeViewItemtests"]', abortOnFailure: false })
                .waitForElementNotPresent({ selector: 'li[data-id="treeViewLitreeViewItemREADME.txt"]', abortOnFailure: false })
                .perform(() => done())
            })
        })
    }
  }
}
