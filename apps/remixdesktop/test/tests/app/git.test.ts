import { NightwatchBrowser } from 'nightwatch'


module.exports = {
  '@isogit': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    browser.hideToolTips()
    done()
  },
  'clone a repo': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .waitForElementVisible('*[data-id="cloneFromGitButton"]')
      .click('*[data-id="cloneFromGitButton"]')
      .pause(1000)
      .waitForElementVisible('[data-id="fileSystemModalDialogModalBody-react"]')
      .click('[data-id="fileSystemModalDialogModalBody-react"]')
      .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
      .setValue('[data-id="modalDialogCustomPromptTextClone"]', 'https://github.com/remix-project-org/awesome-remix')
      .click('[data-id="fileSystem-modal-footer-ok-react"]')
      .pause(3000)
      .windowHandles(function (result) {
        console.log(result.value)
        browser.switchWindow(result.value[1])
          .waitForElementVisible('*[data-id="treeViewLitreeViewItem.git"]')
      })
      .end()
  }
}
