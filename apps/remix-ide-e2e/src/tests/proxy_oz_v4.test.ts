'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

let firstProxyAddress: string
let lastProxyAddress: string
let shortenedFirstAddress: string
let shortenedLastAddress: string
module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },

  'Should set the compiler version to 8.19': function(browser: NightwatchBrowser) {
    browser.setSolidityCompilerVersion('soljson-v0.8.19+commit.7dd6d404.js')
  },

  'Should show deploy proxy option for UUPS upgradeable contract #group1': function (browser: NightwatchBrowser) {
    browser
      .addFile('myTokenV1.sol', sources[0]['myTokenV1.sol'])
      .clickLaunchIcon('solidity')
      .pause(2000)
      // because the compilatiom imports are slow and sometimes stop loading (not sure why, it's bug) we need to recompile and check to see if the files are really in de FS
      .click('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .clickLaunchIcon('solidity')
      .waitForElementPresent('select[id="compiledContracts"] option[value=MyToken]', 60000)
      .clickLaunchIcon('udapp')
      .click('select.udapp_contractNames')
      .click('select.udapp_contractNames option[value=MyToken]')
      .waitForElementPresent('[data-id="contractGUIDeployWithProxyLabel"]')
      .waitForElementPresent('[data-id="contractGUIUpgradeImplementationLabel"]')
  },

  'Should show upgrade proxy option for child contract inheriting UUPS parent contract #group1': function (browser: NightwatchBrowser) {
    browser
      .addFile('myTokenV2.sol', sources[1]['myTokenV2.sol'])
      .clickLaunchIcon('solidity')
      .assert.visible('[data-id="compilerContainerCompileBtn"]')
      .click('[data-id="compilerContainerCompileBtn"]')
      .waitForElementPresent('select[id="compiledContracts"] option[value=MyTokenV2]', 60000)
      .clickLaunchIcon('udapp')
      .click('select.udapp_contractNames')
      .click('select.udapp_contractNames option[value=MyTokenV2]')
      .waitForElementPresent('[data-id="contractGUIDeployWithProxyLabel"]')
      .waitForElementPresent('[data-id="contractGUIUpgradeImplementationLabel"]')
  },

  'Should deploy proxy without initialize parameters #group1': function (browser: NightwatchBrowser) {
    browser
      .openFile('myTokenV1.sol')
      .clickLaunchIcon('solidity')
      .assert.visible('[data-id="compilerContainerCompileBtn"]')
      .click('[data-id="compilerContainerCompileBtn"]')
      .waitForElementPresent('select[id="compiledContracts"] option[value=MyToken]', 60000)
      .clickLaunchIcon('udapp')
      .click('select.udapp_contractNames')
      .click('select.udapp_contractNames option[value=MyToken]')
      .verify.visible('[data-id="contractGUIDeployWithProxyLabel"]')
      .waitForElementPresent('[data-id="contractGUIDeployWithProxyLabel"]')
      .click('[data-id="contractGUIDeployWithProxyLabel"]')
      .createContract('')
      .waitForElementContainsText('[data-id="udappNotifyModalDialogModalTitle-react"]', 'Deploy Implementation & Proxy (ERC1967)')
      .waitForElementVisible('[data-id="udappNotify-modal-footer-ok-react"]')
      .click('[data-id="udappNotify-modal-footer-ok-react"]')
      .waitForElementContainsText('[data-id="confirmProxyDeploymentModalDialogModalTitle-react"]', 'Confirm Deploy Proxy (ERC1967)')
      .waitForElementVisible('[data-id="confirmProxyDeployment-modal-footer-ok-react"]')
      .click('[data-id="confirmProxyDeployment-modal-footer-ok-react"]')
      .waitForElementPresent('[data-id="universalDappUiTitleExpander0"]')
      .waitForElementPresent('[data-id="universalDappUiTitleExpander1"]')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Deploying ERC1967 < 5.0.0 as proxy...', 60000)
  },

  'Should interact with deployed contract via ERC1967 (proxy) #group1': function (browser: NightwatchBrowser) {
    browser
      .getAddressAtPosition(1, (address) => {
        firstProxyAddress = address
        shortenedFirstAddress = address.slice(0, 5) + '...' + address.slice(address.length - 5, address.length)
      })
      .clickInstance(1)
      .perform((done) => {
        browser.testConstantFunction(firstProxyAddress, 'name - call', null, '0:\nstring: MyToken').perform(() => {
          done()
        })
      })
      .perform((done) => {
        browser.testConstantFunction(firstProxyAddress, 'symbol - call', null, '0:\nstring: MTK').perform(() => {
          done()
        })
      })
  },

  'Should deploy proxy with initialize parameters #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('[data-id="deployAndRunClearInstances"]')
      .click('[data-id="deployAndRunClearInstances"]')
      .addFile('initializeProxy.sol', sources[2]['initializeProxy.sol'])
      .clickLaunchIcon('solidity')
      .assert.visible('[data-id="compilerContainerCompileBtn"]')
      .click('[data-id="compilerContainerCompileBtn"]')
      .waitForElementPresent('select[id="compiledContracts"] option[value=MyInitializedToken]', 60000)
      .clickLaunchIcon('udapp')
      .click('select.udapp_contractNames')
      .click('select.udapp_contractNames option[value=MyInitializedToken]')
      .waitForElementPresent('[data-id="contractGUIDeployWithProxyLabel"]')
      .click('[data-id="contractGUIDeployWithProxyLabel"]')
      .useXpath()
      .waitForElementPresent('//*[@id="runTabView"]/div/div[2]/div[3]/div[1]/div/div[1]/div[4]/div/div[1]/input')
      .waitForElementPresent('//*[@id="runTabView"]/div/div[2]/div[3]/div[1]/div/div[1]/div[4]/div/div[2]/input')
      .setValue('//*[@id="runTabView"]/div/div[2]/div[3]/div[1]/div/div[1]/div[4]/div/div[1]/input', 'Remix')
      .setValue('//*[@id="runTabView"]/div/div[2]/div[3]/div[1]/div/div[1]/div[4]/div/div[2]/input', "R")
      .useCss()
      .createContract('')
      .waitForElementContainsText('[data-id="udappNotifyModalDialogModalTitle-react"]', 'Deploy Implementation & Proxy (ERC1967)')
      .waitForElementVisible('[data-id="udappNotify-modal-footer-ok-react"]')
      .click('[data-id="udappNotify-modal-footer-ok-react"]')
      .waitForElementContainsText('[data-id="confirmProxyDeploymentModalDialogModalTitle-react"]', 'Confirm Deploy Proxy (ERC1967)')
      .waitForElementVisible('[data-id="confirmProxyDeployment-modal-footer-ok-react"]')
      .click('[data-id="confirmProxyDeployment-modal-footer-ok-react"]')
      .waitForElementPresent('[data-id="universalDappUiTitleExpander0"]')
      .waitForElementPresent('[data-id="universalDappUiTitleExpander1"]')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Deploying ERC1967 < 5.0.0 as proxy...', 60000)
  },

  'Should interact with initialized contract to verify parameters #group1': function (browser: NightwatchBrowser) {
    browser
      .getAddressAtPosition(1, (address) => {
        lastProxyAddress = address
        shortenedLastAddress = address.slice(0, 5) + '...' + address.slice(address.length - 5, address.length)
      })
      .clickInstance(1)
      .perform((done) => {
        browser.testConstantFunction(lastProxyAddress, 'name - call', null, '0:\nstring: Remix').perform(() => {
          done()
        })
      })
      .perform((done) => {
        browser.testConstantFunction(lastProxyAddress, 'symbol - call', null, '0:\nstring: R').perform(() => {
          done()
        })
      })
  },

  'Should upgrade contract by selecting a previously deployed proxy address from dropdown (MyTokenV1 to MyTokenV2) #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="terminalClearConsole"]') 
      .waitForElementPresent('[data-id="deployAndRunClearInstances"]')
      .click('[data-id="deployAndRunClearInstances"]')
      .openFile('myTokenV2.sol')
      .clickLaunchIcon('solidity')
      .assert.visible('[data-id="compilerContainerCompileBtn"]')
      .click('[data-id="compilerContainerCompileBtn"]')
      .waitForElementPresent('select[id="compiledContracts"] option[value=MyTokenV2]', 60000)
      .clickLaunchIcon('udapp')
      .click('select.udapp_contractNames')
      .click('select.udapp_contractNames option[value=MyTokenV2]')
      .waitForElementPresent('[data-id="contractGUIUpgradeImplementationLabel"]')
      .click('[data-id="contractGUIUpgradeImplementationLabel"]')
      .waitForElementPresent('[data-id="toggleProxyAddressDropdown"]')
      .click('[data-id="toggleProxyAddressDropdown"]')
      .waitForElementVisible('[data-id="proxy-dropdown-items"]')
      .assert.textContains('[data-id="proxy-dropdown-items"]', shortenedFirstAddress)
      .assert.textContains('[data-id="proxy-dropdown-items"]', shortenedLastAddress)
      .click('[data-id="proxyAddress1"]')
      .createContract('')
      .waitForElementContainsText('[data-id="udappNotifyModalDialogModalTitle-react"]', 'Deploy Implementation & Update Proxy')
      .waitForElementVisible('[data-id="udappNotify-modal-footer-ok-react"]')
      .click('[data-id="udappNotify-modal-footer-ok-react"]')
      .waitForElementContainsText('[data-id="confirmProxyDeploymentModalDialogModalTitle-react"]', 'Confirm Update Proxy (ERC1967)')
      .waitForElementVisible('[data-id="confirmProxyDeployment-modal-footer-ok-react"]')
      .click(
        {
          selector: '[data-id="confirmProxyDeployment-modal-footer-ok-react"]',
        })
      .waitForElementPresent('[data-id="universalDappUiTitleExpander0"]')
      .waitForElementPresent('[data-id="universalDappUiTitleExpander1"]')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Using ERC1967 < 5.0.0 for the proxy upgrade..', 60000)
  },

  'Should interact with upgraded function in contract MyTokenV2 #group1': function (browser: NightwatchBrowser) {
    browser
      .clickInstance(1)
      .perform((done) => {
        browser.testConstantFunction(lastProxyAddress, 'version - call', null, '0:\nstring: MyTokenV2!').perform(() => {
          done()
        })
      })
  },

  'Should upgrade contract by providing proxy address in input field (MyTokenV1 to MyTokenV2) #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="terminalClearConsole"]') 
      .waitForElementPresent('[data-id="deployAndRunClearInstances"]')
      .click('[data-id="deployAndRunClearInstances"]')
      .openFile('myTokenV2.sol')
      .clickLaunchIcon('solidity')
      .assert.visible('[data-id="compilerContainerCompileBtn"]')
      .click('[data-id="compilerContainerCompileBtn"]')
      .waitForElementPresent('select[id="compiledContracts"] option[value=MyTokenV2]', 60000)
      .clickLaunchIcon('udapp')
      .click('select.udapp_contractNames')
      .click('select.udapp_contractNames option[value=MyTokenV2]')
      .waitForElementPresent('[data-id="contractGUIUpgradeImplementationLabel"]')
      .waitForElementPresent('[data-id="toggleProxyAddressDropdown"]')
      .clearValue('[data-id="ERC1967AddressInput"]')
      .setValue('[data-id="ERC1967AddressInput"]', firstProxyAddress)
      .createContract('')
      .waitForElementContainsText('[data-id="udappNotifyModalDialogModalTitle-react"]', 'Deploy Implementation & Update Proxy')
      .waitForElementVisible('[data-id="udappNotify-modal-footer-ok-react"]')
      .click('[data-id="udappNotify-modal-footer-ok-react"]')
      .waitForElementContainsText('[data-id="confirmProxyDeploymentModalDialogModalTitle-react"]', 'Confirm Update Proxy (ERC1967)')
      .waitForElementVisible('[data-id="confirmProxyDeployment-modal-footer-ok-react"]')
      .click('[data-id="confirmProxyDeployment-modal-footer-ok-react"]')
      .waitForElementPresent('[data-id="universalDappUiTitleExpander0"]')
      .waitForElementPresent('[data-id="universalDappUiTitleExpander1"]')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Using ERC1967 < 5.0.0 for the proxy upgrade..', 60000)
  },

  'Should interact with upgraded contract through provided proxy address #group1': function (browser: NightwatchBrowser) {
    browser
      .clearConsole()
      .clickInstance(1)
      .perform((done) => {
        browser.testConstantFunction(firstProxyAddress, 'version - call', null, '0:\nstring: MyTokenV2!').perform(() => {
          done()
        })
      })
  },
  'Should debug the call': function(browser: NightwatchBrowser) {
    browser
    .debugTransaction(0)
    .waitForElementVisible({
      locateStrategy: 'xpath',
      selector: '//*[@data-id="treeViewLivm trace step" and contains(.,"10")]',
      timeout: 60000
    })
    /* TODO test the nested calls component here
    .goToVMTraceStep(146)
    .waitForElementContainsText('*[data-id="functionPanel"]', 'version()', 60000)
    */
    .end()
  }
}


const sources = [
  {
    'myTokenV1.sol': {
      content: `
      // SPDX-License-Identifier: MIT
      pragma solidity ^0.8.4;
      
      import "@openzeppelin/contracts-upgradeable@4.8.3/token/ERC721/ERC721Upgradeable.sol";
      import "@openzeppelin/contracts-upgradeable@4.8.3/access/OwnableUpgradeable.sol";
      import "@openzeppelin/contracts-upgradeable@4.8.3/proxy/utils/Initializable.sol";
      import "@openzeppelin/contracts-upgradeable@4.8.3/proxy/utils/UUPSUpgradeable.sol";
      
      contract MyToken is Initializable, ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
          /// @custom:oz-upgrades-unsafe-allow constructor
          constructor() {
              _disableInitializers();
          }
      
          function initialize() initializer public {
              __ERC721_init("MyToken", "MTK");
              __Ownable_init();
              __UUPSUpgradeable_init();
          }
      
          function _authorizeUpgrade(address newImplementation)
              internal
              onlyOwner
              override
          {}
      }
        `
    }
  }, {
    'myTokenV2.sol': {
      content: `
      import "./myTokenV1.sol";

      contract MyTokenV2 is MyToken {
        function version () public view returns (string memory) {
            return "MyTokenV2!";
        }
    }
      `
    }
  }, {
    'initializeProxy.sol': {
      content: `
      // SPDX-License-Identifier: MIT
      pragma solidity ^0.8.4;
      
      import "@openzeppelin/contracts-upgradeable@4.8.3/token/ERC721/ERC721Upgradeable.sol";
      import "@openzeppelin/contracts-upgradeable@4.8.3/access/OwnableUpgradeable.sol";
      import "@openzeppelin/contracts-upgradeable@4.8.3/proxy/utils/Initializable.sol";
      import "@openzeppelin/contracts-upgradeable@4.8.3/proxy/utils/UUPSUpgradeable.sol";
      
      contract MyInitializedToken is Initializable, ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
          /// @custom:oz-upgrades-unsafe-allow constructor
          constructor() {
              _disableInitializers();
          }
      
          function initialize(string memory tokenName, string memory tokenSymbol) initializer public {
              __ERC721_init(tokenName, tokenSymbol);
              __Ownable_init();
              __UUPSUpgradeable_init();
          }
      
          function _authorizeUpgrade(address newImplementation)
              internal
              onlyOwner
              override
          {}
      }
        `
    }
  }
]