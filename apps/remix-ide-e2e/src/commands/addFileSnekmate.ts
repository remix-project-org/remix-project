import EventEmitter from 'events'
import { NightwatchBrowser, NightwatchContractContent } from 'nightwatch'

class AddFileSnekmate extends EventEmitter {
  command(this: NightwatchBrowser, name: string, content: NightwatchContractContent): NightwatchBrowser {
    this.api.perform((done) => {
      addFileSnekmate(this.api, name, content, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function addFileSnekmate(browser: NightwatchBrowser, name: string, content: NightwatchContractContent, done: VoidFunction) {
  browser
    .isVisible({
      selector: "//*[@data-id='sidePanelSwapitTitle' and contains(.,'File explorer')]",
      locateStrategy: 'xpath',
      suppressNotFoundErrors: true,
      timeout: 1000
    }, (okVisible) => {
      if (!okVisible.value) {
        browser.clickLaunchIcon('filePanel')
      }
    })
    .scrollInto('li[data-id="treeViewLitreeViewItemREADME.txt"]')
    .waitForElementVisible('li[data-id="treeViewLitreeViewItemLICENSE"]')
    .click('li[data-id="treeViewLitreeViewItemLICENSE"]').pause(1000) // focus on root directory
    .isVisible({
      selector: `//*[@data-id="treeViewLitreeViewItem${name}"]`,
      locateStrategy: 'xpath',
      abortOnFailure: false,
      suppressNotFoundErrors: true,
      timeout: 2000
    }, (okVisible) => {
      // @ts-ignore
      // status === -1 means the element is not visible, 0 means it is visible.
      if (okVisible.status === 0) {
        browser.openFile(name)
          .perform(function () {
            done()
          })
      } else {
        browser
          .rightClickCustom('[data-id="treeViewUltreeViewMenu"]')
          .click('*[data-id="contextMenuItemnewFile"]')
          .waitForElementContainsText('*[data-id$="fileExplorerTreeItemInput"]', '', 60000)
          .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', name)
          .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
          // isvisible is protocol action called isDisplayed https://www.selenium.dev/selenium/docs/api/java/org/openqa/selenium/WebElement.html#isDisplayed--
          .isVisible({
            selector: `li[data-id="treeViewLitreeViewItem${name}"]`,
            abortOnFailure: false,
            suppressNotFoundErrors: true,
            timeout: 60000
          })
          .waitForElementVisible({
            selector: `//*[@data-id='tab-active' and contains(@data-path, "${name}")]`,
            locateStrategy: 'xpath'
          })
          .setEditorValue(content.content)
          .getEditorValue((result) => {
            if (result != content.content) {
              browser.setEditorValue(content.content)
            }
          })
          .perform(function () {
            done()
          })
      }
    })
}

module.exports = AddFileSnekmate
