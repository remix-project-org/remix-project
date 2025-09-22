import { NightwatchBrowser } from 'nightwatch'

const tests = {
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    browser.hideToolTips()
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
        const actions = this.actions({ async: true })
        return actions.sendKeys('"test" | Out-File -FilePath example.txt').sendKeys(this.Keys.ENTER)
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemexample.txt"]', 10000)
  },
  'rename that file': function (browser: NightwatchBrowser) {
    browser
      .perform(function () {
        const actions = this.actions({ async: true })
        return actions.sendKeys('Move-Item -Path example.txt -Destination newExample.txt').sendKeys(this.Keys.ENTER)
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemnewExample.txt"]', 10000)
  },
  'create a file and delete it': function (browser: NightwatchBrowser) {
    browser
      .perform(function () {
        const actions = this.actions({ async: true })
        return actions.sendKeys('touch newExample2.txt').sendKeys(this.Keys.ENTER)
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemnewExample2.txt"]', 10000)
      .perform(function () {
        const actions = this.actions({ async: true })
        return actions.sendKeys('Remove-Item -Path newExample2.txt').sendKeys(this.Keys.ENTER)
      })
      .waitForElementNotPresent('*[data-id="treeViewLitreeViewItemnewExample2.txt"]', 10000)
  },
  'run a git clone command': function (browser: NightwatchBrowser) {
    browser
      .perform(function () {
        const actions = this.actions({ async: true })
        return actions.sendKeys('git clone https://github.com/remix-project-org/awesome-remix').sendKeys(this.Keys.ENTER)
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemawesome-remix"]', 10000)
      .click('*[data-id="treeViewLitreeViewItemawesome-remix"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemawesome-remix/README.md"]', 10000)
  },
  'remove the cloned repo': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible("[data-active='1'][data-type='remixUIXT']", 10000)
      .click("[data-active='1'][data-type='remixUIXT']")
      .perform(function () {
        const actions = this.actions({ async: true })
        return actions.sendKeys('Remove-Item -Path awesome-remix -Recurse -Force').sendKeys(this.Keys.ENTER)
      })
      .waitForElementNotPresent('*[data-id="treeViewLitreeViewItemawesome-remix"]', 10000)
  },
  'list files': function (browser: NightwatchBrowser) {
    browser
      .pause(3000)
      .waitForElementVisible("[data-active='1'][data-type='remixUIXT']", 10000)
      .click("[data-active='1'][data-type='remixUIXT']")
      .saveScreenshot('./reports/screenshots/list-files.png')
      .perform(function () {
        const actions = this.actions({ async: true })
        return actions.sendKeys('ls').sendKeys(this.Keys.ENTER)
      })
      .saveScreenshot('./reports/screenshots/list-files-after.png')
      .waitForElementVisible({
        selector: "//*[@data-type='remixUIXT' and @data-active='1']",
        timeout: 10000,
        locateStrategy: 'xpath',
      })
      .pause(2000)
      .getText(
        {
          selector: "//*[@data-type='remixUIXT' and @data-active='1']",
          timeout: 10000,
          locateStrategy: 'xpath',
        },
        function (result) {
          console.log('Text content of the element:', result.value)
          browser.assert.ok((result.value as string).includes('newExample'))
        }
      )
  },
  'switch to a new terminal': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="select_shell"]')
      .click('*[data-id="select_shell"]')
      .waitForElementVisible('*[data-id="select_powershell.exe"]')
      .click('*[data-id="select_powershell.exe"]')
      .pause(3000)
      .elements('css selector', '[data-type="remixUIXTSideButton"]', function (result) {
        console.log(result)
        browser.assert.ok((result.value as any).length === 3)
      })
      .getText(
        {
          selector: "//*[@data-type='remixUIXT' and @data-active='1']",
          timeout: 10000,
          locateStrategy: 'xpath',
        },
        function (result) {
          console.log('Text content of the element:', result.value)
          browser.assert.ok(!(result.value as string).includes('newExample'))
        }
      )
  },
  'switch to a third terminal': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="select_shell"]')
      .click('*[data-id="select_shell"]')
      .waitForElementVisible('*[data-id="select_powershell.exe"]')
      .click('*[data-id="select_powershell.exe"]')
      .pause(3000)
      .waitForElementVisible(
        {
          selector: "//*[@data-type='remixUIXT' and @data-active='1']",
          timeout: 10000,
          locateStrategy: 'xpath',
        },
        10000
      )
      .click({
        selector: "//*[@data-type='remixUIXT' and @data-active='1']",
        timeout: 10000,
        locateStrategy: 'xpath',
      })
      .elements('css selector', '[data-type="remixUIXTSideButton"]', function (result) {
        browser.assert.ok((result.value as any).length === 4)
      })
      .perform(function () {
        const actions = this.actions({ async: true })
        return actions.sendKeys('echo thirdterminal').sendKeys(this.Keys.ENTER)
      })
  },
  'switch back to the second terminal': function (browser: NightwatchBrowser) {
    browser
      .elements('css selector', '[data-type="remixUIXTSideButton"]', function (result) {
        browser.elementIdClick(Object.values((result.value as any)[2])[0] as any)
      })
      .getText(
        {
          selector: "//*[@data-type='remixUIXT' and @data-active='1']",
          timeout: 10000,
          locateStrategy: 'xpath',
        },
        function (result) {
          console.log('Text content of the element:', result.value)
          browser.assert.ok(!(result.value as string).includes('newExample'))
        }
      )
  },
  'close the second terminal': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="closeTerminalButton"]', 10000)
      .click('*[data-id="closeTerminalButton"]')
      .pause(1000)
      .elements('css selector', '[data-type="remixUIXTSideButton"]', function (result) {
        browser.assert.ok((result.value as any).length === 3)
      })
  },
  'switch back to the first terminal': function (browser: NightwatchBrowser) {
    browser
      .elements('css selector', '[data-type="remixUIXTSideButton"]', function (result) {
        browser.elementIdClick(Object.values((result.value as any)[1])[0] as any)
      })
      .getText(
        {
          selector: "//*[@data-type='remixUIXT' and @data-active='1']",
          timeout: 10000,
          locateStrategy: 'xpath',
        },
        function (result) {
          console.log('Text content of the element:', result.value)
          browser.assert.ok((result.value as string).includes('newExample'))
        }
      )
  },
  'switch to the output panel': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="tabOutput"]', 10000).click('*[data-id="tabOutput"]').waitForElementNotPresent('*[data-id="createTerminalButton"]', 10000)
  },
  'switch back to xterminal': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="tabXTerm"]', 10000)
      .click('*[data-id="tabXTerm"]')
      .waitForElementVisible("[data-active='1'][data-type='remixUIXT']", 10000)
      .click("[data-active='1'][data-type='remixUIXT']")
      .getText(
        {
          selector: "//*[@data-type='remixUIXT' and @data-active='1']",
          timeout: 10000,
          locateStrategy: 'xpath',
        },
        function (result) {
          console.log('Text content of the element:', result.value)
          browser.assert.ok((result.value as string).includes('newExample'))
        }
      )
  },
  'clear the terminal': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="clearTerminalButton"]', 10000)
      .click('*[data-id="clearTerminalButton"]')
      .getText(
        {
          selector: "//*[@data-type='remixUIXT' and @data-active='1']",
          timeout: 10000,
          locateStrategy: 'xpath',
        },
        function (result) {
          console.log('Text content of the element:', result.value)
          browser.assert.ok(!(result.value as string).includes('newExample'))
        }
      )
  },
  'close all terminals': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="closeTerminalButton"]', 10000)
      .click('*[data-id="closeTerminalButton"]')
      .pause(3000)
      .click('*[data-id="closeTerminalButton"]')
      .pause(3000)
      .click('*[data-id="closeTerminalButton"]')
      .pause(3000)
      .elements('css selector', '[data-type="remixUIXTSideButton"]', function (result) {
        browser.assert.ok((result.value as any).length === 0)
      }).end()
  },
  after: function (browser: NightwatchBrowser) {
    browser.end()
  },
}

module.exports = {
  ...process.platform.startsWith('win') ? tests : {}
}