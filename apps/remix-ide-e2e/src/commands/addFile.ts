import { NightwatchBrowser, NightwatchContractContent } from 'nightwatch'
import EventEmitter from 'events'

class AddFile extends EventEmitter {
  command(this: NightwatchBrowser, name: string, content: NightwatchContractContent, readMeFile?:string): NightwatchBrowser {
    if (!readMeFile)
      readMeFile = 'README.txt'
    this.api.perform((done) => {
      addFile(this.api, name, content, readMeFile, () => {
        done()
        this.emit('complete')
      })
    })
    return this
  }
}

function addFile(browser: NightwatchBrowser, name: string, content: NightwatchContractContent, readMeFile:string, done: VoidFunction) {
  const readmeSelector = `li[data-id="treeViewLitreeViewItem${readMeFile}"]`
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
    .execute(function () {
      const container = document.querySelector('[data-test-id="virtuoso-scroller"]');
      container.scrollTop = container.scrollHeight;
    })
    .scrollInto(readmeSelector)
    .waitForElementVisible(readmeSelector)
    .click(readmeSelector).pause(1000) // focus on root directory
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
        browser.rightClickCustom('[data-id="treeViewUltreeViewMenu"]')
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

module.exports = AddFile
