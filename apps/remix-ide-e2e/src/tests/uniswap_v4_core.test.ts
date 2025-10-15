'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import sauce from './sauce'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', false)
  },

  'Should clone Uniswap v4-core repository #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="github-dropdown-toggle"]')
      .click('*[data-id="github-dropdown-toggle"]')
      .waitForElementVisible('*[data-id="github-dropdown-item-clone"]')
      .click('*[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('[data-id="topbarModalModalDialogModalBody-react"]')
      .click('[data-id="topbarModalModalDialogModalBody-react"]')
      .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
      .setValue('[data-id="modalDialogCustomPromptTextClone"]', 'https://github.com/Uniswap/v4-core')
      .click('[data-id="topbarModal-modal-footer-ok-react"]')
      .waitForElementPresent('.fa-spinner')
      .pause(5000)
      .waitForElementNotPresent('.fa-spinner', 240000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.git"]', 240000)
      .waitForElementContainsText('[data-id="workspacesSelect"]', 'v4-core')
  },

  'Should verify repository was cloned with submodules #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.gitmodules"]', 120000)
      .waitForElementVisible('[data-id="workspaceGitPanel"]')
  },

  'Should update submodules in Remix interface #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('[data-id="updatesubmodules"]', 120000)
      .click('[data-id="updatesubmodules"]')
      .waitForElementPresent('.fa-spinner')
      .waitForElementNotPresent('.fa-spinner', 240000)
      .pause(5000)
  },

  'Should verify submodules are loaded #group1': function (browser: NightwatchBrowser) {
    browser
      // Verify that submodule directories exist (common submodules in v4-core)
      // The exact submodule names depend on the .gitmodules file
      // We'll check for the lib folder which typically contains submodules
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemlib"]', 120000)
      .click('*[data-id="treeViewDivtreeViewItemlib"]')
      .pause(2000)
  },

  'Should navigate to PoolManager.sol #group1': function (browser: NightwatchBrowser) {
    browser
      .pause(1000)
      // Navigate to src directory where PoolManager.sol is located
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemsrc"]', 120000)
      .click('*[data-id="treeViewDivtreeViewItemsrc"]')
      .pause(2000)
      // Open PoolManager.sol
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemsrc/PoolManager.sol"]', 120000)
      .click('*[data-id="treeViewDivtreeViewItemsrc/PoolManager.sol"]')
      .pause(2000)
  },

  'Should verify PoolManager.sol is opened #group1': function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(
          content.indexOf('contract PoolManager') !== -1 || content.indexOf('PoolManager') !== -1,
          'PoolManager.sol content should contain PoolManager contract'
        )
      })
  },

  'Should set Solidity compiler version for v4-core #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .pause(1000)
      // v4-core typically uses Solidity 0.8.x
      .setSolidityCompilerVersion('soljson-v0.8.26+commit.8a97fa7a.js')
      .waitForElementPresent({
        selector: `//*[@data-id='compilerloaded' and @data-version='soljson-v0.8.26+commit.8a97fa7a.js']`,
        locateStrategy: 'xpath',
        timeout: 120000
      })
  },

  'Should compile PoolManager.sol #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .openFile('src/PoolManager.sol')
      .clickLaunchIcon('solidity')
      .pause(2000)
      .click('[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('filePanel')
      .verifyContracts(['PoolManager'], { wait: 10000 })
      .pause(5000)
  },

  'Should create deployment script for PoolManager #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('*[data-id="treeViewUltreeViewMenu"]') // make sure we create the file at the root folder
      .addFile('deployPoolManager.js', { content: deployPoolManagerScript }, 'package.json')
      .pause(2000)
  },

  'Should execute deployment script and verify contract address in terminal #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="run-script-dropdown-trigger"]')
      .click('*[data-id="run-with-ethers6-menu-item"]')
      .pause(5000)
      // Wait for the contract address to appear in the terminal output
      // Contract addresses start with 0x and are 42 characters long
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'PoolManager deployed at:', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', '0x', 60000)
      .pause(2000)
      // Verify the deployment message appears in terminal
      .journalChildIncludes('PoolManager deployed at:')
      .journalChildIncludes('0x')
  }
}

const deployPoolManagerScript = `
import { ethers } from 'ethers'

/**
 * Deploy the PoolManager contract
 * @param {string} contractName name of the contract to deploy
 * @param {Array<any>} args list of constructor' parameters
 * @param {Number} accountIndex account index from the exposed account
 * @return {Contract} deployed contract
 */
const deploy = async (contractName: string, args: Array<any>, accountIndex?: number): Promise<ethers.Contract> => {
  console.log(\`Deploying \${contractName}...\`)

  // Note that the script needs the ABI which is generated from the compilation artifact.
  const artifactsPath = \`artifacts/\${contractName}.json\`

  const metadata = JSON.parse(await remix.call('fileManager', 'getFile', artifactsPath))

  const signer = await (new ethers.BrowserProvider(web3Provider)).getSigner(accountIndex)

  const factory = new ethers.ContractFactory(metadata.abi, metadata.data.bytecode.object, signer)

  const contract = await factory.deploy(...args)

  // Wait until the contract is deployed
  await contract.waitForDeployment()
  return contract
}

(async () => {
  try {
    // Deploy PoolManager contract
    const signer = await (new ethers.BrowserProvider(web3Provider)).getSigner()
    const poolManager = await deploy('PoolManager', [await signer.getAddress()])

    const address = await poolManager.getAddress()
    console.log(\`PoolManager deployed at: \${address}\`)
  } catch (e) {
    console.log('Error deploying PoolManager:', e.message)
  }
})()`
