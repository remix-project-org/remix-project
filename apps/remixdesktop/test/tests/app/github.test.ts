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
  // 'launch github login via FE #group1 #group2': function (browser: NightwatchBrowser) {
  //   browser
  //     .clickLaunchIcon('filePanel')
  //     .pause(1000)
  //     .waitForElementVisible('*[data-id="filepanel-login-github"]')
  //     .click('*[data-id="filepanel-login-github"]')
  // },
  'login to github #group1 #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="github-panel"]')
      .click('*[data-id="github-panel"]')
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
  'clone a repository #group1': function (browser: NightwatchBrowser) {
    browser
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
      .pause(5000)
      .windowHandles(function (result) {
        console.log(result.value)
        browser.hideToolTips().switchWindow(result.value[2])
          .hideToolTips()
          .pause(1000)
          .waitForElementVisible('*[data-id="treeViewLitreeViewItem.git"]')
      })
  },
  'check if user is still logged in after cloning #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible({
        selector: '//*[@data-id="github-dropdown-toggle-login"]//span[contains(text(), "bunsenstraat")]',
        locateStrategy: 'xpath'
      })
  },
  'check if there is a README.md file #group1': function (browser: NightwatchBrowser) {
    browser
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
      .pause(1000)
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
  'disconnect github #group1': function (browser: NightwatchBrowser) {

    browser
      .waitForElementVisible('*[data-id="github-panel"]')
      .pause(1000)
      .click('*[data-id="github-panel"]')
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
}

module.exports = tests
