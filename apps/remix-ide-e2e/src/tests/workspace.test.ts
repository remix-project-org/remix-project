'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import sauce from './sauce'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080?activate=solidity,udapp&call=fileManager//open//contracts/3_Ballot.sol&deactivate=home', false)
  },

  CheckSolidityActivatedAndUDapp: function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('#icon-panel', 10000)
      .clickLaunchIcon('solidity')
      .clickLaunchIcon('udapp')
  },

  'Editor should be focused on the 3_Ballot.sol #group1': function (browser: NightwatchBrowser) {
    browser
      .pause(5000)
      .refreshPage()
      .waitForElementVisible('#editorView', 30000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('contract Ballot {') !== -1, 'content includes Ballot contract')
      })
  },

  'Home page should be deactivated #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementNotPresent('[data-id="landingPageHomeContainer"]')
  },

  // WORKSPACE TEMPLATES E2E START

  'Should create Remix default workspace with files #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacesSelect"]')
      .waitForElementVisible('*[data-id="workspacecreate"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementPresent('*[data-id="create-remixDefault"]')
      .scrollAndClick('*[data-id="create-remixDefault"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .scrollAndClick('*[data-id="modalDialogCustomPromptTextCreate"]')
      .setValue('*[data-id="modalDialogCustomPromptTextCreate"]', 'workspace_remix_default')
      // eslint-disable-next-line dot-notation
      .execute(function () { document.querySelector('*[data-id="modalDialogCustomPromptTextCreate"]')['value'] = 'workspace_remix_default' })
      .modalFooterOKClick('TemplatesSelection')
      .pause(1000)
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/1_Storage.sol"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/2_Owner.sol"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/3_Ballot.sol"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/deploy_with_web3.ts"]')
      // check js and ts files are not transformed
      .click('*[data-id="treeViewLitreeViewItemscripts/deploy_with_web3.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, './web3-lib')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`import { deploy } from './web3-lib'`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/deploy_with_ethers.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/deploy_with_ethers.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, './ethers-lib')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`import { deploy } from './ethers-lib'`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/web3-lib.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/web3-lib.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'web3.eth.getAccounts')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const deploy = async (contractName: string, args: Array<any>, from?: string, gas?: number): Promise<Options> => {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/ethers-lib.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/ethers-lib.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'ethers.providers')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const deploy = async (contractName: string, args: Array<any>, accountIndex?: number): Promise<ethers.Contract> => {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests/storage.test.js"]')
      .click('*[data-id="treeViewLitreeViewItemtests/storage.test.js"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'chai')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`const { expect } = require("chai");`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests/Ballot_test.sol"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.txt"]')
  },

  'Should create blank workspace with no files #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .waitForElementVisible('*[data-id="workspacecreate"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="create-blank"]')
      .click('*[data-id="create-blank"]')
      .waitForElementPresent('*[data-id="TemplatesSelectionModalDialogModalTitle-react"]')
      .assert.containsText('*[data-id="TemplatesSelectionModalDialogModalTitle-react"]', 'Create Workspace Using Template')
      // .scrollAndClick('*[data-id="create-blank"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .scrollAndClick('*[data-id="modalDialogCustomPromptTextCreate"]')
      .setValue('*[data-id="modalDialogCustomPromptTextCreate"]', 'workspace_blank')
      // eslint-disable-next-line dot-notation
      // .execute(function () { document.querySelector('*[data-id="modalDialogCustomPromptTextCreate"]')['value'] = 'workspace_blank' })
      .click('*[data-id="TemplatesSelection-modal-footer-ok-react"]')
      .currentWorkspaceIs('workspace_blank')
      .waitForElementPresent('*[data-id="treeViewUltreeViewMenu"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.prettierrc.json"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemremix.config.json"]')
      .execute(function () {
        const fileList = document.querySelector('*[data-id="treeViewUltreeViewMenu"]')
        return fileList.getElementsByTagName('li').length;
      }, [], function (result) {
        browser.assert.equal(result.value, 2, 'Incorrect number of files');
      });
  },

  'Should create ERC20 workspace with files #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('*[data-id="workspacesSelect"]')
      .waitForElementVisible('*[data-id="workspacecreate"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementPresent('*[data-id="create-ozerc20"]')
      .scrollAndClick('*[data-id="create-ozerc20"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .scrollAndClick('*[data-id="modalDialogCustomPromptTextCreate"]')
      .setValue('*[data-id="modalDialogCustomPromptTextCreate"]', 'workspace_erc20')
      // eslint-disable-next-line dot-notation
      .execute(function () { document.querySelector('*[data-id="modalDialogCustomPromptTextCreate"]')['value'] = 'workspace_erc20' })
      .modalFooterOKClick('TemplatesSelection')
      .pause(100)
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/MyToken.sol"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/deploy_with_web3.ts"]')
      // check js and ts files are not transformed
      .click('*[data-id="treeViewLitreeViewItemscripts/deploy_with_web3.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, './web3-lib')]",
        locateStrategy: 'xpath',
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`import { deploy } from './web3-lib'`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/deploy_with_ethers.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/deploy_with_ethers.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, './ethers-lib')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`import { deploy } from './ethers-lib'`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/web3-lib.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/web3-lib.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'web3.eth.getAccounts')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const deploy = async (contractName: string, args: Array<any>, from?: string, gas?: number): Promise<Options> => {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/ethers-lib.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/ethers-lib.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'ethers.providers')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const deploy = async (contractName: string, args: Array<any>, accountIndex?: number): Promise<ethers.Contract> => {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests/MyToken_test.sol"]')
  },

  'Should create ERC721 workspace with files #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('*[data-id="workspacesSelect"]')
      .waitForElementVisible('*[data-id="workspacecreate"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementPresent('*[data-id="create-ozerc721"]')
      .scrollAndClick('*[data-id="create-ozerc721"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .scrollAndClick('*[data-id="modalDialogCustomPromptTextCreate"]')
      .setValue('*[data-id="modalDialogCustomPromptTextCreate"]', 'workspace_erc721')
      // eslint-disable-next-line dot-notation
      .execute(function () { document.querySelector('*[data-id="modalDialogCustomPromptTextCreate"]')['value'] = 'workspace_erc721' })
      .modalFooterOKClick('TemplatesSelection')
      .pause(100)
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/MyToken.sol"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/deploy_with_web3.ts"]')
      // check js and ts files are not transformed
      .click('*[data-id="treeViewLitreeViewItemscripts/deploy_with_web3.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, './web3-lib')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`import { deploy } from './web3-lib'`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/deploy_with_ethers.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/deploy_with_ethers.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, './ethers-lib')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`import { deploy } from './ethers-lib'`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/web3-lib.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/web3-lib.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'web3.eth.getAccounts')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const deploy = async (contractName: string, args: Array<any>, from?: string, gas?: number): Promise<Options> => {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/ethers-lib.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/ethers-lib.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'ethers.providers')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const deploy = async (contractName: string, args: Array<any>, accountIndex?: number): Promise<ethers.Contract> => {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests/MyToken_test.sol"]')
  },

  'Should create ERC1155 workspace with files #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementPresent('*[data-id="create-ozerc1155"]')
      .scrollAndClick('*[data-id="create-ozerc1155"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .scrollAndClick('*[data-id="modalDialogCustomPromptTextCreate"]')
      .setValue('*[data-id="modalDialogCustomPromptTextCreate"]', 'workspace_erc1155')
      // eslint-disable-next-line dot-notation
      .execute(function () { document.querySelector('*[data-id="modalDialogCustomPromptTextCreate"]')['value'] = 'workspace_erc1155' })
      .modalFooterOKClick('TemplatesSelection')
      .pause(100)
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/MyToken.sol"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/deploy_with_web3.ts"]')
      // check js and ts files are not transformed
      .click('*[data-id="treeViewLitreeViewItemscripts/deploy_with_web3.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, './web3-lib')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`import { deploy } from './web3-lib'`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/deploy_with_ethers.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/deploy_with_ethers.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, './ethers-lib')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`import { deploy } from './ethers-lib'`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/web3-lib.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/web3-lib.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'web3.eth.getAccounts')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const deploy = async (contractName: string, args: Array<any>, from?: string, gas?: number): Promise<Options> => {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/ethers-lib.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/ethers-lib.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'ethers.providers')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const deploy = async (contractName: string, args: Array<any>, accountIndex?: number): Promise<ethers.Contract> => {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests/MyToken_test.sol"]')
  },

  'Should create ERC1155 workspace with template customizations #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacecreate"]')
      // .waitForElementPresent(`*[data-id='create-ozerc1155{"upgradeable":"uups","mintable":true,"burnable":true,"pausable":true}']`)
      // .scrollAndClick(`*[data-id='create-ozerc1155{"upgradeable":"uups","mintable":true,"burnable":true,"pausable":true}']`)
      .waitForElementPresent('*[data-id="create-ozerc1155"]')
      .scrollAndClick('*[data-id="create-ozerc1155"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .click('*[data-id="featureTypeMintable"]')
      .click('*[data-id="featureTypeBurnable"]')
      .click('*[data-id="featureTypePausable"]')
      .click('*[data-id="upgradeTypeUups"]')
      .modalFooterOKClick('TemplatesSelection')
      .pause(100)
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/MyToken.sol"]')
      .click('*[data-id="treeViewLitreeViewItemcontracts/MyToken.sol"]')
      .pause(1000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`contract MyToken is Initializable, ERC1155Upgradeable, OwnableUpgradeable, ERC1155PausableUpgradeable, ERC1155BurnableUpgradeable, UUPSUpgradeable {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/deploy_with_web3.ts"]')
      // check js and ts files are not transformed
      .click('*[data-id="treeViewLitreeViewItemscripts/deploy_with_web3.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, './web3-lib')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`import { deploy } from './web3-lib'`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/deploy_with_ethers.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/deploy_with_ethers.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, './ethers-lib')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`import { deploy } from './ethers-lib'`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/web3-lib.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/web3-lib.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'web3.eth.getAccounts')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const deploy = async (contractName: string, args: Array<any>, from?: string, gas?: number): Promise<Options> => {`) !== -1,
          'Incorrect content')
        browser.assert.ok(content.indexOf(`gas: gas || 3600000`) !== -1,
          'Incorrect gas cost')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/ethers-lib.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/ethers-lib.ts"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'ethers.providers')]",
        locateStrategy: 'xpath'
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const deploy = async (contractName: string, args: Array<any>, accountIndex?: number): Promise<ethers.Contract> => {`) !== -1,
          'Incorrect content')
      })
    // No test file is added in upgradeable contract template
  },
  'Should create circom zkp hashchecker workspace #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementPresent('*[data-id="create-hashchecker"]')
      .scrollAndClick('*[data-id="create-hashchecker"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .modalFooterOKClick('TemplatesSelection')
      .pause(100)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcircuits"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcircuits/calculate_hash.circom"]')
      .click('*[data-id="treeViewLitreeViewItemcircuits/calculate_hash.circom"]')
      .pause(1000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`template CalculateHash() {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/groth16"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/groth16/groth16_trusted_setup.ts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/groth16/groth16_zkproof.ts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/plonk"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/plonk/plonk_trusted_setup.ts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/plonk/plonk_zkproof.ts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtemplates"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtemplates/groth16_verifier.sol.ejs"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtemplates/plonk_verifier.sol.ejs"]')
      .click('*[data-id="treeViewLitreeViewItemtemplates/groth16_verifier.sol.ejs"]')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`contract Groth16Verifier {`) !== -1,
          'Incorrect content')
      })
  },

  // WORKSPACE TEMPLATES E2E END

  'Should create two workspace and switch to the first one #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementPresent('*[data-id="create-remixDefault"]')
      .click('*[data-id="create-remixDefault"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .click('input[data-id="modalDialogCustomPromptTextCreate"]')
      .setValue('input[data-id="modalDialogCustomPromptTextCreate"]', 'workspace_name')
      // .modalFooterOKClick('TemplatesSelection')
      .click('*[data-id="TemplatesSelection-modal-footer-ok-react"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests"]')
      .click('*[data-id="treeViewLitreeViewItemtests"]')
      .addFile('test.sol', { content: 'test' })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest.sol"]')
      .waitForElementPresent({
        selector: "//div[contains(@class, 'view-line') and contains(.//span, 'test')]",
        locateStrategy: 'xpath'
      })
      .click('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementPresent('*[data-id="create-remixDefault"]')
      .scrollAndClick('*[data-id="create-remixDefault"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .click('input[data-id="modalDialogCustomPromptTextCreate"]')
      .setValue('input[data-id="modalDialogCustomPromptTextCreate"]', 'workspace_name_1')
      // .modalFooterOKClick('TemplatesSelection')
      .click('*[data-id="TemplatesSelection-modal-footer-ok-react"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests"]')
      .waitForElementNotPresent('*[data-id="treeViewLitreeViewItemtest.sol"]')
      .switchWorkspace('workspace_name')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemtests"]')
      .currentWorkspaceIs('workspace_name')
  },

  'Should rename a workspace #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacesSelect"]')
      .waitForElementVisible('*[data-id="dropdown-item-workspace_name"]')
      .waitForElementVisible('*[data-id="workspacesubMenuIcon"]')
      .click('*[data-id="workspacesubMenuIcon"]')
      .click('*[data-id="workspacesubMenuRename"]') // rename workspace_name
      .pause(500)
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextRename"]')
      .click('*[data-id="modalDialogCustomPromptTextRename"]')
      .clearValue('*[data-id="modalDialogCustomPromptTextRename"]')
      .setValue('*[data-id="modalDialogCustomPromptTextRename"]', 'workspace_name_renamed')
      .waitForElementPresent('[data-id="topbarModalModalDialogModalFooter-react"] .modal-ok')
      .click('[data-id="topbarModalModalDialogModalFooter-react"] > .modal-ok')
      .pause(2000)
      .switchWorkspace('workspace_name_1')
      .pause(2000)
      .currentWorkspaceIs('workspace_name_1')
      .switchWorkspace('workspace_name_renamed')
      .pause(2000)
      .currentWorkspaceIs('workspace_name_renamed')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemtests"]')
  },

  'Should delete a workspace #group1': function (browser: NightwatchBrowser) {
    const selector = 'a[data-id="dropdown-item-workspace_name_1"] + div [data-id="workspacesubMenuIcon"]'
    browser
      .click('*[data-id="workspacesSelect"]')
      .waitForElementVisible(`[data-id="dropdown-item-workspace_name_1"]`)
      .waitForElementVisible(selector)
      .click(selector)
      .click('*[data-id="workspacesubMenuDelete"]') // delete workspace_name_1
      .waitForElementVisible('*[data-id="topbarModalModalDialogModalFooter-react"]')
      .click('*[data-id="topbarModalModalDialogModalFooter-react"] .modal-ok')
      .waitForElementVisible('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacesSelect"]')
      .waitForElementVisible('*[data-id="dropdown-item-workspace_name"]')
      .click('*[data-id="dropdown-item-workspace_name"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .click('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacesSelect"]')
      .waitForElementNotPresent(`[data-id="dropdown-item-workspace_name_1"]`)
      .end()
  },

  'Should create workspace for test #group2': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementPresent('*[data-id="create-ozerc1155"]')
      .scrollAndClick('*[data-id="create-ozerc1155"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .scrollAndClick('*[data-id="modalDialogCustomPromptTextCreate"]')
      .setValue('*[data-id="modalDialogCustomPromptTextCreate"]', 'sometestworkspace')
      .execute(function () { document.querySelector('*[data-id="modalDialogCustomPromptTextCreate"]')['value'] = 'sometestworkspace' })
      .modalFooterOKClick('TemplatesSelection')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/MyToken.sol"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.prettierrc.json"]')
      .pause(2000)
  },

  'Should change the current workspace in localstorage to a non existent value, reload the page and see the workspace created #group2': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        localStorage.setItem('currentWorkspace', 'non_existing_workspace')
      })
      .refreshPage()
      .clickLaunchIcon('filePanel')
      .currentWorkspaceIs('sometestworkspace')
  },

  'Should create workspace for next test #group2': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementPresent('*[data-id="create-ozerc1155"]')
      .scrollAndClick('*[data-id="create-ozerc1155"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .scrollAndClick('*[data-id="modalDialogCustomPromptTextCreate"]')
      .setValue('*[data-id="modalDialogCustomPromptTextCreate"]', 'workspace_db_test')
      // eslint-disable-next-line dot-notation
      .execute(function () { document.querySelector('*[data-id="modalDialogCustomPromptTextCreate"]')['value'] = 'workspace_db_test' })
      .modalFooterOKClick('TemplatesSelection')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/MyToken.sol"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.prettierrc.json"]')
      .pause(2000)
  },

  'Should clear indexedDB and reload the page and see the default workspace #group2': function (browser: NightwatchBrowser) {
    browser
      .execute(function () {
        indexedDB.deleteDatabase('RemixFileSystem')
      })
      .refreshPage()
      .clickLaunchIcon('filePanel')
      .currentWorkspaceIs('default_workspace')

  },
  // This test is disable as it was failing for chrome on CI
  'Should create a cookbook workspace #group3': !function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacecreate"]')
      .waitForElementPresent('*[data-id="create-uniswapV4HookBookMultiSigSwapHook"]')
      .scrollAndClick('*[data-id="create-uniswapV4HookBookMultiSigSwapHook"]')
      .waitForElementVisible('*[data-id="modalDialogCustomPromptTextCreate"]')
      .scrollAndClick('*[data-id="modalDialogCustomPromptTextCreate"]')
      .setValue('*[data-id="modalDialogCustomPromptTextCreate"]', 'multisig cookbook')
      // eslint-disable-next-line dot-notation
      .execute(function () { document.querySelector('*[data-id="modalDialogCustomPromptTextCreate"]')['value'] = 'multisig cookbook' })
      .modalFooterOKClick('TemplatesSelection')
      .waitForElementVisible('[data-id="PermissionHandler-modal-footer-ok-react"]', 300000)
      .click('[data-id="PermissionHandler-modal-footer-ok-react"]')
      // click on lib to close it
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemlib"]')
      .click('*[data-id="treeViewLitreeViewItemlib"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemsrc"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemsrc/MULTI_SIG"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemsrc/MULTI_SIG/MultiSigSwapHook.sol"]')
  },

  'Should add Create2 solidity factory #group4': !function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspaceaddcreate2solidityfactory"]')
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`contract Create2FactoryAssembly {`) !== -1,
          'current displayed content is not Create2FactoryAssembly')
      })
  },

  tearDown: sauce
}

