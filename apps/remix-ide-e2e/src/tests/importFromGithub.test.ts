'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const testData = {
  validURL: 'https://github.com/remix-project-org/git-hometab-test.git',
  invalidURL: 'https://github.com/Oppelin/Roles.sol',
  JSON: 'https://github.com/remix-project-org/git-hometab-test.git'
}

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  'Import from GitHub Modal #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="verticalIconsHomeIcon"]')
      .click('*[data-id="verticalIconsHomeIcon"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="github-dropdown-toggle"]')
      .click('*[data-id="github-dropdown-toggle"]')
      .waitForElementVisible('*[data-id="github-dropdown-item-clone"]')
      .click('*[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('*[data-id="topbarModalModalDialogModalTitle-react"]')
      .assert.containsText('*[data-id="topbarModalModalDialogModalTitle-react"]', 'Clone Git Repository')
      .waitForElementVisible('*[data-id="topbarModalModalDialogModalBody-react"]')
      .waitForElementVisible('input[data-id="modalDialogCustomPromptTextClone"]')
  },

  'Display Error Message For Invalid GitHub URL Modal #group1': function (browser: NightwatchBrowser) {
    browser
      .execute(() => {
        (document.querySelector('input[data-id="modalDialogCustomPromptTextClone"]') as any).focus()
      }, [], () => { })
      .setValue('input[data-id="modalDialogCustomPromptTextClone"]', testData.invalidURL)
      .waitForElementVisible('*[data-id="topbarModalModalDialogModalFooter-react"]')
      .click('[data-id="topbarModal-modal-footer-ok-react"]') // submitted
      //.waitForElementVisible('*[data-shared="tooltipPopup"]')
      //.waitForElementContainsText('*[data-shared="tooltipPopup"] span', 'not found ' + testData.invalidURL)
  },

  'Clone From GitHub with Valid URL #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="verticalIconsHomeIcon"]')
      .click('*[data-id="verticalIconsHomeIcon"]')
      .waitForElementVisible('*[data-id="github-dropdown-toggle"]')
      .click('*[data-id="github-dropdown-toggle"]')
      .waitForElementVisible('*[data-id="github-dropdown-item-clone"]')
      .click('*[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('input[data-id="modalDialogCustomPromptTextClone"]')
      .execute(() => {
        (document.querySelector('input[data-id="modalDialogCustomPromptTextClone"]') as any).focus()
      }, [], () => { })
      .clearValue('input[data-id="modalDialogCustomPromptTextClone"]').pause(1000)
      .setValue('input[data-id="modalDialogCustomPromptTextClone"]', testData.validURL)
      .waitForElementVisible('*[data-id="topbarModal-modal-footer-ok-react"]')
      .click('[data-id="topbarModal-modal-footer-ok-react"]')
      .openFile('Roles.sol')
      .waitForElementVisible({
        selector: `//*[@data-id='tab-active' and @data-path="git-hometab-test.git/Roles.sol"]`,
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('library Roles {') !== -1, 'content does contain "library Roles {"')
      })
  },
  'Confirm JSON After Cloning From GitHub For Valid URL #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="verticalIconsHomeIcon"]')
      .click('*[data-id="verticalIconsHomeIcon"]')
      .openFile('package.json')
      .waitForElementVisible("*[data-path='git-hometab-test.git/package.json'")
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('"name": "remix-project",') !== -1, 'content does contain "name": "remix-project"')
      })
      .end()
  }
}
