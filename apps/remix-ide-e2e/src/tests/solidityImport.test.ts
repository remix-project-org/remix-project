'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },

  'Test Simple Contract #group1': function (browser: NightwatchBrowser) {
    browser.testContracts('Untitled.sol', sources[0]['Untitled.sol'], ['test1', 'test2'])
  },

  'Test Success Import #group1': function (browser: NightwatchBrowser) {
    browser.addFile('Untitled1.sol', sources[1]['Untitled1.sol'])
      .addFile('Untitled2.sol', sources[1]['Untitled2.sol']).pause(4000)
      .openFile('Untitled1.sol')
      .verifyContracts(['test6', 'test4', 'test5'])
      .pause(1000)
  },

  'Test Failed Import #group1': function (browser: NightwatchBrowser) {
    browser.addFile('Untitled3.sol', sources[2]['Untitled3.sol'])
      .clickLaunchIcon('solidity')
      .click('[data-id="compilerContainerCompileBtn"]')
      .isVisible({
        selector: "//span[contains(.,'not found /Untitled11')]",
        locateStrategy: 'xpath',
        timeout: 120000,
      })

  },

  'Test GitHub Import - from master branch #group1': function (browser: NightwatchBrowser) {
    browser
      .setSolidityCompilerVersion('soljson-v0.8.20+commit.a1b79de6.js') // open-zeppelin moved to pragma ^0.8.20 (master branch)
      .addFile('Untitled4.sol', sources[3]['Untitled4.sol'])
      .clickLaunchIcon('filePanel')
      .verifyContracts(['test7', 'ERC20'], { wait: 10000 })
  },

  'Test GitHub Import - from other branch #group2': function (browser: NightwatchBrowser) {
    browser
      .setSolidityCompilerVersion('soljson-v0.5.0+commit.1d4f565a.js') // switch back to 0.5.0 : release-v2.3.0 branch is not solidity 0.6 compliant
      .addFile('Untitled5.sol', sources[4]['Untitled5.sol'])
      .clickLaunchIcon('filePanel')
      .verifyContracts(['test8', 'ERC20', 'SafeMath'], { wait: 10000 })
  },

  'Test GitHub Import - no branch specified #group2': function (browser: NightwatchBrowser) {
    browser
      .setSolidityCompilerVersion('soljson-v0.8.20+commit.a1b79de6.js') // open-zeppelin moved to pragma ^0.8.20 (master branch)
      .clickLaunchIcon('filePanel')
      .click('li[data-id="treeViewLitreeViewItemREADME.txt"')
      .addFile('Untitled6.sol', sources[5]['Untitled6.sol'])
      .clickLaunchIcon('filePanel')
      .verifyContracts(['test10', 'ERC20'], { wait: 10000 })
  },

  'Test GitHub Import - raw URL #group4': function (browser: NightwatchBrowser) {
    browser
      .setSolidityCompilerVersion('soljson-v0.8.20+commit.a1b79de6.js') // open-zeppelin moved to pragma ^0.8.20 (master branch)
      .clickLaunchIcon('filePanel')
      .click('li[data-id="treeViewLitreeViewItemREADME.txt"')
      .addFile('Untitled7.sol', sources[6]['Untitled7.sol'])
      .clickLaunchIcon('filePanel')
      .verifyContracts(['test11', 'ERC20'], { wait: 10000 })
  },

  'Test switch to a GitHub import from a solidity warning #group3': function (browser: NightwatchBrowser) {
    browser
      .setSolidityCompilerVersion('soljson-v0.7.4+commit.3f05b770.js')
      .clickLaunchIcon('filePanel')
      .click('li[data-id="treeViewLitreeViewItemREADME.txt"')
      .addFile('Untitled8.sol', sources[7]['Untitled8.sol'])
      .clickLaunchIcon('filePanel')
      .clickLaunchIcon('solidity')
      .waitForElementVisible('[data-id="https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/contracts/token/ERC20/ERC20.sol"]', 120000)
      .scrollAndClick('[data-id="https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/contracts/token/ERC20/ERC20.sol"]') // click on error which point to ERC20 code
      .pause(5000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('contract ERC20 is Context, IERC20') !== -1, 'content does not contain "contract ERC20 is Context, IERC20"')
      })
  },

  'Test NPM Import (with unpkg.com) #group3': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('li[data-id="treeViewLitreeViewItemREADME.txt"')
      .addFile('Untitled9.sol', sources[8]['Untitled9.sol'])
      // avoid invalid source issues
      .expandAllFolders()
      .isVisible({
        selector: '*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"]',
        timeout: 120000,
        suppressNotFoundErrors: true
      })
      .clickLaunchIcon('solidity')
      .setSolidityCompilerVersion('soljson-v0.8.20+commit.a1b79de6.js')
      .click('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .expandAllFolders()
      .isVisible({
        selector: '*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"]',
        timeout: 120000,
      })
      .verifyContracts(['test13', 'ERC20'], { wait: 30000 })
  },

  'Test NPM Import (with unpkg.com) and the package.json contains a module remapping #group3': function (browser: NightwatchBrowser) {
    browser
      .setSolidityCompilerVersion('soljson-v0.8.7+commit.e28d00a7.js')
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded' and @data-version='soljson-v0.8.7+commit.e28d00a7.js']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .clickLaunchIcon('filePanel')
      .click('li[data-id="treeViewLitreeViewItemREADME.txt"')
      .addFile('package.json', sources[9]['package.json'])
      .addFile('Untitled10.sol', sources[9]['Untitled10.sol'])
      .expandAllFolders()
      // avoid invalid source issues
      .isVisible({
        selector: '*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"]',
        timeout: 120000,
        suppressNotFoundErrors: true
      })
      .clickLaunchIcon('solidity')
      .click('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .expandAllFolders()
      .isVisible({
        selector: '*[data-id="treeViewLitreeViewItem.deps/npm/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"]',
        timeout: 120000,
      })
      .verifyContracts(['test15', 'ERC20'], { wait: 30000 })
  },

  'Test NPM Import (prefixed by `npm:` and remappings.txt), it should import from two different solidity version #group3': function (browser: NightwatchBrowser) {
    browser
      .setSolidityCompilerVersion('soljson-v0.8.30+commit.73712a01.js')
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded' and @data-version='soljson-v0.8.30+commit.73712a01.js']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .clickLaunchIcon('filePanel')
      .click('li[data-id="treeViewLitreeViewItemREADME.txt"')
      .addFile('remappings.txt', sources[10]['remappings.txt'])
      .addFile('Untitled11.sol', sources[10]['Untitled11.sol'])
      .clickLaunchIcon('solidity')
      .click('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .verifyContracts(['Address', 'Strings'], { wait: 30000 })
  },

  'Test NPM Import (the version is specified in package.json) #group4': function (browser: NightwatchBrowser) {
    browser
      // clone https://github.com/yann300/remix-reward
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('[data-id="github-dropdown-toggle"]')
      .click('[data-id="github-dropdown-toggle"]')
      .waitForElementVisible('[data-id="github-dropdown-item-clone"]')
      .click('[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('[data-id="topbarModalModalDialogModalBody-react"]')
      .click('[data-id="topbarModalModalDialogModalBody-react"]')
      .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
      .setValue('[data-id="modalDialogCustomPromptTextClone"]', 'https://github.com/remix-project-org/remix-reward')
      .click('[data-id="topbarModal-modal-footer-ok-react"]')
      .waitForElementPresent('.fa-spinner')
      .waitForElementNotPresent('.fa-spinner', 120000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.git"]')
      .waitForElementContainsText('[data-id="workspacesSelect"]', 'remix-reward')
      .clickLaunchIcon('solidity')
      // compile (this will be using the version specified in the package.json)
      .openFile('contracts')
      .openFile('contracts/RemixRewardUpgradable.sol')
      .verifyContracts(['Remix'])
  }
}

const sources = [
  {
    'Untitled.sol': { content: 'contract test1 {} contract test2 {}' }
  },
  {
    'Untitled1.sol': { content: 'import "/Untitled2.sol"; contract test6 {}' },
    'Untitled2.sol': { content: 'contract test4 {} contract test5 {}' }
  },
  {
    'Untitled3.sol': { content: 'import "/Untitled11.sol"; contract test6 {}' }
  },
  {
    'Untitled4.sol': { content: 'import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol"; contract test7 {}' }
  },
  {
    'Untitled5.sol': { content: 'import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v2.3.0/contracts/token/ERC20/ERC20.sol"; contract test8 {}' }
  },
  {
    'Untitled6.sol': { content: 'import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol"; contract test10 {}' }
  },
  {
    'Untitled7.sol': { content: 'import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/contracts/token/ERC20/ERC20.sol"; contract test11 {}' }
  },
  {
    'Untitled8.sol': { content: 'import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/contracts/token/ERC20/ERC20.sol"; contract test12 {}' }
  },
  {
    'Untitled9.sol': { content: 'pragma solidity ^0.8.0; import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; contract test13 {}' }
  },
  {
    'Untitled10.sol': { content: 'pragma solidity ^0.8.0; import "@module_remapping/token/ERC20/ERC20.sol"; contract test15 {}' },
    'package.json': { content: `{
    "dependencies": {
      "@module_remapping": "npm:@openzeppelin/contracts@^4.9.0"
  }
}` }
  },
  {
    'Untitled11.sol': { content: `import "@openzeppelin/contracts@5.0.2/utils/Strings.sol";
import "@openzeppelin/contracts@4.7.3/utils/Address.sol";` },
    'remappings.txt': { content: `@openzeppelin/contracts@4.7.3/=npm:@openzeppelin/contracts@4.7.3/
@openzeppelin/contracts@4.8.3/=npm:@openzeppelin/contracts@4.8.3/
@openzeppelin/contracts@4.9.6/=npm:@openzeppelin/contracts@4.9.6/
@openzeppelin/contracts@5.0.2/=npm:@openzeppelin/contracts@5.0.2/
@openzeppelin/contracts@5.1.0/=npm:@openzeppelin/contracts@5.1.0/
` }
  }
]
