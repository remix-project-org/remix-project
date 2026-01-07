'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', false)
  },

  'Should enable manual file saving in settings #group1 #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .pause()
      .waitForElementContainsText('[data-id="settings-sidebar-header"] h3', 'Settings')
      .waitForElementVisible('*[data-id="manual-file-savingSwitch"]')
      .click('*[data-id="manual-file-savingSwitch"]')
      .pause(500)
      .verify.elementPresent('[data-id="manual-file-savingSwitch"] .fa-toggle-on')
  },

  'Should display modal when closing modified file and choose discard #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.txt"]')
      .click('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .addFile('test_discard.txt', { content: '' })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest_discard.txt"]')
      .pause(500)
      .setEditorValue('This content will be discarded')
      .pause(500)
      // Verify the file is marked as modified (should show round icon)
      .waitForElementVisible('*[data-id="close_default_workspace/test_discard.txt"] .fa-circle')
      // Try to close the tab
      .click('*[data-id="close_default_workspace/test_discard.txt"]')
      .pause(500)
      // Verify modal appears
      .waitForElementVisible('*[data-id="SaveFileModalDialogModalBody-react"]', 5000)
      .assert.containsText('*[data-id="SaveFileModalDialogModalBody-react"]', 'Do you want to save changes')
      .assert.containsText('*[data-id="SaveFileModalDialogModalBody-react"]', 'test_discard.txt')
      // Click "Don't Save" button
      .waitForElementVisible('*[data-id="SaveFile-modal-footer-cancel-react"]')
      .click('*[data-id="SaveFile-modal-footer-cancel-react"]')
      .pause(500)
      // Verify the tab is closed
      .waitForElementNotPresent('*[data-id="close_default_workspace/test_discard.txt"]')
      // Verify file still exists but content was not saved
      .openFile('test_discard.txt')
      .pause(500)
      .getEditorValue((content) => {
        browser.assert.equal(content, '')
      })
  },

  'Should display modal when closing modified file and choose save #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#editorView')
      .setEditorValue('This content will be saved')
      .pause(500)
      // Verify the file is marked as modified
      .waitForElementVisible('*[data-id="close_default_workspace/test_discard.txt"] .fa-circle')
      // Try to close the tab
      .click('*[data-id="close_default_workspace/test_discard.txt"]')
      .pause(500)
      // Verify modal appears
      .waitForElementVisible('*[data-id="SaveFileModalDialogModalBody-react"]', 5000)
      .assert.containsText('*[data-id="SaveFileModalDialogModalBody-react"]', 'Do you want to save changes')
      // Click "Save" button
      .waitForElementVisible('*[data-id="SaveFile-modal-footer-ok-react"]')
      .click('*[data-id="SaveFile-modal-footer-ok-react"]')
      .pause(500)
      // Verify the tab is closed
      .waitForElementNotPresent('*[data-id="close_default_workspace/test_discard.txt"]')
      // Reopen and verify content was saved
      .openFile('test_discard.txt')
      .pause(500)
      .getEditorValue((content) => {
        browser.assert.equal(content, 'This content will be saved')
      })
  },

  'Should handle multiple modified files correctly #group2': function (browser: NightwatchBrowser) {
    browser
      // Create first test file
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.txt"]')
      .click('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .rightClickCustom('[data-id="treeViewUltreeViewMenu"]')
      .click('*[data-id="contextMenuItemnewFile"]')
      .pause(1000)
      .waitForElementVisible('*[data-id$="fileExplorerTreeItemInput"]')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', 'test_file1.txt')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .pause(1000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest_file1.txt"]')
      .pause(500)
      .setEditorValue('Content for file 1')
      .pause(500)
      // Create second test file
      .click('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .rightClickCustom('[data-id="treeViewUltreeViewMenu"]')
      .click('*[data-id="contextMenuItemnewFile"]')
      .pause(1000)
      .waitForElementVisible('*[data-id$="fileExplorerTreeItemInput"]')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', 'test_file2.txt')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .pause(1000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest_file2.txt"]')
      .pause(500)
      .setEditorValue('Content for file 2')
      .pause(500)
      // Verify both files are marked as modified
      // .pause()
      .waitForElementVisible('*[data-id="close_default_workspace/test_file2.txt"] .fa-circle')
      // Close first file and save
      .moveToElement('*[data-id="close_default_workspace/test_file1.txt"]', 5, 5)
      .click('*[data-id="close_default_workspace/test_file1.txt"]')
      .pause(500)
      .waitForElementVisible('*[data-id="SaveFileModalDialogModalBody-react"]', 5000)
      .click('*[data-id="SaveFile-modal-footer-ok-react"]')
      .pause(500)
      .waitForElementNotPresent('*[data-id="close_default_workspace/test_file1.txt"]')
      // Close second file and discard
      .waitForElementVisible('*[data-id="close_default_workspace/test_file2.txt"] .fa-circle')
      .moveToElement('*[data-id="close_default_workspace/test_file2.txt"]', 5, 5)      
      .click('*[data-id="close_default_workspace/test_file2.txt"]')
      .pause(500)
      .waitForElementVisible('*[data-id="SaveFileModalDialogModalBody-react"]', 5000)
      .click('*[data-id="SaveFile-modal-footer-cancel-react"]')
      .pause(500)
      .waitForElementNotPresent('*[data-id="close_default_workspace/test_file2.txt"]')
      // Verify file1 was saved
      .openFile('test_file1.txt')
      .pause(500)
      .getEditorValue((content) => {
        browser.assert.equal(content, 'Content for file 1')
      })
      // Verify file2 was not saved
      .openFile('test_file2.txt')
      .pause(500)
      .getEditorValue((content) => {
        browser.assert.equal(content, '')
      })
  },

  'Should disable manual file saving and auto-save changes #group2': function (browser: NightwatchBrowser) {
    browser
      // Open settings and disable manual file saving
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .waitForElementContainsText('[data-id="settings-sidebar-header"] h3', 'Settings')
      .waitForElementVisible('*[data-id="manual-file-savingSwitch"]')
      .click('*[data-id="manual-file-savingSwitch"]')
      .pause(500)
      .verify.elementPresent('[data-id="manual-file-savingSwitch"] .fa-toggle-off')
      // Create a new test file
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.txt"]')
      .click('li[data-id="treeViewLitreeViewItemREADME.txt"]')
      .rightClickCustom('[data-id="treeViewUltreeViewMenu"]')
      .click('*[data-id="contextMenuItemnewFile"]')
      .pause(1000)
      .waitForElementVisible('*[data-id$="fileExplorerTreeItemInput"]')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', 'test_autosave.txt')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .pause(1000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest_autosave.txt"]')
      .pause(500)
      .setEditorValue('This content should auto-save')
      .pause(2000) // Wait for auto-save
      // Close the tab - should NOT show modal
      .click('*[data-id="close_default_workspace/test_autosave.txt"]')
      .pause(500)
      .waitForElementNotPresent('*[data-id="close_default_workspace/test_autosave.txt"]')
      // Reopen and verify content was auto-saved
      .openFile('test_autosave.txt')
      .pause(500)
      .getEditorValue((content) => {
        browser.assert.equal(content, 'This content should auto-save')
      })
  }
}
