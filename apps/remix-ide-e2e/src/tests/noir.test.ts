'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    browser.globals.asyncHookTimeout = 30000000;
    init(browser, done)
  },

  'Should create noir workspace template #group1': '' + function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementPresent('*[data-id="template-card-multNr-0"]')
      .scrollAndClick('*[data-id="template-card-multNr-0"]')
      .click('*[data-id="validate-multNrworkspace-button"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemsrc"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemsrc/main.nr"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests/multiplier.test.ts"]')
  },
  'Should compile a simple circuit using editor play button #group1': '' + function (browser: NightwatchBrowser) {
    browser
      .openFile('src/main.nr')
      .click('[data-id="compile-action"]')
      .clickLaunchIcon('noir-compiler')
      .waitForElementPresent('[data-id="view-noir-compilation-result"]')
      .click('[data-id="view-noir-compilation-result"]')
      .getEditorValue((value) => {
        browser.assert.ok(value.indexOf('noir_version') !== -1, 'compilation result did not show')
      })
  },
  'Should run script for compute a witness and proof generation #group1': '' + function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .openFile('tests/multiplier.test.ts')
      .click('[data-id="compile-action"]')
      .waitForElementContainsText('*[data-id="terminalJournal"]', ' CHECK PROOF ', 60000)
  }
}
