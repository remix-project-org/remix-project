import { NightwatchBrowser } from "nightwatch"

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

const tests = {
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
        browser.hideToolTips().switchWindow(result.value[1])
          .hideToolTips()
          .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests"]')
      })

  },
  'Update settings for git #group1 #group2': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('dgit')
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
      .waitForElementVisible('*[data-id="gitubUsername"]')
      .setValue('*[data-id="githubToken"]', process.env.DGIT_TOKEN)
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
}

module.exports = tests
