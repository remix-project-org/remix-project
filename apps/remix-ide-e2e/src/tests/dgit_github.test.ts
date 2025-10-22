import { ChildProcess, spawn } from "child_process"
import init from "../helpers/init"
import { Nightwatch, NightwatchBrowser } from "nightwatch"

module.exports = {
  '@disabled': true,
  before: function (browser, done) {
    init(browser, done)
  },
  after: function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      done()
    })
  },
  'Update settings for git #group1 #group2': function (browser: NightwatchBrowser) {
    browser.
      clickLaunchIcon('dgit')
      .pause(1000)
      .waitForElementVisible('*[data-id="initgit-btn"]')
      .click('*[data-id="initgit-btn"]')
      .waitForElementNotPresent('*[data-id="initgit-btn"]')
  },
  'launch github login via FE #group1 #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="github-panel"]')
      .click('*[data-id="github-panel"]')
  },
  'login to github #group1 #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="github-panel"]')
      .waitForElementVisible('*[data-id="gitubUsername"]')
      .setValue('*[data-id="githubToken"]', process.env.dgit_token)
      .pause(1000)
      .setValue('*[data-id="gitubUsername"]', 'git')
      .pause(1000)
      .setValue('*[data-id="githubEmail"]', 'git@example.com')
      .pause(1000)
      .click('*[data-id="saveGitHubCredentials"]')
  },
  'check if the settings are loaded #group1 #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="connected-as-bunsenstraat"]')
      .waitForElementVisible('*[data-id="connected-img-bunsenstraat"]')
      .waitForElementVisible('*[data-id="connected-link-bunsenstraat"]')
      .waitForElementVisible('*[data-id="remotes-panel"]')
  },
  'check the FE shows logged in user #group1 #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible({
        selector: '//*[@data-id="github-dropdown-toggle-login"]//span[contains(text(), "bunsenstraat")]',
        locateStrategy: 'xpath'
      })
  },
  // 'check the FE for the auth user #group1 #group2': function (browser: NightwatchBrowser) {
  //   browser
  //     .clickLaunchIcon('filePanel')
  //     .waitForElementVisible('*[data-id="filepanel-connected-img-bunsenstraat"]')
  // },
  'clone a repository #group1': function (browser: NightwatchBrowser) {
    browser
      // .clickLaunchIcon('dgit')
      .waitForElementVisible('*[data-id="clone-panel"]')
      .click('*[data-id="clone-panel"]')
      .click({
        selector: '//*[@data-id="clone-panel-content"]//*[@data-id="fetch-repositories"]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="clone-panel-content"]//*[@id="repository-select"]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="clone-panel-content"]//*[@id="repository-select"]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="clone-panel-content"]//*[contains(text(), "awesome-remix")]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="clone-panel-content"]//*[contains(text(), "awesome-remix")]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="clone-panel-content"]//*[@id="branch-select"]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="clone-panel-content"]//*[@id="branch-select"]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="clone-panel-content"]//*[contains(text(), "master")]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="clone-panel-content"]//*[@data-id="clonebtn-remix-project-org/awesome-remix-master"]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="clone-panel-content"]//*[@data-id="clonebtn-remix-project-org/awesome-remix-master"]',
        locateStrategy: 'xpath'
      })
  },
  'check if there is a README.md file #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.md"]')
  },
  'check the commands panel #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('dgit')
      .click('*[data-id="commands-panel"]')
      .waitForElementVisible({
        selector: "//div[@id='commands-remote-branch-select']//div[contains(@class, 'singleValue') and contains(text(), 'master')]",
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: "//div[@id='commands-remote-origin-select']//div[contains(@class, 'singleValue') and contains(text(), 'origin')]",
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: "//div[@id='commands-local-branch-select']//div[contains(@class, 'singleValue') and contains(text(), 'master')]",
        locateStrategy: 'xpath'
      })
  },
  'check the remotes #group1': function (browser: NightwatchBrowser) {
    browser

      .click('*[data-id="remotes-panel"]')
      .waitForElementVisible('*[data-id="remotes-panel-content"]')
      .pause(2000)
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-detail-origin-default"]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="branches-current-branch-master"]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-sync-origin"]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="branches-branch-links"]',
        locateStrategy: 'xpath',
        timeout: 10000
      })

  },
  'check the commits of branch links #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="branches-branch-links"]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="branches-branch-links"]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="commit-summary-linking fixed-"]',
        locateStrategy: 'xpath'
      })
  },
  'switch to branch links #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="branches-panel"]')
      .waitForElementVisible({
        selector: '//*[@data-id="branches-panel-content-remote-branches"]//*[@data-id="branches-branch-links"]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="branches-panel-content-remote-branches"]//*[@data-id="branches-toggle-branch-links"]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="branches-panel-content-remote-branches"]//*[@data-id="branches-toggle-current-branch-links"]',
        locateStrategy: 'xpath'
      })
  },
  'check the local branches #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible({
        selector: '//*[@data-id="branches-panel-content-local-branches"]//*[@data-id="branches-toggle-current-branch-links"]',
        locateStrategy: 'xpath'
      })
  },
  'check the local commits #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="commits-panel"]')
      .pause(1000)
      .waitForElementVisible({
        selector: '//*[@data-id="commits-current-branch-links"]//*[@data-id="commit-summary-linking fixed-"]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="commits-current-branch-links"]//*[@data-id="commit-summary-linking fixed-"]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="commits-current-branch-links"]//*[@data-id="commit-change-modified-README.md"]',
        locateStrategy: 'xpath'
      })
  },
  'check the commands panel for links #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="commands-panel"]')
      .waitForElementVisible({
        selector: "//div[@id='commands-remote-branch-select']//div[contains(@class, 'singleValue') and contains(text(), 'links')]",
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: "//div[@id='commands-remote-origin-select']//div[contains(@class, 'singleValue') and contains(text(), 'origin')]",
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: "//div[@id='commands-local-branch-select']//div[contains(@class, 'singleValue') and contains(text(), 'links')]",
        locateStrategy: 'xpath'
      })
  },
  'reload page and check login persistence #group1': function (browser: NightwatchBrowser) {
    browser
      .refresh()
      .pause(5000) // Wait for page to fully reload
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('dgit')
      .waitForElementVisible('*[data-id="github-panel"]')
      .click('*[data-id="github-panel"]')
      .waitForElementVisible('*[data-id="connected-as-bunsenstraat"]')
      .waitForElementVisible('*[data-id="connected-img-bunsenstraat"]')
      .waitForElementVisible('*[data-id="connected-link-bunsenstraat"]')
  },
  'check the FE shows logged in user after reload #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible({
        selector: '//*[@data-id="github-dropdown-toggle-login"]//span[contains(text(), "bunsenstraat")]',
        locateStrategy: 'xpath'
      })
  },
  'disconnect github #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="disconnect-github"]')
      .pause(1000)
      .click('*[data-id="disconnect-github"]')
      .waitForElementNotPresent('*[data-id="connected-as-bunsenstraat"]')
  },
  'check the FE for the disconnected auth user #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementNotPresent({
        selector: '//*[@data-id="github-dropdown-toggle-login"]//span[contains(text(), "bunsenstraat")]',
        locateStrategy: 'xpath'
      })
  },
  // 'check the FE for the disconnected auth user #group1': function (browser: NightwatchBrowser) {
  //   browser
  //     .clickLaunchIcon('filePanel')
  //     .waitForElementNotPresent('*[data-id="filepanel-connected-img-bunsenstraat"]')
  //     .waitForElementVisible('*[data-id="filepanel-login-github"]')
  // },
  'add a remote #group2': function (browser: NightwatchBrowser) {
    browser
      .pause(1000)
      // .clickLaunchIcon('dgit')
      .waitForElementVisible('*[data-id="remotes-panel"]')
      .click('*[data-id="remotes-panel"]')
      .click({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="fetch-repositories"]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[@id="repository-select"]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="remotes-panel-content"]//*[@id="repository-select"]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[contains(text(), "awesome-remix")]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="remotes-panel-content"]//*[contains(text(), "awesome-remix")]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-panel-remotename"]',
        locateStrategy: 'xpath'
      })
      .setValue({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-panel-remotename"]',
        locateStrategy: 'xpath'
      }, 'newremote')
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-panel-addremote"]',
        locateStrategy: 'xpath'
      })
      .click({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-panel-addremote"]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-detail-newremote-default"]',
        locateStrategy: 'xpath'
      })
  },
  'check the commands panel for newremote #group2': function (browser: NightwatchBrowser) {
    browser
      .pause(1000)
      .click('*[data-id="commands-panel"]')
      .waitForElementVisible({
        selector: "//div[@id='commands-remote-branch-select']//div[contains(@class, 'singleValue') and contains(text(), 'main')]",
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: "//div[@id='commands-remote-origin-select']//div[contains(@class, 'singleValue') and contains(text(), 'newremote')]",
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: "//div[@id='commands-local-branch-select']//div[contains(@class, 'singleValue') and contains(text(), 'main')]",
        locateStrategy: 'xpath'
      })
      .pause(1000)
      .getAttribute({
        selector: '//*[@data-id="sourcecontrol-pull"]',
        locateStrategy: 'xpath'
      }, 'disabled', (result) => {
        if (result.value) {
          browser.assert.fail('Button is disabled')
        } else {
          browser.assert.ok(true)
        }
      })
  },
  'remove the remote #group2': function (browser: NightwatchBrowser) {
    browser
      .pause(1000)
      .click('*[data-id="remotes-panel"]')
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-rm-newremote"]',
        locateStrategy: 'xpath'
      })
      .pause(2000)
      .click({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-rm-newremote"]',
        locateStrategy: 'xpath'
      })
      .pause(1000)
      .waitForElementNotPresent({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-detail-newremote-default"]',
        locateStrategy: 'xpath'
      })
  },
  'check the commands panel for removed remote #group2': function (browser: NightwatchBrowser) {
    browser
      .pause(1000)
      .click('*[data-id="commands-panel"]')
      .waitForElementVisible({
        selector: "//div[@id='commands-remote-branch-select']//div[contains(@class, 'singleValue') and contains(text(), 'main')]",
        locateStrategy: 'xpath'
      })
      .waitForElementNotPresent({
        selector: "//div[@id='commands-remote-origin-select']//div[contains(@class, 'singleValue') and contains(text(), 'newremote')]",
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: "//div[@id='commands-local-branch-select']//div[contains(@class, 'singleValue') and contains(text(), 'main')]",
        locateStrategy: 'xpath'
      })
      .getAttribute({
        selector: '//*[@data-id="sourcecontrol-pull"]',
        locateStrategy: 'xpath'
      }, 'disabled', (result) => {
        if (result.value) {
          browser.assert.ok(true)
        } else {
          browser.assert.fail('Button is not disabled')
        }
      })
  },
  // pagination test
  'clone repo #group3': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('dgit')
      .waitForElementVisible('*[data-id="clone-panel"]')
      .click('*[data-id="clone-panel"]')
      .waitForElementVisible('*[data-id="clone-url"]')
      .setValue('*[data-id="clone-url"]', 'https://github.com/remix-project-org/awesome-remix')
      .waitForElementVisible('*[data-id="clone-branch"]')
      .setValue('*[data-id="clone-branch"]', 'master')
      .waitForElementVisible('*[data-id="clone-btn"]')
      .click('*[data-id="clone-btn"]')
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.md"]')
  },
  'Update settings for git #group3': function (browser: NightwatchBrowser) {
    browser.
      clickLaunchIcon('dgit')
      .waitForElementVisible('*[data-id="github-panel"]')
      .pause(1000)
      .click('*[data-id="github-panel"]')
      .pause(1000)
      .setValue('*[data-id="githubToken"]', 'invalidtoken')
      .pause(1000)
      .setValue('*[data-id="gitubUsername"]', 'git')
      .pause(1000)
      .setValue('*[data-id="githubEmail"]', 'git@example.com')
      .pause(1000)
      .click('*[data-id="saveGitHubCredentials"]')
      .pause(1000)
      .modalFooterOKClick('github-credentials-error')
  },
  'check the commits panel for pagination #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="commits-panel"]')
      .click('*[data-id="commits-panel"]')
      .elements('xpath', '//*[@data-id="commits-current-branch-master"]//*[@data-type="commit-summary"]', function (result) {
        console.log('Number of commit-summary elements:', (result.value as any).length);
        browser.assert.ok((result.value as any).length == 1)
      })
  },
  'load more commits #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="load-more-commits"]')
      .click('*[data-id="load-more-commits"]')
      .waitForElementVisible('*[data-id="loader-indicator"]')
      .waitForElementNotPresent('*[data-id="loader-indicator"]')
      .pause(5000) // wait for the loading to finish
      .elements('xpath', '//*[@data-id="commits-current-branch-master"]//*[@data-type="commit-summary"]', function (result) {
        console.log('Number of commit-summary elements:', (result.value as any).length);
        browser.assert.ok((result.value as any).length > 2)
      })
  },
  'load more branches from remote #group3': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="branches-panel"]')
      .waitForElementVisible({
        selector: '//*[@data-id="branches-panel-content-remote-branches"]',
        locateStrategy: 'xpath'
      })
      .elements('xpath', '//*[@data-id="branches-panel-content-remote-branches"]//*[@data-type="branches-branch"]', function (result) {
        console.log('Number of branches elements:', (result.value as any).length);
        browser.assert.ok((result.value as any).length == 1)
      })
      .waitForElementVisible('*[data-id="remote-sync-origin"]')
      .click('*[data-id="remote-sync-origin"]')
      .waitForElementVisible('*[data-id="loader-indicator"]')
      .waitForElementNotPresent('*[data-id="loader-indicator"]')
      .elements('xpath', '//*[@data-id="branches-panel-content-remote-branches"]//*[@data-type="branches-branch"]', function (result) {
        console.log('Number of branches elements:', (result.value as any).length);
        browser.assert.ok((result.value as any).length > 2)
      })
  }
}
