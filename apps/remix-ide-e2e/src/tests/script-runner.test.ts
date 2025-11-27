'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const tests = {

  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080', false)
  },
  'Should activate plugins': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remixIdeSidePanel"]')
      .waitForElementVisible('*[plugin="pluginManager"]')
      .click('*[plugin="pluginManager"]')
      .waitForElementVisible('*[data-id="pluginManagerComponentPluginManager"]')
      .click('*[data-id="pluginManagerComponentPluginManager"]')
      .scrollAndClick('*[data-id="pluginManagerComponentActivateButtonUIScriptRunner"]')
  },
  'Should load default script runner': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="verticalIconsKindfilePanel"]')
      .click('*[data-id="verticalIconsKindfilePanel"]')
      .openFile('scripts/deploy_with_ethers.ts')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemscripts/deploy_with_ethers.ts"]')
      // .click('*[data-id="treeViewDivtreeViewItemscripts"]')
      // .pause(3000)
      // .waitForElementVisible('*[data-id="treeViewDivtreeViewItemscripts/deploy_with_ethers.ts"]')
      .click('*[data-id="treeViewDivtreeViewItemscripts/deploy_with_ethers.ts"]')
      .waitForElementVisible('*[data-id="run-script-dropdown-trigger"]')
      .click('*[data-id="run-script-dropdown-trigger"]')
      .click('*[data-id="open-script-configuration-menu-item"]')
      .waitForElementVisible('[data-id="sr-loaded-default"]')
      .waitForElementVisible('[data-id="dependency-ethers-^5"]')
      .waitForElementVisible('[data-id="sr-notloaded-ethers6"]')
  },
  'Should load script runner ethers6': function (browser: NightwatchBrowser) {
    browser
      .click('[data-id="sr-notloaded-ethers6"]')
      .waitForElementVisible('label[data-id="sr-loaded-ethers6"]', 100000)
      .waitForElementPresent('[data-id="dependency-ethers-^6"]', 2000)
  },
  'Should have config file in remix.config.json': function (browser: NightwatchBrowser) {
    browser
      .frameParent()
      // .clickLaunchIcon('filePanel')
      .waitForElementVisible('[data-id="treeViewDivDraggableItemremix.config.json"]')
      .openFile('remix.config.json')
  },
  'check config file content': function (browser: NightwatchBrowser) {
    browser
      .getEditorValue((content) => {
        console.log(JSON.parse(content))
        const parsed = JSON.parse(content)
        browser.assert.ok(parsed['script-runner'].defaultConfig === 'ethers6', 'config file content is correct')
      })
  },
  'execute ethers6 script': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="treeViewUltreeViewMenu"]') // make sure we create the file at the root folder
      .addFile('deployWithEthersJs.js', { content: deployWithEthersJs })
      .pause(1000)
      .click('[data-id="treeViewDivtreeViewItemcontracts"]')
      .openFile('contracts/2_Owner.sol')
      .clickLaunchIcon('solidity')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .executeScriptInTerminal('remix.execute(\'deployWithEthersJs.js\')')
      .waitForElementContainsText('*[data-id="terminalJournal"]', '0xd9145CCE52D386f254917e481eB44e9943F39138', 60000)
  },
  'switch workspace it should be default again': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .pause(2000)
      .waitForElementVisible('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .scrollInto('*[data-id="template-category-Circom ZKP"]')
      .waitForElementVisible('*[data-id="template-card-semaphore-0"]')
      .click('*[data-id="template-card-semaphore-0"]')
      .click('*[data-id="validate-semaphoreworkspace-button"]')
      // .waitForElementVisible('*[data-id="treeViewLitreeViewItemcircuits/semaphore.circom"]')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//li[@data-id='UIScriptRunner' and @role='tab']"
      })
      .click({
        locateStrategy: 'xpath',
        selector: "//li[@data-id='UIScriptRunner' and @role='tab']"
      })
      .waitForElementVisible('[data-id="sr-loaded-default"]')
      .waitForElementVisible('[data-id="dependency-ethers-^5"]')
      .waitForElementVisible('[data-id="sr-notloaded-zksyncv6"]')
  },
  'open template that sets a config': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacesSelect"]')
      .click('*[data-id="workspacecreate"]')
      // .click('*[data-id="workspacesSelect"]')
      .waitForElementVisible('*[data-id="template-card-simpleEip7702-2"]')
      .click('*[data-id="template-card-simpleEip7702-2"]')
      .click('*[data-id="validate-simpleEip7702workspace-button"]')
      // .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/Example7702.sol"]')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//li[@data-id='UIScriptRunner' and @role='tab']"
      })
      .click({
        locateStrategy: 'xpath',
        selector: "//li[@data-id='UIScriptRunner' and @role='tab']"
      })
      .scrollAndClick('*[data-id="sr-notloaded-ethers6"]')
      .scrollInto('[data-id="sr-notloaded-default"]')
  },
  'reset to default after template': function (browser: NightwatchBrowser) {
    browser
      .refreshPage()
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"', 30000)
      .click('*[data-id="treeViewLitreeViewItemscripts"')
      .pause(1000)
      .element('css selector', 'li[data-id^="treeViewLitreeViewItemscripts/"][data-id$=".ts"]', function (res) {
        if (res.status === 0) {
          browser.click('li[data-id^="treeViewLitreeViewItemscripts/"][data-id$=".ts"]')
        } else {
          browser
            .click('li[data-id^="treeViewLitreeViewItemscripts/"]:not([data-id$=".ts"])')
            .pause(500)
            .waitForElementVisible('li[data-id^="treeViewLitreeViewItemscripts/"][data-id$=".ts"]', 30000)
            .click('li[data-id^="treeViewLitreeViewItemscripts/"][data-id$=".ts"]')
        }
      })
      .pause(1000)
      .waitForElementVisible('*[data-id="run-script-dropdown-trigger"]', 30000)
      .pause(1000)
      .click('*[data-id="run-script-dropdown-trigger"]')
      .pause(1000)
      .click('*[data-id="open-script-configuration-menu-item"]')
      .waitForElementVisible('label[data-id="sr-loaded-default"]', 60000)
      .waitForElementVisible('label[data-id="sr-notloaded-ethers6"]', 60000)
  },
  'switch to default workspace that should be on ethers6': function (browser: NightwatchBrowser) {
    browser
      .switchWorkspace('default_workspace')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//li[@data-id='UIScriptRunner' and @role='tab']"
      })
      .click({
        locateStrategy: 'xpath',
        selector: "//li[@data-id='UIScriptRunner' and @role='tab']"
      })
      .waitForElementVisible('label[data-id="sr-loaded-ethers6"]')
      .waitForElementPresent('[data-id="dependency-ethers-^6"]')
  },

}

module.exports = tests

const deployWithEthersJs = `
import { ethers } from 'ethers'

/**
 * Deploy the given contract
 * @param {string} contractName name of the contract to deploy
 * @param {Array<any>} args list of constructor' parameters
 * @param {Number} accountIndex account index from the exposed account
 * @return {Contract} deployed contract
 *
 */
const deploy = async (contractName: string, args: Array<any>, accountIndex?: number): Promise<ethers.Contract> => {

  console.log(\`deploying \${contractName}\`)
  // Note that the script needs the ABI which is generated from the compilation artifact.
  // Make sure contract is compiled and artifacts are generated
  const artifactsPath = \`artifacts/\${contractName}.json\` // Change this for different path

  const metadata = JSON.parse(await remix.call('fileManager', 'getFile', artifactsPath))
  // 'web3Provider' is a remix global variable object

  const signer = await (new ethers.BrowserProvider(web3Provider)).getSigner(accountIndex)

  const factory = new ethers.ContractFactory(metadata.abi, metadata.data.bytecode.object, signer)

  const contract = await factory.deploy(...args)

  // The contract is NOT deployed yet; we must wait until it is mined
  await contract.waitForDeployment()
  return contract
}

(async () => {
  try {
    const contract = await deploy('Owner', [])

    console.log(\`address: \${await contract.getAddress()}\`)
  } catch (e) {
    console.log(e.message)
  }
})()`
