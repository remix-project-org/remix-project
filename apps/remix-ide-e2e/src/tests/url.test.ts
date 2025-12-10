'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import examples from '../examples/example-contracts'

const sources = [
  { 'Untitled.sol': { content: examples.ballot.content } },
  {
    'myTokenV1.sol': {
      content: `
      // SPDX-License-Identifier: MIT
      pragma solidity ^0.8.20;

      import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
      import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
      import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
      import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

      contract MyToken is Initializable, ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
          /// @custom:oz-upgrades-unsafe-allow constructor
          constructor() {
              _disableInitializers();
          }

          function initialize(address initialOwner) initializer public {
              __ERC721_init("MyToken", "MTK");
              __Ownable_init(initialOwner);
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

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080/#optimize=true&runs=300&evmVersion=istanbul&version=soljson-v0.7.4+commit.3f05b770.js', true)
  },

  '@sources': function () {
    return sources
  },
  'Disable auto compile': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('[for="autoCompile"]')
      .click('[for="autoCompile"]') // we set it too false in the local storage
  },
  'Should load the code from URL params (code param) #group1': function (browser: NightwatchBrowser) {
    browser

      .url('http://127.0.0.1:8080/#autoCompile=true&optimize=true&runs=300&code=cHJhZ21hIHNvbGlkaXR5ID49MC42LjAgPDAuNy4wOwoKaW1wb3J0ICJodHRwczovL2dpdGh1Yi5jb20vT3BlblplcHBlbGluL29wZW56ZXBwZWxpbi1jb250cmFjdHMvYmxvYi9tYXN0ZXIvY29udHJhY3RzL2FjY2Vzcy9Pd25hYmxlLnNvbCI7Cgpjb250cmFjdCBHZXRQYWlkIGlzIE93bmFibGUgewogIGZ1bmN0aW9uIHdpdGhkcmF3KCkgZXh0ZXJuYWwgb25seU93bmVyIHsKICB9Cn0')
      .refreshPage() // we do one reload for making sure we already have the default workspace

      .verify.elementPresent('[data-id="compilerContainerAutoCompile"]:checked')
      .click('[for="autoCompile"]') // we set it too false again
      .click('[for="autoCompile"]') // back to True in the local storage
      .assert.containsText('*[data-id="compilerContainerCompileBtn"]', 'contract-76747f6e19.sol')
      .clickLaunchIcon('filePanel')
      .currentWorkspaceIs('code-sample')
      .getEditorValue((content) => {
        browser.assert.ok(content && content.indexOf(
          'https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol') !== -1,
        'code has not been loaded')
      })
  },

  'Should load the code from URL params (url param) #group1': function (browser: NightwatchBrowser) {
    browser

      .url('http://127.0.0.1:8080/#optimize=true&runs=300&url=https://github.com/ethereum/remix-project/blob/master/apps/remix-ide/contracts/app/solidity/mode.sol')
      .refreshPage() // we do one reload for making sure we already have the default workspace
      .waitForElementVisible({
        selector: `//li[@data-id="treeViewLitreeViewItemethereum/remix-project/apps/remix-ide/contracts/app/solidity/mode.sol"]`,
        locateStrategy: 'xpath'
      })
      .currentWorkspaceIs('code-sample')
      .getEditorValue((content) => {
        browser.assert.ok(content && content.indexOf(
          'proposals.length = _numProposals;') !== -1,
        'url has not been loaded')
      })
  },

  'Should load Etherscan verified contracts from URL "address" param) #group1': function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/#address=0xdac17f958d2ee523a2206206994597c13d831ec7')
      .refreshPage()
      .pause(2000)
      .currentWorkspaceIs('code-sample')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemTetherToken.sol"]')
      .click('*[data-id="treeViewLitreeViewItemTetherToken.sol"]')
      .getEditorValue((content) => {
        browser.assert.ok(content && content.indexOf(
          'contract TetherToken is Pausable, StandardToken, BlackList {') !== -1)

      })
  },

  'Should load Blockscout verified contracts from URL "address" and "blockscout" params (single source)': ''+function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/#address=0xdAC17F958D2ee523a2206206994597C13D831ec7&blockscout=eth.blockscout.com')
      .refreshPage()
      .pause(7000)
      .currentWorkspaceIs('code-sample')
      .assert.elementPresent('*[data-id="treeViewLitreeViewItemTetherToken.sol"]')
      .getEditorValue((content) => {
        browser.assert.ok(content && content.indexOf(
          'contract TetherToken is Pausable, StandardToken, BlackList {') !== -1)

      })
  },
  //Disabled due to failure from blockscout api
  'Should load Blockscout verified contracts from URL "address" and "blockscout" params (multiple sources)': '' + function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/#address=0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9&blockscout=eth.blockscout.com')
      .refreshPage()
      .pause(7000)
      .currentWorkspaceIs('code-sample')
      .assert.elementPresent('*[data-id="treeViewLitreeViewItemcontracts"]')
      .assert.elementPresent('*[data-id="treeViewLitreeViewItemcontracts/open-zeppelin"]')
      .assert.elementPresent('*[data-id="treeViewLitreeViewItemcontracts/open-zeppelin/Address.sol"]')
      .assert.elementPresent('*[data-id="treeViewLitreeViewItemcontracts/open-zeppelin/BaseAdminUpgradeabilityProxy.sol"]')
      .assert.elementPresent('*[data-id="treeViewLitreeViewItemcontracts/open-zeppelin/BaseUpgradeabilityProxy.sol"]')
      .assert.elementPresent('*[data-id="treeViewLitreeViewItemcontracts/open-zeppelin/InitializableAdminUpgradeabilityProxy.sol"]')
      .assert.elementPresent('*[data-id="treeViewLitreeViewItemcontracts/open-zeppelin/InitializableUpgradeabilityProxy.sol"]')
      .assert.elementPresent('*[data-id="treeViewLitreeViewItemcontracts/open-zeppelin/Proxy.sol"]')
      .assert.elementPresent('*[data-id="treeViewLitreeViewItemcontracts/open-zeppelin/UpgradeabilityProxy.sol"]')
      .openFile('open-zeppelin/InitializableAdminUpgradeabilityProxy.sol')
      .getEditorValue((content) => {
        browser.assert.ok(content && content.indexOf(
          'contract InitializableAdminUpgradeabilityProxy is BaseAdminUpgradeabilityProxy, InitializableUpgradeabilityProxy {') !== -1)
      })

  },

  'Should load the code from URL & code params #group1': function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/#optimize=true&runs=300&url=https://github.com/ethereum/remix-project/blob/master/apps/remix-ide/contracts/app/solidity/mode.sol&code=cHJhZ21hIHNvbGlkaXR5ID49MC42LjAgPDAuNy4wOwoKaW1wb3J0ICJodHRwczovL2dpdGh1Yi5jb20vT3BlblplcHBlbGluL29wZW56ZXBwZWxpbi1jb250cmFjdHMvYmxvYi9tYXN0ZXIvY29udHJhY3RzL2FjY2Vzcy9Pd25hYmxlLnNvbCI7Cgpjb250cmFjdCBHZXRQYWlkIGlzIE93bmFibGUgewogIGZ1bmN0aW9uIHdpdGhkcmF3KCkgZXh0ZXJuYWwgb25seU93bmVyIHsKICB9Cn0')
      .refreshPage() // we do one reload for making sure we already have the default workspace

      .waitForElementVisible('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .waitForElementVisible({
        selector: `//li[@data-id="treeViewLitreeViewItemethereum/remix-project/apps/remix-ide/contracts/app/solidity/mode.sol"]`,
        locateStrategy: 'xpath'
      })
      .currentWorkspaceIs('code-sample')
      .getEditorValue((content) => {
        browser.assert.ok(content && content.indexOf(
          'proposals.length = _numProposals;') !== -1,
        'code has been loaded')
      })
      .url('http://127.0.0.1:8080') // refresh without loading the code sample
      .pause(2000)
      .currentWorkspaceIs('default_workspace')
      .execute(() => {
        return document.querySelector('[data-id="dropdown-item-code-sample"]') === null
      }, [], (result) => {
        browser.assert.ok((result as any).value, 'sample template has not be persisted.') // code-sample should not be kept.
      })
  },

  'Should load the code from URL & code params with special character #group1': function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/#code=Ly8gU1BEWC1MaWNlbnNlLUlkZW50aWZpZXI6IE1JVAovLyBDb21wYXRpYmxlIHdpdGggT3BlblplcHBlbGluIENvbnRyYWN0cyBeNS4wLjAKcHJhZ21hIHNvbGlkaXR5IF4wLjguMjc7CgppbXBvcnQge0VSQzIwfSBmcm9tICJAb3BlbnplcHBlbGluL2NvbnRyYWN0c0A1LjMuMC90b2tlbi9FUkMyMC9FUkMyMC5zb2wiOwppbXBvcnQge0VSQzIwUGVybWl0fSBmcm9tICJAb3BlbnplcHBlbGluL2NvbnRyYWN0c0A1LjMuMC90b2tlbi9FUkMyMC9leHRlbnNpb25zL0VSQzIwUGVybWl0LnNvbCI7Cgpjb250cmFjdCBDTXlUb2tlbiBpcyBFUkMyMCwgRVJDMjBQZXJtaXQgewogICAgY29uc3RydWN0b3IoKQogICAgICAgIEVSQzIwKHVuaWNvZGUi4biJTXlUb2tlbvCfjLsiLCAiTVRLIikKICAgICAgICBFUkMyMFBlcm1pdCh1bmljb2RlIuG4iU15VG9rZW7wn4y7IikKICAgIHt9Cn0K&lang=en&optimize=false&runs=200&evmVersion=null&version=soljson-v0.8.30+commit.73712a01.js')
      .refreshPage() // we do one reload for making sure we already have the default workspace

      .waitForElementVisible('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .waitForElementVisible({
        selector: `//li[@data-id="treeViewLitreeViewItemcontract-89b91e9381.sol"]`,
        locateStrategy: 'xpath'
      })
      .currentWorkspaceIs('code-sample')
      .waitForElementVisible({
        selector: '//*[@id="editorView"]',
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content && content.indexOf(
          '"ḉMyToken🌻"') !== -1,
        'code has been loaded')
      })
      .url('http://127.0.0.1:8080') // refresh without loading the code sample
      .pause(2000)
      .currentWorkspaceIs('default_workspace')
      .execute(() => {
        return document.querySelector('[data-id="dropdown-item-code-sample"]') === null
      }, [], (result) => {
        browser.assert.ok((result as any).value, 'sample template has not be persisted.') // code-sample should not be kept.
      })
  },

  'Should load the code from URL & code params with ASCII punctuation and special character #group1': function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/?#code=Ly8gU1BEWC1MaWNlbnNlLUlkZW50aWZpZXI6IE1JVAovLyBDb21wYXRpYmxlIHdpdGggT3BlblplcHBlbGluIENvbnRyYWN0cyBeNS40LjAKcHJhZ21hIHNvbGlkaXR5IF4wLjguMjc7CgppbXBvcnQge0Fic3RyYWN0U2lnbmVyfSBmcm9tICJAb3BlbnplcHBlbGluL2NvbnRyYWN0c0A1LjQuMC91dGlscy9jcnlwdG9ncmFwaHkvc2lnbmVycy9BYnN0cmFjdFNpZ25lci5zb2wiOwppbXBvcnQge0FjY291bnR9IGZyb20gIkBvcGVuemVwcGVsaW4vY29udHJhY3RzQDUuNC4wL2FjY291bnQvQWNjb3VudC5zb2wiOwppbXBvcnQge0FjY291bnRFUkM3NTc5fSBmcm9tICJAb3BlbnplcHBlbGluL2NvbnRyYWN0c0A1LjQuMC9hY2NvdW50L2V4dGVuc2lvbnMvZHJhZnQtQWNjb3VudEVSQzc1Nzkuc29sIjsKaW1wb3J0IHtFSVA3MTJ9IGZyb20gIkBvcGVuemVwcGVsaW4vY29udHJhY3RzQDUuNC4wL3V0aWxzL2NyeXB0b2dyYXBoeS9FSVA3MTIuc29sIjsKaW1wb3J0IHtFUkMxMTU1SG9sZGVyfSBmcm9tICJAb3BlbnplcHBlbGluL2NvbnRyYWN0c0A1LjQuMC90b2tlbi9FUkMxMTU1L3V0aWxzL0VSQzExNTVIb2xkZXIuc29sIjsKaW1wb3J0IHtFUkM3MjFIb2xkZXJ9IGZyb20gIkBvcGVuemVwcGVsaW4vY29udHJhY3RzQDUuNC4wL3Rva2VuL0VSQzcyMS91dGlscy9FUkM3MjFIb2xkZXIuc29sIjsKaW1wb3J0IHtFUkM3NzM5fSBmcm9tICJAb3BlbnplcHBlbGluL2NvbnRyYWN0c0A1LjQuMC91dGlscy9jcnlwdG9ncmFwaHkvc2lnbmVycy9kcmFmdC1FUkM3NzM5LnNvbCI7CmltcG9ydCB7UGFja2VkVXNlck9wZXJhdGlvbn0gZnJvbSAiQG9wZW56ZXBwZWxpbi9jb250cmFjdHNANS40LjAvaW50ZXJmYWNlcy9kcmFmdC1JRVJDNDMzNy5zb2wiOwppbXBvcnQge1NpZ25lckVDRFNBfSBmcm9tICJAb3BlbnplcHBlbGluL2NvbnRyYWN0c0A1LjQuMC91dGlscy9jcnlwdG9ncmFwaHkvc2lnbmVycy9TaWduZXJFQ0RTQS5zb2wiOwoKY29udHJhY3QgTXlBY2NvdW50IGlzIEFjY291bnQsIEVJUDcxMiwgRVJDNzczOSwgQWNjb3VudEVSQzc1NzksIFNpZ25lckVDRFNBLCBFUkM3MjFIb2xkZXIsIEVSQzExNTVIb2xkZXIgewogICAgY29uc3RydWN0b3IoYWRkcmVzcyBzaWduZXIpCiAgICAgICAgRUlQNzEyKHVuaWNvZGUiTXlBY2NvdW508J%2BMviIsICIxIikKICAgICAgICBTaWduZXJFQ0RTQShzaWduZXIpCiAgICB7fQoKICAgIGZ1bmN0aW9uIGlzVmFsaWRTaWduYXR1cmUoYnl0ZXMzMiBoYXNoLCBieXRlcyBjYWxsZGF0YSBzaWduYXR1cmUpCiAgICAgICAgcHVibGljCiAgICAgICAgdmlldwogICAgICAgIG92ZXJyaWRlKEFjY291bnRFUkM3NTc5LCBFUkM3NzM5KQogICAgICAgIHJldHVybnMgKGJ5dGVzNCkKICAgIHsKICAgICAgICAvLyBFUkMtNzczOSBjYW4gcmV0dXJuIHRoZSBFUkMtMTI3MSBtYWdpYyB2YWx1ZSwgMHhmZmZmZmZmZiAoaW52YWxpZCkgb3IgMHg3NzM5MDAwMSAoZGV0ZWN0aW9uKS4KICAgICAgICAvLyBJZiB0aGUgcmV0dXJuZWQgdmFsdWUgaXMgMHhmZmZmZmZmZiwgZmFsbGJhY2sgdG8gRVJDLTc1NzkgdmFsaWRhdGlvbi4KICAgICAgICBieXRlczQgZXJjNzczOW1hZ2ljID0gRVJDNzczOS5pc1ZhbGlkU2lnbmF0dXJlKGhhc2gsIHNpZ25hdHVyZSk7CiAgICAgICAgcmV0dXJuIGVyYzc3MzltYWdpYyA9PSBieXRlczQoMHhmZmZmZmZmZikgPyBBY2NvdW50RVJDNzU3OS5pc1ZhbGlkU2lnbmF0dXJlKGhhc2gsIHNpZ25hdHVyZSkgOiBlcmM3NzM5bWFnaWM7CiAgICB9CgogICAgLy8gVGhlIGZvbGxvd2luZyBmdW5jdGlvbnMgYXJlIG92ZXJyaWRlcyByZXF1aXJlZCBieSBTb2xpZGl0eS4KCiAgICBmdW5jdGlvbiBfdmFsaWRhdGVVc2VyT3AoUGFja2VkVXNlck9wZXJhdGlvbiBjYWxsZGF0YSB1c2VyT3AsIGJ5dGVzMzIgdXNlck9wSGFzaCkKICAgICAgICBpbnRlcm5hbAogICAgICAgIG92ZXJyaWRlKEFjY291bnQsIEFjY291bnRFUkM3NTc5KQogICAgICAgIHJldHVybnMgKHVpbnQyNTYpCiAgICB7CiAgICAgICAgcmV0dXJuIHN1cGVyLl92YWxpZGF0ZVVzZXJPcCh1c2VyT3AsIHVzZXJPcEhhc2gpOwogICAgfQoKICAgIC8vIElNUE9SVEFOVDogTWFrZSBzdXJlIFNpZ25lckVDRFNBIGlzIG1vc3QgZGVyaXZlZCB0aGFuIEFjY291bnRFUkM3NTc5CiAgICAvLyBpbiB0aGUgaW5oZXJpdGFuY2UgY2hhaW4gKGkuZS4gY29udHJhY3QgLi4uIGlzIEFjY291bnRFUkM3NTc5LCAuLi4sIFNpZ25lckVDRFNBKQogICAgLy8gdG8gZW5zdXJlIHRoZSBjb3JyZWN0IG9yZGVyIG9mIGZ1bmN0aW9uIHJlc29sdXRpb24uCiAgICAvLyBBY2NvdW50RVJDNzU3OSByZXR1cm5zIGZhbHNlIGZvciBfcmF3U2lnbmF0dXJlVmFsaWRhdGlvbgogICAgZnVuY3Rpb24gX3Jhd1NpZ25hdHVyZVZhbGlkYXRpb24oYnl0ZXMzMiBoYXNoLCBieXRlcyBjYWxsZGF0YSBzaWduYXR1cmUpCiAgICAgICAgaW50ZXJuYWwKICAgICAgICB2aWV3CiAgICAgICAgb3ZlcnJpZGUoU2lnbmVyRUNEU0EsIEFic3RyYWN0U2lnbmVyLCBBY2NvdW50RVJDNzU3OSkKICAgICAgICByZXR1cm5zIChib29sKQogICAgewogICAgICAgIHJldHVybiBzdXBlci5fcmF3U2lnbmF0dXJlVmFsaWRhdGlvbihoYXNoLCBzaWduYXR1cmUpOwogICAgfQp9Cg&lang=en&optimize=false&runs=200&evmVersion=null')
      .refreshPage() // we do one reload for making sure we already have the default workspace

      .waitForElementVisible('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .waitForElementVisible({
        selector: `//li[@data-id="treeViewLitreeViewItemcontract-e0bf950259.sol"]`,
        locateStrategy: 'xpath'
      })
      .currentWorkspaceIs('code-sample')
      .waitForElementVisible({
        selector: '//*[@id="editorView"]',
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content && content.indexOf(
          '"MyAccount🌾"') !== -1,
        'code has been loaded')
      })
      .getEditorValue((content) => {
        browser.assert.ok(content && content.indexOf(
          'return erc7739magic == bytes4(0xffffffff) ? AccountERC7579.isValidSignature(hash, signature) : erc7739magic;') !== -1,
        'Account code has been loaded')
      })
      .url('http://127.0.0.1:8080') // refresh without loading the code sample
      .pause(2000)
      .currentWorkspaceIs('default_workspace')
      .execute(() => {
        return document.querySelector('[data-id="dropdown-item-code-sample"]') === null
      }, [], (result) => {
        browser.assert.ok((result as any).value, 'sample template has not be persisted.') // code-sample should not be kept.
      })
  },

  'Should load the code from language & code params #group1': function (browser: NightwatchBrowser) {
    browser

      .url('http://127.0.0.1:8080/#language=yul&code=Ly8gQSBjb250cmFjdCBjb25zaXN0cyBvZiBhIHNpbmdsZSBvYmplY3Qgd2l0aCBzdWItb2JqZWN0cyByZXByZXNlbnRpbmcKLy8gdGhlIGNvZGUgdG8gYmUgZGVwbG95ZWQgb3Igb3RoZXIgY29udHJhY3RzIGl0IGNhbiBjcmVhdGUuCi8vIFRoZSBzaW5nbGUgImNvZGUiIG5vZGUgaXMgdGhlIGV4ZWN1dGFibGUgY29kZSBvZiB0aGUgb2JqZWN0LgovLyBFdmVyeSAob3RoZXIpIG5hbWVkIG9iamVjdCBvciBkYXRhIHNlY3Rpb24gaXMgc2VyaWFsaXplZCBhbmQKLy8gbWFkZSBhY2Nlc3NpYmxlIHRvIHRoZSBzcGVjaWFsIGJ1aWx0LWluIGZ1bmN0aW9ucyBkYXRhY29weSAvIGRhdGFvZmZzZXQgLyBkYXRhc2l6ZQovLyBUaGUgY3VycmVudCBvYmplY3QsIHN1Yi1vYmplY3RzIGFuZCBkYXRhIGl0ZW1zIGluc2lkZSB0aGUgY3VycmVudCBvYmplY3QKLy8gYXJlIGluIHNjb3BlLgpvYmplY3QgIkNvbnRyYWN0MSIgewogICAgLy8gVGhpcyBpcyB0aGUgY29uc3RydWN0b3IgY29kZSBvZiB0aGUgY29udHJhY3QuCiAgICBjb2RlIHsKICAgICAgICBmdW5jdGlvbiBhbGxvY2F0ZShzaXplKSAtPiBwdHIgewogICAgICAgICAgICBwdHIgOj0gbWxvYWQoMHg0MCkKICAgICAgICAgICAgaWYgaXN6ZXJvKHB0cikgeyBwdHIgOj0gMHg2MCB9CiAgICAgICAgICAgIG1zdG9yZSgweDQwLCBhZGQocHRyLCBzaXplKSkKICAgICAgICB9CgogICAgICAgIC8vIGZpcnN0IGNyZWF0ZSAiQ29udHJhY3QyIgogICAgICAgIGxldCBzaXplIDo9IGRhdGFzaXplKCJDb250cmFjdDIiKQogICAgICAgIGxldCBvZmZzZXQgOj0gYWxsb2NhdGUoc2l6ZSkKICAgICAgICAvLyBUaGlzIHdpbGwgdHVybiBpbnRvIGNvZGVjb3B5IGZvciBFVk0KICAgICAgICBkYXRhY29weShvZmZzZXQsIGRhdGFvZmZzZXQoIkNvbnRyYWN0MiIpLCBzaXplKQogICAgICAgIC8vIGNvbnN0cnVjdG9yIHBhcmFtZXRlciBpcyBhIHNpbmdsZSBudW1iZXIgMHgxMjM0CiAgICAgICAgbXN0b3JlKGFkZChvZmZzZXQsIHNpemUpLCAweDEyMzQpCiAgICAgICAgcG9wKGNyZWF0ZShvZmZzZXQsIGFkZChzaXplLCAzMiksIDApKQoKICAgICAgICAvLyBub3cgcmV0dXJuIHRoZSBydW50aW1lIG9iamVjdCAodGhlIGN1cnJlbnRseQogICAgICAgIC8vIGV4ZWN1dGluZyBjb2RlIGlzIHRoZSBjb25zdHJ1Y3RvciBjb2RlKQogICAgICAgIHNpemUgOj0gZGF0YXNpemUoIkNvbnRyYWN0MV9kZXBsb3llZCIpCiAgICAgICAgb2Zmc2V0IDo9IGFsbG9jYXRlKHNpemUpCiAgICAgICAgLy8gVGhpcyB3aWxsIHR1cm4gaW50byBhIG1lbW9yeS0+bWVtb3J5IGNvcHkgZm9yIEV3YXNtIGFuZAogICAgICAgIC8vIGEgY29kZWNvcHkgZm9yIEVWTQogICAgICAgIGRhdGFjb3B5KG9mZnNldCwgZGF0YW9mZnNldCgiQ29udHJhY3QxX2RlcGxveWVkIiksIHNpemUpCiAgICAgICAgcmV0dXJuKG9mZnNldCwgc2l6ZSkKICAgIH0KCiAgICBkYXRhICJUYWJsZTIiIGhleCI0MTIzIgoKICAgIG9iamVjdCAiQ29udHJhY3QxX2RlcGxveWVkIiB7CiAgICAgICAgY29kZSB7CiAgICAgICAgICAgIGZ1bmN0aW9uIGFsbG9jYXRlKHNpemUpIC0+IHB0ciB7CiAgICAgICAgICAgICAgICBwdHIgOj0gbWxvYWQoMHg0MCkKICAgICAgICAgICAgICAgIGlmIGlzemVybyhwdHIpIHsgcHRyIDo9IDB4NjAgfQogICAgICAgICAgICAgICAgbXN0b3JlKDB4NDAsIGFkZChwdHIsIHNpemUpKQogICAgICAgICAgICB9CgogICAgICAgICAgICAvLyBydW50aW1lIGNvZGUKCiAgICAgICAgICAgIG1zdG9yZSgwLCAiSGVsbG8sIFdvcmxkISIpCiAgICAgICAgICAgIHJldHVybigwLCAweDIwKQogICAgICAgIH0KICAgIH0KCiAgICAvLyBFbWJlZGRlZCBvYmplY3QuIFVzZSBjYXNlIGlzIHRoYXQgdGhlIG91dHNpZGUgaXMgYSBmYWN0b3J5IGNvbnRyYWN0LAogICAgLy8gYW5kIENvbnRyYWN0MiBpcyB0aGUgY29kZSB0byBiZSBjcmVhdGVkIGJ5IHRoZSBmYWN0b3J5CiAgICBvYmplY3QgIkNvbnRyYWN0MiIgewogICAgICAgIGNvZGUgewogICAgICAgICAgICAvLyBjb2RlIGhlcmUgLi4uCiAgICAgICAgfQoKICAgICAgICBvYmplY3QgIkNvbnRyYWN0Ml9kZXBsb3llZCIgewogICAgICAgICAgICBjb2RlIHsKICAgICAgICAgICAgICAgIC8vIGNvZGUgaGVyZSAuLi4KICAgICAgICAgICAgfQogICAgICAgIH0KCiAgICAgICAgZGF0YSAiVGFibGUxIiBoZXgiNDEyMyIKICAgIH0KfQ&optimize=false&runs=200&evmVersion=null')
      .refreshPage()
      .waitForElementVisible('[data-id="compilerContainerCompileBtn"]')

      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontract-eaa022e37e.yul"]')
      .currentWorkspaceIs('code-sample')
      .openFile('contract-eaa022e37e.yul')
      .getEditorValue((content) => {
        console.log(content)
        browser.assert.ok(content && content.indexOf(
          'object "Contract1" {') !== -1)
      })
  },

  'Should select deploy with proxy option from URL params #group2': function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/#optimize=false&runs=200&deployProxy=true')
      .refreshPage()
      .switchWorkspace('default_workspace')
      .addFile('myTokenV1.sol', sources[1]['myTokenV1.sol'])
      .clickLaunchIcon('solidity')
      .pause(2000)
      .click('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .openFile('.deps/npm/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol')
      .isVisible({
        selector: '*[data-id="treeViewDivtreeViewItem.deps/npm/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol"]',
        timeout: 120000,
        suppressNotFoundErrors: true
      })
      .clickLaunchIcon('solidity')
      .click('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .isVisible({
        selector: '*[data-id="treeViewDivtreeViewItem.deps/npm/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol"]',
        timeout: 120000,
        suppressNotFoundErrors: true
      })
      .clickLaunchIcon('solidity')
      .click('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .waitForElementVisible({
        selector: '*[data-id="treeViewDivtreeViewItem.deps/npm/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol"]',
        timeout: 120000,
      })
      .openFile('myTokenV1.sol')
      .clickLaunchIcon('solidity')
      .waitForElementPresent('select[id="compiledContracts"] option[value=MyToken]', 60000)
      .clickLaunchIcon('udapp')
      .click('select.udapp_contractNames')
      .click('select.udapp_contractNames option[value=MyToken]')
      .waitForElementPresent('[data-id="contractGUIDeployWithProxyLabel"]')
      .expect.element('[data-id="contractGUIDeployWithProxy"]').to.be.selected
  },

  'Should select upgrade with proxy option from URL params #group2': function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/#optimize=false&runs=200&upgradeProxy=true')
      .refreshPage()
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemmyTokenV1.sol"]', 60000)
      .openFile('myTokenV1.sol')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//*[contains(@class, 'view-lines') and contains(.,'ERC721Upgradeable')]"
      })
      .clickLaunchIcon('solidity')
      .waitForElementVisible('[data-id="compilerContainerCompileBtn"]')
      .click('[data-id="compilerContainerCompileBtn"]')
      .waitForElementPresent('select[id="compiledContracts"] option[value=MyToken]', 60000)
      .clickLaunchIcon('udapp')
      .click('select.udapp_contractNames')
      .click('select.udapp_contractNames option[value=MyToken]')
      .waitForElementPresent('[data-id="contractGUIUpgradeImplementationLabel"]')
      .expect.element('[data-id="contractGUIUpgradeImplementation"]').to.be.selected
  },

  'Should load using various URL compiler params #group2': function (browser: NightwatchBrowser) {
    browser

      .url('http://127.0.0.1:8080/#optimize=true&runs=300&autoCompile=true&evmVersion=istanbul&version=soljson-v0.8.16+commit.07a7930e.js&language=Yul')
      .refreshPage()

      .clickLaunchIcon('solidity')
      .click('*[data-id="scConfigExpander"]')
      .waitForElementVisible({
        selector: "//*[@data-id='selectedVersion' and contains(.,'0.8.16+commit.07a7930e')]",
        locateStrategy: 'xpath'
      })
      .assert.containsText('#evmVersionSelector option[data-id="selected"]', 'istanbul')
      .assert.containsText('#compilerLanguageSelector option[data-id="selected"]', 'Yul')
      .verify.elementPresent('#optimize:checked')
      .verify.elementPresent('#autoCompile:checked')
      .verify.attributeEquals('#runs', 'value', '300')
      .url('http://127.0.0.1:8080/#version=0.8.7')
      .refreshPage()

      .clickLaunchIcon('solidity')
      .waitForElementVisible({
        selector: "//*[@data-id='selectedVersion' and contains(.,'0.8.7+commit.e28d00a7')]",
        locateStrategy: 'xpath'
      })
      .url('http://127.0.0.1:8080/#version=0.8.15+commit.e14f2714')
      .refreshPage()
      .pause(3000)
      .clickLaunchIcon('solidity')
      .waitForElementVisible({
        selector: "//*[@data-id='selectedVersion' and contains(.,'0.8.15+commit.e14f2714')]",
        locateStrategy: 'xpath'
      })
  },

  'Should load using compiler from link passed in remix URL #group3': function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/#version=https://binaries.soliditylang.org/wasm/soljson-v0.8.30+commit.73712a01.js&optimize=false')
      .refreshPage()
      .clickLaunchIcon('solidity')
      .click('*[data-id="scConfigExpander"]')
      .waitForElementVisible({
        selector: "//*[@data-id='selectedVersion' and contains(.,'custom')]",
        locateStrategy: 'xpath'
      })
      // default values
      .assert.containsText('#evmVersionSelector option[data-id="selected"]', 'default')
      .verify.elementPresent('#optimize')
      .assert.not.elementPresent('#optimize:checked')
      .verify.elementPresent('#runs:disabled')
      .click('[for="optimize"')
      .verify.attributeEquals('#runs', 'value', '200')
  },

  'Should load json files from link passed in remix URL #group3': function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/#optimize=false&runs=200&url=https://raw.githubusercontent.com/EthVM/evm-source-verification/main/contracts/1/0x011e5846975c6463a8c6337eecf3cbf64e328884/input.json')
      .refreshPage()
      .currentWorkspaceIs('code-sample')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItem@openzeppelin/contracts/access/AccessControl.sol"]')
      .openFile('contracts')
      .openFile('contracts/governance')
      .openFile('contracts/governance/UnionGovernor.sol')
  },

  'Should execute function call from URL parameters #group3': function (browser: NightwatchBrowser) {
    browser
      .switchWorkspace('default_workspace')
      .url('http://127.0.0.1:8080?calls=fileManager//open//contracts/3_Ballot.sol///terminal//log//log')
      .refreshPage()
      .waitForElementVisible('*[data-shared="tooltipPopup"]')
      .waitForElementContainsText('*[data-shared="tooltipPopup"]', 'initiating fileManager and calling "open" ...')
      .waitForElementContainsText('*[data-shared="tooltipPopup"]', 'initiating terminal and calling "log" ...')
  },

  'Import Github folder from URL params #group4': function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080/#ghfolder=https://github.com/ethereum/remix-project/tree/master/apps/remix-ide/contracts/hardhat')
      .refreshPage()
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]', 40000)
      .currentWorkspaceIs('code-sample')
      .openFile('contracts')
      // .openFile('contracts/Lock.sol')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/Lock.sol"]')
      .click('*[data-id="treeViewLitreeViewItemcontracts/Lock.sol"]')
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('contract Lock {') !== -1, 'content does contain "contract Lock {"')
      })
  },

  'Load remix with an iframe plugin #group4': function (browser: NightwatchBrowser) {
    browser
      .url('http://127.0.0.1:8080?activate=contract-verification')
      .refreshPage()
      .waitForElementVisible(
        {
          selector: '//*[contains(@data-id, "sidePanelSwapitTitle") and text()="Contract Verification"]',
          locateStrategy: 'xpath'
        }
      )
  }
}
