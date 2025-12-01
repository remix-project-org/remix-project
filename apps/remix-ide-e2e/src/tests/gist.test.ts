'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const testData = {
  validGistId: '02a847917a6a7ecaf4a7e0d4e68715bf',
  invalidGistId: '6368b389f9302v32902msk2402'
}
// 99266d6da54cc12f37f11586e8171546c7700d67

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  'UploadToGists #group1': function (browser: NightwatchBrowser) {
    /*
       - set the access token
       - publish to gist
       - retrieve the gist
       - switch to a file in the new gist
      */
    console.log('token', process.env.gist_token)
    const gistid = '17ac9315bc065a3d95cf8dc1b28d71f8'
    browser
      .refreshPage()
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .click('li[data-id="treeViewLitreeViewItemREADME.txt"]') // focus on root directory
      .rightClickCustom('[data-id="treeViewUltreeViewMenu"]')
      .click('*[data-id="contextMenuItemnewFolder"]')
      .pause(1000)
      .waitForElementVisible('*[data-id$="fileExplorerTreeItemInput"]')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', 'Browser_Tests')
      .sendKeys('*[data-id$="fileExplorerTreeItemInput"]', browser.Keys.ENTER)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemBrowser_Tests"]')
      .addFile('File.sol', { content: '' })
      .executeScriptInTerminal(`remix.loadgist('${gistid}')`)
      // .perform((done) => { if (runtimeBrowser === 'chrome') { browser.openFile('gists') } done() })
      .waitForElementVisible(`[data-id="treeViewLitreeViewItemREADME.txt"]`)

    //.openFile(`README.txt`)
    // Remix publish to gist
    /* .click('*[data-id="fileExplorerNewFilepublishToGist"]')
         .pause(2000)
         .waitForElementVisible('*[data-id="default_workspaceModalDialogContainer-react"]')
         .click('*[data-id="default_workspaceModalDialogContainer-react"] .modal-ok')
         .pause(10000)
         .getText('[data-id="default_workspaceModalDialogModalBody-react"]', (result) => {
        console.log(result)
        const value = typeof result.value === 'string' ? result.value : null
        const reg = /gist.github.com\/([^.]+)/
        const id = value.match(reg)

        console.log('gist regex', id)
        if (!id) {
          browser.assert.fail('cannot get the gist id', '', '')
        } else {
          const gistid = id[1]
          browser
            .click('[data-id="default_workspace-modal-footer-cancel-react"]')
            .executeScriptInTerminal(`remix.loadgist('${gistid}')`)
            // .perform((done) => { if (runtimeBrowser === 'chrome') { browser.openFile('gists') } done() })
            .waitForElementVisible(`[data-id="treeViewLitreeViewItemgist-${gistid}"]`)
            .click(`[data-id="treeViewLitreeViewItemgist-${gistid}"]`)
            .openFile(`gist-${gistid}/README.txt`)
        }
      })
      */
  },

  'Load Gist Modal #group1': '' + function (browser: NightwatchBrowser) {
    browser.clickLaunchIcon('home')
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="verticalIconsHomeIcon"]')
      .click('*[data-id="verticalIconsHomeIcon"]')
      .waitForElementVisible('button[data-id="landingPageImportFromGistButton"]')
      .pause(1000)
      .scrollAndClick('button[data-id="landingPageImportFromGistButton"]')
      .waitForElementVisible('*[data-id="gisthandlerModalDialogModalTitle-react"]')
      .assert.containsText('*[data-id="gisthandlerModalDialogModalTitle-react"]', 'Load a Gist')
      .waitForElementVisible('*[data-id="gisthandlerModalDialogModalBody-react"]')
      .assert.containsText('*[data-id="gisthandlerModalDialogModalBody-react"]', 'Enter the ID of the Gist or URL you would like to load.')
      .waitForElementVisible('*[data-id="modalDialogCustomPromp"]')
      .modalFooterCancelClick('gisthandler')
  },

  'Display Error Message For Invalid Gist ID #group1': '' + function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('filePanel')
      .scrollAndClick('*[data-id="landingPageImportFromGistButton"]')
      .waitForElementVisible('*[data-id="gisthandlerModalDialogModalBody-react"] input[data-id="modalDialogCustomPromp"]')
      .execute(() => {
        (document.querySelector('*[data-id="gisthandlerModalDialogModalBody-react"] input[data-id="modalDialogCustomPromp"]') as any).focus()
      }, [], () => {})
      .setValue('*[data-id="gisthandlerModalDialogModalBody-react"] input[data-id="modalDialogCustomPromp"]', testData.invalidGistId)
      .modalFooterOKClick('gisthandler')
      .waitForElementVisible('*[data-id="gisthandlerModalDialogModalBody-react"]')
      .assert.containsText('*[data-id="gisthandlerModalDialogModalBody-react"]', 'Not Found')
      .modalFooterOKClick('gisthandler')
  },

  'Display Error Message For Missing Gist Token When Publishing #group1': function (browser: NightwatchBrowser) {
    browser
      .pause(1000)
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .waitForElementVisible('*[data-id="settings-sidebar-services"]')
      .click('*[data-id="settings-sidebar-services"]')
      .click('*[data-id="github-configSwitch"]')
      .waitForElementVisible('*[data-shared="tooltipPopup"]', 5000)
      .assert.containsText('*[data-shared="tooltipPopup"]', 'Credentials removed')
      .click('*[data-id="github-dropdown-toggle"]')
      .waitForElementNotPresent('*[data-id="github-dropdown-item-publish-to-gist"]')
      // .waitForElementVisible('[data-id="fileSystemModalDialogModalFooter-react"] .modal-ok')
      // .execute(function () { (document.querySelector('[data-id="fileSystemModalDialogModalFooter-react"] .modal-ok') as HTMLElement).click() })
      // .perform((done) => {
      //   browser.getText('[data-id="fileSystemModalDialogModalBody-react"]', (result) => {
      //     console.log('result.value: ', result.value)
      //     browser.assert.ok(result.value === 'Remix requires an access token (which includes gists creation permission). Please go to the settings tab to create one.', 'Assert failed. Gist token error message not displayed.')
      //     done()
      //   })
      // })
      // .waitForElementPresent('[data-id="fileSystemModalDialogModalFooter-react"] .modal-ok')
      // .click('[data-id="fileSystemModalDialogModalFooter-react"] .modal-ok')
  },

  'Import From Gist For Valid Gist ID #group2': '' + function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 15000)
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="settingsTabGenerateContractMetadataLabel"]')
      .setValue('[data-id="settingsTabGistAccessToken"]', process.env.gist_token)
      .click('[data-id="settingsTabSaveGistToken"]')
      .clickLaunchIcon('filePanel')
      .scrollAndClick('*[data-id="landingPageImportFromGistButton"]')
      .waitForElementVisible('*[data-id="gisthandlerModalDialogModalBody-react"] input[data-id="modalDialogCustomPromp"]')
      .execute(function () {
        (document.querySelector('*[data-id="gisthandlerModalDialogModalBody-react"] input[data-id="modalDialogCustomPromp"]') as any).focus()
      })
      .setValue('*[data-id="gisthandlerModalDialogModalBody-react"] input[data-id="modalDialogCustomPromp"]', testData.validGistId)
      .modalFooterOKClick('gisthandler')
      .pause(10000)
      .openFile(`README.txt`)
      .waitForElementVisible(`div[data-path='gist ${testData.validGistId}/README.txt']`)
      .assert.containsText(`div[data-path='gist ${testData.validGistId}/README.txt'] > span`, 'README.txt')
  },

  'Load Gist from URL and verify truncated files are loaded #group3': !function (browser: NightwatchBrowser) {
    const gistId = '1b179bf1b92c8b0664b4cbe61774e15d'
    browser
      .url('http://127.0.0.1:8080/#gist=' + gistId) // loading the gist
      .refreshPage()
      .currentWorkspaceIs('gist ' + gistId)
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 15000)
      .waitForElementVisible(`#fileExplorerView li[data-path='contracts']`, 30000)
      .openFile(`contracts/2_Owner.sol`)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('contract Owner {') !== -1)
      })
      .waitForElementVisible('*[data-id="github-dropdown-toggle"]')
      .click('*[data-id="github-dropdown-toggle"]')
      .click('*[data-id="github-dropdown-item-publish-to-gist"]')
      .modalFooterOKClick('fileSystem')
      .waitForElementVisible('*[data-shared="tooltipPopup"]', 5000)
      .assert.containsText('*[data-shared="tooltipPopup"]', 'Saving gist (' + gistId + ') ...')
  }
}
