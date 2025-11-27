import { NightwatchBrowser } from 'nightwatch'

function openTemplatesExplorer(browser: NightwatchBrowser) {
  browser
    .click('*[data-id="workspacesSelect"]')
    .pause(2000)
    .click('*[data-id="workspacecreate"]')
    .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
    .waitForElementVisible('*[data-id="template-explorer-template-container"]')
    .click('*[data-id="template-explorer-template-container"]')
    .waitForElementPresent('*[data-id="template-card-remixDefault-0"]')
    .click('*[data-id="template-card-remixDefault-0"]')
    .waitForElementVisible('*[data-id="workspace-details-section"]')
}

module.exports = {
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    browser.hideToolTips()
    done()
  },
  'open default template': function (browser: NightwatchBrowser) {
    browser
      .hideToolTips()
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)

    openTemplatesExplorer(browser)

    browser
      .pause(3000)
      .windowHandles(function (result) {
        console.log(result.value)
        browser
          .hideToolTips()
          .switchWindow(result.value[1])
          .hideToolTips()
          .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests"]')
          .click('*[data-id="treeViewLitreeViewItemtests"]')
          .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
          .click('*[data-id="treeViewLitreeViewItemcontracts"]')
          .waitForElementVisible('[data-id="treeViewLitreeViewItemcontracts/1_Storage.sol"]')
          .openFile('contracts/1_Storage.sol')
          .waitForElementVisible('*[id="editorView"]', 10000)
          .getEditorValue((content) => {
            browser.assert.ok(content.includes('function retrieve() public view returns (uint256){'))
          })
      })
  },
  'Should find text #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .click('*[plugin="search"]')
      .waitForElementVisible('*[id="search_input"]')
      .click('*[id="search_include"]')
      .waitForElementVisible('*[id="search_include"]')
      .setValue('*[id="search_include"]', ', *.*').pause(2000)
      .setValue('*[id="search_input"]', 'read').sendKeys('*[id="search_input"]', browser.Keys.ENTER)
      .pause(1000)
      .waitForElementContainsText('*[data-id="search_results"]', '3_BALLOT.SOL', 60000)
      .waitForElementContainsText('*[data-id="search_results"]', 'contracts', 60000)
      .waitForElementContainsText('*[data-id="search_results"]', 'README.TXT', 60000)
      .waitForElementContainsText('*[data-id="search_results"]', 'file must')
      .waitForElementContainsText('*[data-id="search_results"]', 'be compiled')
      .waitForElementContainsText('*[data-id="search_results"]', 'that person al')
      .waitForElementContainsText('*[data-id="search_results"]', 'sender.voted')
      .waitForElementContainsText('*[data-id="search_results"]', 'read')
      .elements('css selector', '.search_plugin_search_line', (res) => {
        Array.isArray(res.value) && browser.assert.equal(res.value.length, 7)
      })
  }, 'Should find text with exclude #group1': function (browser: NightwatchBrowser) {
    browser
      .clearValue('*[id="search_input"]')
      .setValue('*[id="search_input"]', 'contract').pause(1000)
      .clearValue('*[id="search_include"]').pause(2000)
      .setValue('*[id="search_include"]', '**').sendKeys('*[id="search_include"]', browser.Keys.ENTER).pause(4000)
      .elements('css selector', '.search_plugin_search_line', (res) => {
        Array.isArray(res.value) && browser.assert.equal(res.value.length, 61)
      })
      .setValue('*[id="search_exclude"]', ',contracts/**').sendKeys('*[id="search_exclude"]', browser.Keys.ENTER).pause(4000)
      .elements('css selector', '.search_plugin_search_line', (res) => {
        Array.isArray(res.value) && browser.assert.equal(res.value.length, 54)
      })
      .clearValue('*[id="search_include"]').setValue('*[id="search_include"]', '*.sol, *.js, *.txt')
      .clearValue('*[id="search_exclude"]').setValue('*[id="search_exclude"]', '.*/**/*')
  },
  'Should find regex #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[id="search_input"]')
      .clearValue('*[id="search_input"]').pause(2000)
      .setValue('*[id="search_input"]', '^contract').sendKeys('*[id="search_input"]', browser.Keys.ENTER).pause(3000)
      .waitForElementVisible('*[data-id="search_use_regex"]').click('*[data-id="search_use_regex"]').pause(3000)
      .waitForElementContainsText('*[data-id="search_results"]', '3_BALLOT.SOL', 60000)
      .waitForElementContainsText('*[data-id="search_results"]', '2_OWNER.SOL', 60000)
      .waitForElementContainsText('*[data-id="search_results"]', '1_STORAGE.SOL', 60000)
      .waitForElementContainsText('*[data-id="search_results"]', 'BALLOT_TEST.SOL', 60000)
      .waitForElementContainsText('*[data-id="search_results"]', 'tests', 60000)
      .elements('css selector', '.search_plugin_search_line', (res) => {
        Array.isArray(res.value) && browser.assert.equal(res.value.length, 4)
      })
  },
  'Should find matchcase #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="search_use_regex"]').click('*[data-id="search_use_regex"]')
      .waitForElementVisible('*[data-id="search_case_sensitive"]').click('*[data-id="search_case_sensitive"]').pause(4000)
      .elements('css selector', '.search_plugin_search_line', (res) => {
        Array.isArray(res.value) && browser.assert.equal(res.value.length, 0)
      })
      .clearValue('*[id="search_input"]')
      .setValue('*[id="search_input"]', 'Contract').sendKeys('*[id="search_input"]', browser.Keys.ENTER).pause(3000)
      .elements('css selector', '.search_plugin_search_line', (res) => {
        Array.isArray(res.value) && browser.assert.equal(res.value.length, 3)
      })
      .waitForElementContainsText('*[data-id="search_results"]', 'STORAGE.TEST.JS', 60000)
  },
  'Should find matchword #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="search_case_sensitive"]').click('*[data-id="search_case_sensitive"]')
      .waitForElementVisible('*[data-id="search_whole_word"]').click('*[data-id="search_whole_word"]').pause(2000)
      .clearValue('*[id="search_input"]')
      .setValue('*[id="search_input"]', 'contract').sendKeys('*[id="search_input"]', browser.Keys.ENTER).pause(4000)
      .elements('css selector', '.search_plugin_search_line', (res) => {
        Array.isArray(res.value) && browser.assert.equal(res.value.length, 16)
      })
  },
  'Should replace text #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="toggle_replace"]').click('*[data-id="toggle_replace"]')
      .waitForElementVisible('*[id="search_replace"]')
      .clearValue('*[id="search_include"]').setValue('*[id="search_include"]', 'contracts/2_*.sol')
      .setValue('*[id="search_replace"]', 'replacing').sendKeys('*[id="search_include"]', browser.Keys.ENTER).pause(1000)
      .waitForElementVisible('*[data-id="contracts/2_Owner.sol-33-71"]')
      .moveToElement('*[data-id="contracts/2_Owner.sol-33-71"]', 10, 10)
      .waitForElementVisible('*[data-id="replace-contracts/2_Owner.sol-33-71"]')
      .click('*[data-id="replace-contracts/2_Owner.sol-33-71"]').pause(2000).
      modalFooterOKClick('confirmreplace').pause(2000).
      getEditorValue((content) => {
        browser.assert.ok(content.includes('replacing deployer for a constructor'), 'should replace text ok')
      })
  },
  'Should replace text without confirmation #group1': function (browser: NightwatchBrowser) {
    browser.click('*[data-id="confirm_replace_label"]').pause(500)
      .clearValue('*[id="search_input"]')
      .setValue('*[id="search_input"]', 'replacing').sendKeys('*[id="search_input"]', browser.Keys.ENTER).pause(1000)
      .setValue('*[id="search_replace"]', 'replacing2').pause(1000)
      .waitForElementVisible('*[data-id="contracts/2_Owner.sol-33-71"]')
      .moveToElement('*[data-id="contracts/2_Owner.sol-33-71"]', 10, 10)
      .waitForElementVisible('*[data-id="replace-contracts/2_Owner.sol-33-71"]')
      .click('*[data-id="replace-contracts/2_Owner.sol-33-71"]').pause(2000).
      getEditorValue((content) => {
        browser.assert.ok(content.includes('replacing2 deployer for a constructor'), 'should replace text ok')
      })
  },
  'Should replace all & undo #group1': function (browser: NightwatchBrowser) {
    browser
      .clearValue('*[id="search_input"]')
      .clearValue('*[id="search_include"]').setValue('*[id="search_include"]', 'contracts/1_*.sol')
      .setValue('*[id="search_input"]', 'storage').sendKeys('*[id="search_include"]', browser.Keys.ENTER)
      .clearValue('*[id="search_replace"]')
      .setValue('*[id="search_replace"]', '123test').pause(1000)
      .waitForElementVisible('*[data-id="replace-all-contracts/1_Storage.sol"]')
      .click('*[data-id="replace-all-contracts/1_Storage.sol"]').pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('contract 123test'), 'should replace text ok')
        browser.assert.ok(content.includes('title 123test'), 'should replace text ok')
      })
      .waitForElementVisible('*[data-id="undo-replace-contracts/1_Storage.sol"]')
      .click('*[data-id="undo-replace-contracts/1_Storage.sol"]').pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('contract Storage'), 'should undo text ok')
        browser.assert.ok(content.includes('title Storage'), 'should undo text ok')
      })
  },
  'Should replace all & undo & switch between files #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[id="search_input"]')
      .clearValue('*[id="search_input"]')
      .clearValue('*[id="search_include"]').setValue('*[id="search_include"]', '*.sol, *.js, *.txt')
      .setValue('*[id="search_input"]', 'storage').sendKeys('*[id="search_include"]', browser.Keys.ENTER)
      .clearValue('*[id="search_replace"]')
      .setValue('*[id="search_replace"]', '123test').pause(1000)
      .waitForElementVisible('*[data-id="replace-all-contracts/1_Storage.sol"]')
      .click('*[data-id="replace-all-contracts/1_Storage.sol"]').pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('contract 123test'), 'should replace text ok')
        browser.assert.ok(content.includes('title 123test'), 'should replace text ok')
      })
      .waitForElementVisible('*[data-id="undo-replace-contracts/1_Storage.sol"]')
      .openFile('README.txt')
      .click('*[plugin="search"]').pause(2000)
      .waitForElementNotPresent('*[data-id="undo-replace-contracts/1_Storage.sol"]')
      .waitForElementVisible('*[data-id="replace-all-README.txt"]')
      .click('*[data-id="replace-all-README.txt"]').pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes("123test' contract"), 'should replace text ok')
      })
      .waitForElementVisible('*[data-id="undo-replace-README.txt"]')
      .click('div[data-path="/contracts/1_Storage.sol"]').pause(2000)
      .waitForElementVisible('*[data-id="undo-replace-contracts/1_Storage.sol"]')
      .click('*[data-id="undo-replace-contracts/1_Storage.sol"]').pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('contract Storage'), 'should undo text ok')
        browser.assert.ok(content.includes('title Storage'), 'should undo text ok')
      })
      .click('div[data-path="/README.txt"]').pause(2000)
      .waitForElementVisible('*[data-id="undo-replace-README.txt"]')
      .click('*[data-id="undo-replace-README.txt"]').pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes("Storage' contract"), 'should replace text ok')
      })
  },
  'Should hide button when edited content is the same #group2': function (browser: NightwatchBrowser) {
    browser.refresh()
      .hideToolTips()
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .addFile('test.sol', { content: '123' })
      .pause(4000)
      .click('*[plugin="search"]')
      .waitForElementVisible('*[id="search_input"]')
      .waitForElementVisible('*[data-id="toggle_replace"]')
      .click('*[data-id="toggle_replace"]')
      .clearValue('*[id="search_input"]')
      .setValue('*[id="search_input"]', '123')
      .sendKeys('*[id="search_input"]', browser.Keys.ENTER)
      .waitForElementVisible('*[id="search_replace"]')
      .clearValue('*[id="search_replace"]')
      .setValue('*[id="search_replace"]', '456').pause(1000)
      .click('*[data-id="confirm_replace_label"]').pause(500)
      .waitForElementVisible('*[data-id="replace-all-test.sol"]')
      .click('*[data-id="replace-all-test.sol"]').pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('456'), 'should replace text ok')
      }
      )
      .setEditorValue('123')
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('123'), 'should have text ok')
      }
      ).pause(5000)
      .waitForElementNotPresent('*[data-id="undo-replace-test.sol"]')
  },
  'Should disable/enable button when edited content changed #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[id="search_input"]')
      .clearValue('*[id="search_input"]')
      .clearValue('*[id="search_input"]')
      .setValue('*[id="search_input"]', '123').sendKeys('*[id="search_input"]', browser.Keys.ENTER)
      .clearValue('*[id="search_replace"]')
      .setValue('*[id="search_replace"]', 'replaced').pause(1000)
      .waitForElementVisible('*[data-id="replace-all-test.sol"]')
      .click('*[data-id="replace-all-test.sol"]').pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('replaced'), 'should replace text ok')
      }
      )
      .setEditorValue('changed')
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('changed'), 'should have text ok')
      }
      ).pause(5000)
      .waitForElementVisible('*[data-id="undo-replace-test.sol"]')
      .getAttribute('[data-id="undo-replace-test.sol"]', 'disabled', (result) => {
        browser.assert.equal(result.value, 'true', 'should be disabled')
      })
      .setEditorValue('replaced')
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('replaced'), 'should have text ok')
      }
      ).pause(1000)
      .waitForElementVisible('*[data-id="undo-replace-test.sol"]')
      .getAttribute('[data-id="undo-replace-test.sol"]', 'disabled', (result) => {
        browser.assert.equal(result.value, null, 'should not be disabled')
      })
      .click('*[data-id="undo-replace-test.sol"]').pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.includes('123'), 'should have text ok')
      })
      .waitForElementNotPresent('*[data-id="undo-replace-test.sol"]')
  },

  'should clear search #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[id="search_input"]')
      .setValue('*[id="search_input"]', 'nodata').sendKeys('*[id="search_input"]', browser.Keys.ENTER).pause(1000)
      .elements('css selector', '.search_plugin_search_line', (res) => {
        Array.isArray(res.value) && browser.assert.equal(res.value.length, 0)
      })
  }

}
