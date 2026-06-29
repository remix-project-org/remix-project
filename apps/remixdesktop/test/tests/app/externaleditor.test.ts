import {NightwatchBrowser} from 'nightwatch'

const testsBash = {
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    browser.hideToolTips()
    done()
  },
  open: function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="openFolderButton"]', 10000).click('*[data-id="openFolderButton"]')
  },
  'open xterm linux and create a file': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="toggleBottomPanelIcon"]')
      .click('*[data-id="toggleBottomPanelIcon"]')
      .waitForElementVisible('*[data-id="tabXTerm"]', 10000)
      .click('*[data-id="tabXTerm"]')
      .waitForElementVisible('*[data-type="remixUIXT"]', 10000)
      .click('*[data-type="remixUIXT"]')
      .perform(function () {
        const actions = this.actions({async: true})
        return actions.sendKeys('mkdir dir && cd dir && echo "test" >> example.txt').sendKeys(this.Keys.ENTER)
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemdir"]', 10000)
      .openFile('dir')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemdir/example.txt"]', 10000)
      .openFile('dir/example.txt')
      .getEditorValue((result) => {
        browser.assert.equal(result, 'test\n')
      })
      .waitForElementVisible('*[data-type="remixUIXT"]', 10000)
      .click('*[data-type="remixUIXT"]')
      .perform(function () {
        const actions = this.actions({async: true})
        return actions.sendKeys('echo "123" >> example.txt').sendKeys(this.Keys.ENTER)
      })
      .pause(1000)
      .saveScreenshot('./reports/screenshots/xterm1.png')
      .getEditorValue((result) => {
        browser.assert.equal(result, 'test\n123\n')
      })
      .setEditorValue('somethinginthere')
      .pause(1000)
      .perform(function () {
        const actions = this.actions({async: true})
        return actions.sendKeys('cat example.txt').sendKeys(this.Keys.ENTER)
      })
      .pause(1000)
      .getText(
        {
          selector: "//*[@data-type='remixUIXT' and @data-active='1']",
          timeout: 10000,
          locateStrategy: 'xpath',
        },
        function (result) {
          console.log('Text content of the element:', result.value)
          browser.assert.ok((result.value as string).includes('somethinginthere'))
        }
      )
  },
}

const testsWindows = {
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
   done()
  },
  open: function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="openFolderButton"]', 10000).click('*[data-id="openFolderButton"]')
  },
  'open xterm window and create a file': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="tabXTerm"]', 10000)
      .click('*[data-id="tabXTerm"]')
      .waitForElementVisible('*[data-id="select_shell"]')
      .click('*[data-id="select_shell"]')
      .waitForElementVisible('*[data-id="select_powershell.exe"]')
      .click('*[data-id="select_powershell.exe"]')
      .pause(3000)
      .waitForElementVisible("[data-active='1'][data-type='remixUIXT']", 10000)
      .click("[data-active='1'][data-type='remixUIXT']")
      .pause(1000)
      .perform(function () {
        const actions = this.actions({async: true})
        return actions.sendKeys('New-Item -ItemType Directory -Name "dir" ; Set-Location -Path "./dir" ; Add-Content -Path "example.txt" -Value "test" -Encoding UTF8').sendKeys(this.Keys.ENTER)
      })
      .pause(1000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemdir"]', 10000)
      .openFile('dir')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemdir/example.txt"]', 10000)
      .openFile('dir/example.txt').pause(1000)
      .getEditorValue((result) => {
        browser.assert.equal(result, 'test\r\n')
      })
      .pause(1000)
      .waitForElementVisible("[data-active='1'][data-type='remixUIXT']", 10000)
      .click("[data-active='1'][data-type='remixUIXT']")
      .perform(function () {
        const actions = this.actions({async: true})
        return actions.sendKeys('Add-Content -Path "example.txt" -Value "123" -Encoding UTF8').sendKeys(this.Keys.ENTER)
      })
      .pause(1000)
      .getEditorValue((result) => {
        browser.assert.equal(result, 'test\r\n123\r\n')
      })
      .setEditorValue('somethinginthere')
      .pause(1000)
      .perform(function () {
        const actions = this.actions({async: true})
        return actions.sendKeys('Get-Content example.txt').sendKeys(this.Keys.ENTER)
      }).pause(1000)
      .getText(
        {
          selector: "//*[@data-type='remixUIXT' and @data-active='1']",
          timeout: 10000,
          locateStrategy: 'xpath',
        },
        function (result) {
          console.log('Text content of the element:', result.value)
          browser.assert.ok((result.value as string).includes('somethinginthere'))
        }
      )
  }
}

module.exports = {
  ...process.platform.startsWith('win')?testsWindows:testsBash
}