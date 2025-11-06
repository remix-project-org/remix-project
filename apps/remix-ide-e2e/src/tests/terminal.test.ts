'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

const branch = process.env.CIRCLE_BRANCH;
const isMasterBranch = branch === 'master';
const runMasterTests: boolean = (branch ? (isMasterBranch ? true : false) : true)

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done, 'http://127.0.0.1:8080?plugins=solidity,udapp', false)
  },
  'Should execution a simple console command #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="terminalCli"]', 10000)
      .executeScriptInTerminal('console.log(1 + 1)')
      .pause(2000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', '2', 60000)
  },

  'Should clear console #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="terminalCli"]')
      .journalChildIncludes('Welcome to Remix')
      .click('#clearConsole')
      .waitForElementContainsText('*[data-id="terminalJournal"]', '', 60000)
  },

  'Async/Await Script #group1': function (browser: NightwatchBrowser) {
    browser
      .addFile('asyncAwait.js', { content: asyncAwait })
      .executeScriptInTerminal('remix.execute("asyncAwait.js")')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Waiting Promise', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'result - ', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Promise Resolved', 60000)
  },

  'Call Remix File Manager from a script #group2': function (browser: NightwatchBrowser) {
    browser
      .addFile('asyncAwaitWithFileManagerAccess.js', { content: asyncAwaitWithFileManagerAccess })
      .executeScriptInTerminal('remix.execute(\'asyncAwaitWithFileManagerAccess.js\')')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'contract Ballot {', 60000)
  },

  'Call web3.eth.getAccounts() using Remix VM #group2': function (browser: NightwatchBrowser) {
    browser
      .executeScriptInTerminal('web3.eth.getAccounts()')
      .waitForElementContainsText('*[data-id="terminalJournal"]', '["0x5B38Da6a701c568545dCfcB03FcB875f56beddC4","0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2","0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db","0x78731D3Ca6b7E34aC0F824c42a7cC18A495cabaB","0x617F2E2fD72FD9D5503197092aC168c91465E7f2","0x17F6AD8Ef982297579C203069C1DbfFE4348c372","0x5c6B0f7Bf3E7ce046039Bd8FABdfD3f9F5021678","0x03C6FcED478cBbC9a4FAB34eF9f40767739D1Ff7","0x1aE0EA34a72D944a8C7603FfB3eC30a6669E454C","0x0A098Eda01Ce92ff4A4CCb7A4fFFb5A43EBC70DC","0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c","0x14723A09ACff6D2A60DcdF7aA4AFf308FDDC160C","0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB","0x583031D1113aD414F02576BD6afaBfb302140225","0xdD870fA1b7C4700F2BD7f44238821C26f7392148"]')
  },

  'Call web3.eth.getAccounts() using External Http Provider #group5': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="terminalClearConsole"]') // clear  the terminal
      .clickLaunchIcon('udapp')
      .switchEnvironment('basic-http-provider')
      .modalFooterOKClick('basic-http-provider')
      .executeScriptInTerminal('web3.eth.getAccounts()')
      .waitForElementContainsText('*[data-id="terminalJournal"]', '["', 60000) // we check if an array is present, don't need to check for the content
      .waitForElementContainsText('*[data-id="terminalJournal"]', '"]', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', '","', 60000)
  },

  'Call Remix File Resolver (external URL) from a script #group3': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="terminalClearConsole"]') // clear the terminal
      .addFile('resolveExternalUrlAndSave.js', { content: resolveExternalUrlAndSave })
      .openFile('resolveExternalUrlAndSave.js')
      .pause(1000)
      .executeScriptInTerminal('remix.execute(\'resolveExternalUrlAndSave.js\')')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Implementation of the {IERC20} interface.', 60000)
      .openFile('.deps/github/OpenZeppelin/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol')
  },

  'Call Remix File Resolver (internal URL) from a script #group3': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="terminalClearConsole"]') // clear the terminal
      .addFile('resolveUrl.js', { content: resolveUrl })
      .openFile('resolveUrl.js')
      .pause(1000)
      .executeScriptInTerminal('remix.execute(\'resolveUrl.js\')')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'contract Ballot {', 60000)
  },

  'Call Remix File Resolver (internal URL) from a script and specify a path #group3': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="terminalClearConsole"]') // clear the terminal
      .addFile('resolveExternalUrlAndSaveToaPath.js', { content: resolveExternalUrlAndSaveToaPath })
      .openFile('resolveExternalUrlAndSaveToaPath.js')
      .pause(1000)
      .executeScriptInTerminal('remix.execute(\'resolveExternalUrlAndSaveToaPath.js\')')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'abstract contract ERC20Burnable', 60000)
      .openFile('.deps/github/newFile.sol')

  },

  'Deploy "Owner" using an ether.js script, listen to event and check event are logged in the terminal #group4': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .click('.remixui_compilerConfigSection')
      .setValue('#evmVersionSelector', 'london') // Set EVM version as fork version
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-london')
      .click('*[data-id="terminalClearConsole"]') // clear the terminal
      .clickLaunchIcon('filePanel')
      .click('*[data-id="treeViewUltreeViewMenu"]') // make sure we create the file at the root folder
      .addFile('deployWithEthersJs.js', { content: deployWithEthersJs })
      // .openFile('deployWithEthersJs.js')
      .pause(1000)
      .click('[data-id="treeViewDivtreeViewItemcontracts"]')
      .openFile('contracts/2_Owner.sol')
      .clickLaunchIcon('solidity')
      .click('*[data-id="compilerContainerCompileBtn"]').pause(5000) // compile Owner
      .executeScriptInTerminal('remix.execute(\'deployWithEthersJs.js\')')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Contract Address:', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', '0xd9145CCE52D386f254917e481eB44e9943F39138', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Deployment successful.', 60000)
      .addAtAddressInstance('0xd9145CCE52D386f254917e481eB44e9943F39138', true, true, false)
      .click('*[data-id="terminalClearConsole"]') // clear the terminal
      .waitForElementPresent('*[data-id="universalDappUiContractActionWrapper"]', 60000)
      .clickInstance(0)
      .clickFunction('changeOwner - transact (not payable)', { types: 'address newOwner', values: '0xd9145CCE52D386f254917e481eB44e9943F39138' }) // execute the "changeOwner" function
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'previousOwner', 60000) // check that the script is logging the event
      .waitForElementContainsText('*[data-id="terminalJournal"]', '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4', 60000) // check that the script is logging the event
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'newOwner', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', '0xd9145CCE52D386f254917e481eB44e9943F39138', 60000)
  },
  'Run tests using Mocha script and check result logging in the terminal #group4': function (browser: NightwatchBrowser) {
    browser
      .addFile('scripts/storage.test.js', { content: storageMochaTests })
      .pause(1000)
      .openFile('contracts/1_Storage.sol')
      .clickLaunchIcon('solidity')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .pause(1000) // compile Storage
      .executeScriptInTerminal('remix.execute(\'scripts/storage.test.js\')')
      .pause(1000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'RUNS scripts/script.ts....')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'storage contract Address:')
      .waitForElementContainsText('*[data-id="terminalJournal"]', '✓ test initial value')
      .waitForElementContainsText('*[data-id="terminalJournal"]', '✓ test updating and retrieving updated value')
      .waitForElementContainsText('*[data-id="terminalJournal"]', '✘ fail test updating and retrieving updated value')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Expected: 55')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Received: 56')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Message: incorrect number: expected 56 to equal 55')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Passed: 2')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Failed: 1')
  },
  'Run tests using Mocha for a contract with library deployment and check result logging in the terminal #group4': function (browser: NightwatchBrowser) {
    browser
      .addFile('scripts/storageWithLib.test.js', { content: storageWithLibMochaTests })
      .pause(1000)
      .click('[data-id="treeViewDivtreeViewItemcontracts"]')
      .addFile('contracts/StorageWithLib.sol', { content: storageWithLibContract })
      .openFile('contracts/StorageWithLib.sol')
      .clickLaunchIcon('solidity')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .pause(1000) // compile StorageWithLib
      .executeScriptInTerminal('remix.execute(\'scripts/storageWithLib.test.js\')')
      .pause(1000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'RUNS scripts/script.ts....')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Storage')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'deploying lib:')
      .waitForElementContainsText('*[data-id="terminalJournal"]', '✘ test library integration by calling a lib method')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Expected: 34')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Received: 14')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Message: expected \'14\' to equal \'34\'')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Passed: 0')
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Failed: 1')
  },
  'Should print hardhat logs #group4': function (browser: NightwatchBrowser) {
    browser
      .addFile('printHardhatlog.sol', { content: hardhatLog })
      .clickLaunchIcon('solidity')
      .click('*[data-id="terminalClearConsole"]') // clear the terminal
      .waitForElementVisible('[for="autoCompile"]')
      .click('[for="autoCompile"]')
      .clickLaunchIcon('udapp')
      .verifyContracts(['OwnerTest'])
      .clickLaunchIcon('udapp')
      .click('*[data-id="deployAndRunClearInstances"]')
      .selectContract('OwnerTest')
      .createContract('')
      .pause(1000)
      .journalChildIncludes('constructor', { shouldHaveOnlyOneOccurrence: true })
      .pause(5000)
      .click('*[data-id="terminalClearConsole"]') // clear the terminal
      .clickInstance(0)
      .clickFunction('changeOwner - transact (not payable)', { types: 'address newOwner', values: '0xd9145CCE52D386f254917e481eB44e9943F39138' })
      .pause(1000)
      .journalChildIncludes('inside changeOwner', { shouldHaveOnlyOneOccurrence: true })
      .clickFunction('getOwner - call')
      .pause(1000)
      .journalChildIncludes('inside getOwner', { shouldHaveOnlyOneOccurrence: true })
  },

  'Emit 2 similar events and check the filtering is done properly #group11': function (browser: NightwatchBrowser) {
    let addressRef: string
    browser
      .addFile('contracts/contract_with_event.sol', { content: contract_with_event })
      .pause(1000)
      .openFile('contracts/contract_with_event.sol')
      .clickLaunchIcon('solidity')
      .click('*[data-id="compilerContainerCompileBtn"]')
      .clickLaunchIcon('udapp')
      .selectContract('Example')
      .createContract('')
      .getAddressAtPosition(0, (address) => {
        addressRef = address
        browser.addFile('scripts/test_filtering_event.ts', { content: test_filtering_event.replace('<ADDRESS>', addressRef) })
          .executeScriptInTerminal('remix.execute(\'scripts/test_filtering_event.ts\')')
          .pause(1000)
          .waitForElementContainsText('*[data-id="terminalJournal"]', '1')
          .waitForElementContainsText('*[data-id="terminalJournal"]', 'true')
          .executeScriptInTerminal('remix.execute(\'scripts/test_filtering_event.ts\')') // re-emit the event
          .waitForElementContainsText('*[data-id="terminalJournal"]', '2')
          .waitForElementContainsText('*[data-id="terminalJournal"]', 'false')
      })

  },

  'Should display auto-complete menu #group4': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="terminalCli"]')
      .click('*[data-id="terminalCli"]')
      .sendKeys('*[data-id="terminalCliInput"]', 'remix.')
      .assert.visible('*[data-id="autoCompletePopUpAutoCompleteItem"]')
  },

  'Should run a script right after compilation #group6': function (browser: NightwatchBrowser) {
    browser
      .addFile('contracts/storage.sol', { content: scriptAutoExec.contract })
      .addFile('scripts/deploy_storage.js', { content: scriptAutoExec.script })
      .openFile('contracts/storage.sol')
      .sendKeys('body', [browser.Keys.CONTROL, browser.Keys.SHIFT, 's'])
      .journalLastChildIncludes('147')
  },

  'Should run a script which log transaction and block using web3.js and ethers #group7': function (browser: NightwatchBrowser) {
    if (runMasterTests)
      browser
        .clickLaunchIcon('udapp')
        .switchEnvironment('basic-http-provider')
        .waitForElementPresent('[data-id="basic-http-provider-modal-footer-ok-react"]')
        .execute(() => {
          (document.querySelector('*[data-id="basic-http-providerModalDialogContainer-react"] input[data-id="modalDialogCustomPromp"]') as any).focus()
        }, [], () => { })
        .setValue('[data-id="modalDialogCustomPromp"]', 'https://go.getblock.io/7fbe62b139884d2c9c1616ca0de8b5b2')
        .modalFooterOKClick('basic-http-provider')
        .clickLaunchIcon('filePanel')
        .openFile('README.txt')
        .addFile('scripts/log_tx_block.js', { content: scriptBlockAndTransaction })
        .pause(1000)
        .executeScriptInTerminal('remix.execute(\'scripts/log_tx_block.js\')')
        // check if the input of the transaction is being logged (web3 call)
        .waitForElementContainsText('*[data-id="terminalJournal"]', '0x2b0006fa00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004e9e0000000000000000000000000000000000000000000000000000000000004ea373ded44d6900b8b479935bee9c82176261653e334586e0fd282f569357c0777bd9d084474837ac94bf96f2e26590222a2b8e46545657c7cf06ce2833d267bd6f131b5b3fd36cb1ca3e07cf422224df0766d1a677bbdb7ee4cc0d634efa5367a302a94dac422a16b9b8d5c10fe0555924f8189f6b498bef507b1d32e7915bd4df184f51e6d79ae6a1b11d5745ce7d625cecc3bd0dc50af4f999ffb927225f5e5c019b499f5e1fdcbc70c45df61df76013d1b0d45cdf6a267dac1b4620c0db2efd251f6548509c9c69f5bd9d1ee38ac0df0c73be2774f7d2e1fb7ef5129010f29d091e3c48aed0f035fc29804c99927d33ff2a19ff526979355ac50b2542bc5d8f2d41e4f850d5981e0420807469e828b03173b96b757fbaeacda335e11b3ab8b02a48456fab35d41ca26abde751d5fca8ef5e7ba5295278b6e46ce2aab6c10b3d185a6137d3e5c28bb8dd3a797feaf35520fcb949ea074e1869e0011ef01f8162135e44bb797d3d6215ff74ffbee972c97264fc15d11c840e6a7e796dc1a418572f6dbcc842594a558e1a9e3cb7a159284e16fec758bbc303d13edc28fb6d8bb110c3a398e4ded1748da9854eb84679ad0c99bc59bea7956b521db3ed0a9057510cc11365858704989690f0d891af81b213b1f2e91e41e4998a467656eac87e7025ac2840c17f2b106df7d32a0139036bdf5d87344ca37e9ce770e0dbeb5e021d03a7d496a6695eb06d3de9258b43f3883ce155767962b52083504b19d6d609090a2f96e9724902bf1adbf57359ac1dda48a8ffe596b8d95cac1429378769a6ec2ff1c8a9c0bc343b0a6468f36696bfb202cde9f6cd5241b814096d777751b44f0cc2ac9e7ba142227e8d5f2dd8da62573953540da1abce82c59287b2f7a87a111851758c2505d8c1ded6c42a49fc5577451ee56126d2275da490baa645c3bcac0c31dabee7aa35e6cdffb56ac0d952c2583c6f50f906dfb96f5a98c49a5919031cff880bffbe371a50162a7bd0fa0398a5898eaf6ad6db868a7d807846a3592325bb4207d67ad96bac76435368962ba8944d0201c2f620fb29373a6f35c815d101af98111e9b4cc61e8ae77fc63ce375068328ec8d05b49486666fb0f756f99d2fe747c95b2a553965f304a324879393897315d310841f0a200cd156f6ca4ed2', 120000)
        // check if the logsBloom is being logged (web3 call)
        .waitForElementContainsText('*[data-id="terminalJournal"]', '0x0fbbd94c448fe6949f848380a1d145a974f386624b4b10aa40f9afb212b3ddeb', 120000) // hash of 4757766
        // check if the logsBloom is being logged (ethers.js call)
        .waitForElementContainsText('*[data-id="terminalJournal"]', '0x9db899cb75888a630ba50a1644c243b83d2eb38525eb828a06a5e8bb5663c0b0', 120000) // hash of 4757767
  },

  'Should listen on all transactions #group8': function (browser: NightwatchBrowser) {
    const url = 'http://127.0.0.1:8545'
    const identifier = 'Custom'
    browser
      .clickLaunchIcon('udapp') // connect to mainnet
      .connectToExternalHttpProvider(url, identifier)
      .openFile('contracts')
      .openFile('contracts/1_Storage.sol')
      .clickLaunchIcon('solidity')
      .click({
        selector: '*[data-id="compilerContainerCompileAndRunBtn"]',
      })
      .pause(10000)
      .waitForElementNotPresent({
        locateStrategy: 'xpath',
        selector: "//*[@class='remix_ui_terminal_log' and contains(.,'to:') and contains(.,'from:')]",
        timeout: 120000
      })
      .click({
        selector: '[data-id="listenNetworkCheckInput"]',
      }) // start to listen
      .click({
        selector: '*[data-id="compilerContainerCompileAndRunBtn"]',
      })
      .pause(10000)
      .findElements(
        {
          locateStrategy: 'xpath',
          selector: "//*[@class='remix_ui_terminal_log' and contains(.,'to:') and contains(.,'from:')]",
          timeout: 120000,
        }
        , async (result) => {
          if (Array.isArray(result.value) && result.value.length > 0) {
            console.log('Found ' + result.value.length + ' transactions')
            browser
              .click({
                selector: '[data-id="listenNetworkCheckInput"]',
              })
              .click({
                selector: '*[data-id="terminalClearConsole"]',
              })
              .click({
                selector: '*[data-id="compilerContainerCompileAndRunBtn"]',
              })
              .pause(10000)
              .waitForElementNotPresent({
                locateStrategy: 'xpath',
                selector: "//*[@class='remix_ui_terminal_log' and contains(.,'to:') and contains(.,'from:')]",
                timeout: 120000
              })
              .end()
          } else {
            browser
              .assert.fail('No transaction found')
              .end()
          }
        })
  },

  'Should connect to mainnet fork and run web3.eth.getCode in the terminal #group9': function (browser: NightwatchBrowser) {
    if (runMasterTests)
      browser
        .clickLaunchIcon('udapp')
        .switchEnvironment('vm-mainnet-fork')
        .click('*[data-id="runTabSelectAccount"]')
        .waitForElementPresent({
          locateStrategy: 'css selector',
          selector: '*[data-id="0xdD870fA1b7C4700F2BD7f44238821C26f7392148"]',
          timeout: 240000
        })
        .executeScriptInTerminal(`web3.eth.getCode('0x180587b00c8642e2c7ac3a758712d97e6f7bdcc7')`) // mainnet contract
        .waitForElementContainsText('*[data-id="terminalJournal"]', '0x608060405260043610601f5760003560e01c80635c60da1b14603157602b565b36602b576029605f565b005b6029605f565b348015603c57600080fd5b5060436097565b6040516001600160a01b03909116815260200160405180910390f35b609560917f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b60d1565b565b600060c97f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc546001600160a01b031690565b905090565b90565b3660008037600080366000845af43d6000803e80801560ef573d6000f35b3d6000fdfea2646970667358221220969dbb4b1d8aec2bb348e26488dc1a33b6bcf0190f567d161312ab7ca9193d8d64736f6c63430008110033', 120000)
        .click('*[data-id="terminalClearConsole"]')
  },

  'Should connect to the sepolia fork and run web3.eth.getCode in the terminal #group9': function (browser: NightwatchBrowser) {
    if (runMasterTests)
      browser
        .switchEnvironment('vm-custom-fork')
        .waitForElementVisible('[data-id="vm-custom-fork-modal-footer-ok-react"]')
        .execute(() => {
          (document.querySelector('*[data-id="vm-custom-forkModalDialogContainer-react"] input[data-id="CustomForkNodeUrl"]') as any).focus()
        }, [], () => { })
        .clearValue('*[data-id="CustomForkNodeUrl"]').pause(1000).setValue('*[data-id="CustomForkNodeUrl"]', 'https://go.getblock.io/7fbe62b139884d2c9c1616ca0de8b5b2')
        .execute(() => {
          (document.querySelector('*[data-id="vm-custom-forkModalDialogContainer-react"] input[data-id="CustomForkBlockNumber"]') as any).focus()
        }, [], () => { })
        .clearValue('*[data-id="CustomForkBlockNumber"]').setValue('*[data-id="CustomForkBlockNumber"]', 'latest')
        .execute(() => {
          (document.querySelector('*[data-id="vm-custom-forkModalDialogContainer-react"] input[data-id="CustomForkEvmType"]') as any).focus()
        }, [], () => { })
        .click('*[data-id="CustomForkEvmType"] [value="cancun"]')
        .pause(5000)
        .modalFooterOKClick('vm-custom-fork')
        .click('*[data-id="runTabSelectAccount"]')
        .waitForElementPresent({
          locateStrategy: 'css selector',
          selector: '*[data-id="0xdD870fA1b7C4700F2BD7f44238821C26f7392148"]',
          timeout: 240000
        })
        .pause(5000)
        .executeScriptInTerminal(`web3.eth.getCode('0x75F509A4eDA030470272DfBAf99A47D587E76709')`) // sepolia contract
        .waitForElementContainsText('*[data-id="terminalJournal"]', byteCodeInSepolia, 120000)
        .click('*[data-id="terminalClearConsole"]')
  },

  'Should run a free function while being connected to mainnet #group9': function (browser: NightwatchBrowser) {
    const script = `
    import "https://github.com/ensdomains/ens-contracts/blob/master/contracts/utils/NameEncoder.sol";
    import "hardhat/console.sol";

    abstract contract ENS {
        function resolver(bytes32 node) public virtual view returns (Resolver);
    }

    abstract contract Resolver {
        function addr(bytes32 node) public virtual view returns (address);
    }

    function resolveENS() view {
        // Same address for Mainnet and other networks;
        ENS ens = ENS(0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e);
        (,bytes32 node) = NameEncoder.dnsEncodeName("vitalik.eth");
        Resolver resolver = ens.resolver(node);
        console.log(resolver.addr(node));
    }
    `
    if (runMasterTests) {
      const path = "//*[@class='view-line' and contains(.,'resolveENS') and contains(.,'view')]//span//span[contains(.,'(')]"

      browser
        // .clickLaunchIcon('udapp')
        .switchEnvironment('vm-mainnet-fork')
        .clickLaunchIcon('filePanel')
        .addFile('test_mainnet.sol', { content: script })
        .waitForElementVisible('#editorView')
        .pause(10000) // the parser need to parse the code
        .useXpath()
        .scrollToLine(16)
        .click(path)
        .perform(function () {
          const actions = this.actions({ async: true });
          return actions
            .keyDown(this.Keys.SHIFT)
            .keyDown(this.Keys.ALT)
            .sendKeys('r')
        })
        .useCss()
        .waitForElementContainsText('*[data-id="terminalJournal"]', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 120000)
    }
  },

  'Should run free function which logs in the terminal #group10': function (browser: NightwatchBrowser) {
    const script = `import "hardhat/console.sol";

    function runSomething () view {
        console.log("test running free function");
    }
    `

    const path = "//*[@class='view-line' and contains(.,'runSomething') and contains(.,'view')]//span//span[contains(.,'(')]"
    browser
      .addFile('test.sol', { content: script })
      .waitForElementVisible('#editorView')
      .pause(10000) // the parser need to parse the code
      .useXpath()
      .scrollToLine(3)
      .click(path)
      .perform(function () {
        const actions = this.actions({ async: true });
        return actions
          .keyDown(this.Keys.SHIFT)
          .keyDown(this.Keys.ALT)
          .sendKeys('r')
      })
      .useCss()
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'test running free function', 120000)
  }
}

const asyncAwait = `
  var p = function () {
    return new Promise(function (resolve, reject)  {
        setTimeout(function ()  {
            resolve("Promise Resolved")
        }, 5000)
    })
  }

  var run = async () => {
    console.log('Waiting Promise')
    var result = await p()
    console.log('result - ', result)
  }

  run()
`

const asyncAwaitWithFileManagerAccess = `
  var p = function () {
    return new Promise(function (resolve, reject)  {
        setTimeout(function ()  {
            resolve("Promise Resolved")
        }, 0)
    })
  }

  var run = async () => {
    console.log('Waiting Promise')
    var result = await p()
    let text = await remix.call('fileManager', 'readFile', 'contracts/3_Ballot.sol')
    console.log('result - ', text)
  }

  run()
`

const resolveExternalUrlAndSave = `
(async () => {
  try {
      console.log('start')
      console.log(await remix.call('contentImport', 'resolveAndSave', 'https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol'))
  } catch (e) {
      console.log(e.message)
  }
})()
`

const resolveExternalUrlAndSaveToaPath = `
(async () => {
  try {
      console.log('start')
      console.log(await remix.call('contentImport', 'resolveAndSave', 'https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/extensions/ERC20Burnable.sol', 'github/newFile.sol'))
  } catch (e) {
      console.log(e.message)
  }
})()
`

const resolveUrl = `
(async () => {
  try {
      console.log('start')
      console.log(await remix.call('contentImport', 'resolveAndSave', 'contracts/3_Ballot.sol'))
  } catch (e) {
      console.log(e.message)
  }
})()
`

const deployWithEthersJs = `
// Right click on the script name and hit "Run" to execute
(async () => {
    try {
        console.log('Running deployWithEthers script...')

        const constructorArgs = []    // Put constructor args (if any) here for your contract

        // Note that the script needs the ABI which is generated from the compilation artifact.
        // Make sure contract is compiled and artifacts are generated
        const artifactsPath = 'artifacts/Owner.json' // Change this for different path

        const metadata = JSON.parse(await remix.call('fileManager', 'getFile', artifactsPath))
        // 'web3Provider' is a remix global variable object
        const signer = (new ethers.providers.Web3Provider(web3Provider)).getSigner()

        let factory = new ethers.ContractFactory(metadata.abi, metadata.data.bytecode.object, signer)

        let contract = await factory.deploy(...constructorArgs);

        console.log('Contract Address: ', contract.address);

        // The contract is NOT deployed yet; we must wait until it is mined
        await contract.deployed()
        console.log('Deployment successful.')

        contract.on('OwnerSet', (previousOwner, newOwner) => {
            console.log('previousOwner' , previousOwner)
            console.log('newOwner' , newOwner)
        })

        console.log('ok')
    } catch (e) {
        console.log(e.message)
    }
})()`

const storageMochaTests = `
const { expect } = require("chai");

describe("Storage with lib", function () {
  it("test initial value", async function () {
    // Make sure contract is compiled and artifacts are generated
    const metadata = JSON.parse(await remix.call('fileManager', 'getFile', 'artifacts/Storage.json'))
    const signer = (new ethers.providers.Web3Provider(web3Provider)).getSigner()
    let Storage = new ethers.ContractFactory(metadata.abi, metadata.data.bytecode.object, signer)
    let storage = await Storage.deploy();
    console.log('storage contract Address: ' + storage.address);
    await storage.deployed()
    expect((await storage.retrieve()).toNumber()).to.equal(0);
  });

  it("test updating and retrieving updated value", async function () {
    const metadata = JSON.parse(await remix.call('fileManager', 'getFile', 'artifacts/Storage.json'))
    const signer = (new ethers.providers.Web3Provider(web3Provider)).getSigner()
    let Storage = new ethers.ContractFactory(metadata.abi, metadata.data.bytecode.object, signer)
    let storage = await Storage.deploy();
    await storage.deployed()
    const setValue = await storage.store(56);
    await setValue.wait();
    expect((await storage.retrieve()).toNumber()).to.equal(56);
  });

  it("fail test updating and retrieving updated value", async function () {
    const metadata = JSON.parse(await remix.call('fileManager', 'getFile', 'artifacts/Storage.json'))
    const signer = (new ethers.providers.Web3Provider(web3Provider)).getSigner()
    let Storage = new ethers.ContractFactory(metadata.abi, metadata.data.bytecode.object, signer)
    let storage = await Storage.deploy();
    await storage.deployed()
    const setValue = await storage.store(56);
    await setValue.wait();
    expect((await storage.retrieve()).toNumber(), 'incorrect number').to.equal(55);
  });
});`

const storageWithLibContract = `
// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

library Lib {
    function test () public view returns (uint) {
        return 14;
    }
}
/**
 * @title Storage
 * @dev Store & retrieve value in a variable
 */
contract StorageWithLib {

    uint256 number;

    /**
     * @dev Store value in variable
     * @param num value to store
     */
    function store(uint256 num) public {
        number = num;
    }

    /**
     * @dev Return value
     * @return value of 'number'
     */
    function retrieve() public view returns (uint256){
        return number;
    }

    function getFromLib() public view returns (uint) {
        return Lib.test();
    }
}
`

const storageWithLibMochaTests = `
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Storage", function () {
    it("test library integration by calling a lib method", async function () {
        const metadataLib = JSON.parse(await remix.call('fileManager', 'readFile', 'artifacts/Lib.json'))
        console.log('deploying lib:')
        const artifactLib  = {
            contractName: 'Lib',
            sourceName: 'contracts/StorageWithLib.sol',
            abi: metadataLib.abi,
            bytecode: '0x' + metadataLib.data.bytecode.object,
            deployedBytecode:  '0x' + metadataLib.data.deployedBytecode.object,
            linkReferences: metadataLib.data.bytecode.linkReferences,
            deployedLinkReferences: metadataLib.data.deployedBytecode.linkReferences,
        }

        const optionsLib = {}
        const factoryLib = await ethers.getContractFactoryFromArtifact(artifactLib, optionsLib)
        const lib = await factoryLib.deploy();
        await lib.deployed()

        const metadata = JSON.parse(await remix.call('fileManager', 'readFile', 'artifacts/StorageWithLib.json'))
        const artifact  = {
            contractName: 'StorageWithLib',
            sourceName: 'contracts/StorageWithLib.sol',
            abi: metadata.abi,
            bytecode: metadata.data.bytecode.object,
            deployedBytecode:  '0x' + metadata.data.deployedBytecode.object,
            linkReferences: metadata.data.bytecode.linkReferences,
            deployedLinkReferences: metadata.data.deployedBytecode.linkReferences,
        }
        const options = {
            libraries: {
                'Lib': lib.address
            }
        }

        const factory = await ethers.getContractFactoryFromArtifact(artifact, options)
        const storage = await factory.deploy();
        await storage.deployed()
        const storeValue = await storage.store(333);
        await storeValue.wait();
        expect((await storage.getFromLib()).toString()).to.equal('34');
    });
});`

const hardhatLog = `
// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

import "hardhat/console.sol";

/**
 * @title Owner
 * @dev Set & change owner
 */
contract OwnerTest {

    address private owner;

    // event for EVM logging
    event OwnerSet(address indexed oldOwner, address indexed newOwner);

    // modifier to check if caller is owner
    modifier isOwner() {
        // If the first argument of 'require' evaluates to 'false', execution terminates and all
        // changes to the state and to Ether balances are reverted.
        // This used to consume all gas in old EVM versions, but not anymore.
        // It is often a good idea to use 'require' to check if functions are called correctly.
        // As a second argument, you can also provide an explanation about what went wrong.
        require(msg.sender == owner, "Caller is not owner");
        _;
    }

    /**
     * @dev Set contract deployer as owner
     */
    constructor() {
        console.log("constructor");
        owner = msg.sender; // 'msg.sender' is sender of current call, contract deployer for a constructor
        emit OwnerSet(address(0), owner);
    }

    /**
     * @dev Change owner
     * @param newOwner address of new owner
     */
    function changeOwner(address newOwner) public isOwner {
        console.log("inside changeOwner");
        emit OwnerSet(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @dev Return owner address
     * @return address of owner
     */
    function getOwner() external view returns (address) {
        console.log("inside getOwner");
        return owner;
    }
}`

const scriptAutoExec = {
  contract: `// SPDX-License-Identifier: GPL-3.0

  pragma solidity >=0.8.2 <0.9.0;

  library lib {
      function test () public view returns (uint) {

          return 147;
      }
  }

  /**
   * @title Storage
   * @dev Store & retrieve value in a variable
   * @custom:dev-run-script ./scripts/deploy_storage.js
   */
  contract Storage {

      uint256 number;

      /**
       * @dev Store value in variable
       * @param num value to store
       */
      function store(uint256 num) public {
          number = num;
      }

      /**
       * @dev Return value
       * @return value of 'number'
       */
      function retrieve() public view returns (uint256){
          return number;
      }

      function getFromLib() public view returns (uint) {
          return lib.test();
      }
  }
  `,
  script: `
  // Right click on the script name and hit "Run" to execute
  const { expect } = require("chai");
  const { ethers } = require("hardhat");

  (async () => {
      try {
          // function getContractFactoryFromArtifact(artifact: Artifact, signer?: ethers.Signer): Promise<ethers.ContractFactory>;

          // function getContractFactoryFromArtifact(artifact: Artifact, factoryOptions: FactoryOptions): Promise<ethers.ContractFactory>;

          const metadataLib = JSON.parse(await remix.call('fileManager', 'readFile', 'artifacts/lib.json'))
          console.log('deploying lib:')

          const artifactLib  = {
              contractName: 'Lib',
              sourceName: 'contracts/1_Storage.sol',
              abi: metadataLib.abi,
              bytecode: metadataLib.data.bytecode.object,
              deployedBytecode:  '0x' + metadataLib.data.deployedBytecode.object,
              linkReferences: metadataLib.data.bytecode.linkReferences,
              deployedLinkReferences: metadataLib.data.deployedBytecode.linkReferences,
          }
          const optionsLib = {}

          const factoryLib = await ethers.getContractFactoryFromArtifact(artifactLib, optionsLib)

          const lib = await factoryLib.deploy();

          await lib.deployed()

          console.log('lib deployed', lib.address)

          const metadata = JSON.parse(await remix.call('fileManager', 'readFile', 'artifacts/Storage.json'))
          const artifact  = {
              contractName: 'Storage',
              sourceName: 'contracts/1_Storage.sol',
              abi: metadata.abi,
              bytecode: metadata.data.bytecode.object,
              deployedBytecode:  '0x' + metadata.data.deployedBytecode.object,
              linkReferences: metadata.data.bytecode.linkReferences,
              deployedLinkReferences: metadata.data.deployedBytecode.linkReferences,
          }
          const options = {
              libraries: {
                  'lib': lib.address
              }
          }

          const factory = await ethers.getContractFactoryFromArtifact(artifact, options)

          const storage = await factory.deploy();

          await storage.deployed()

          const storeValue = await storage.store(333);

          // wait until the transaction is mined
          await storeValue.wait();

          console.log((await storage.getFromLib()).toString())
          // expect((await storage.getFromLib()).toString()).to.equal('34');

      } catch (e) {
          console.error(e.message)
      }
    })()
  `
}

const scriptBlockAndTransaction = `
// Right click on the script name and hit "Run" to execute
(async () => {
    try {
      web3.eth.getTransaction('0x0d2baaed96425861677e87dcf6961d34e2b73ad9a0929c32a05607ca94f98d17').then(console.log).catch(console.error)
      web3.eth.getBlock(4757766).then(console.log).catch(console.error)
      let ethersProvider = new ethers.providers.Web3Provider(web3Provider)
      ethersProvider.getBlock(4757767).then(console.log).catch(console.error)
    } catch (e) {
        console.log(e.message)
    }
})()
`

const contract_with_event = `
// SPDX-License-Identifier: MIT

pragma solidity >=0.8.2 <0.9.0;

contract Example {
    event TextMessage(address indexed, string);

    function broadcastText(string calldata text, address dest) external {
        emit TextMessage(dest, text);
    }
}
`

const test_filtering_event = `
import { ethers } from 'ethers' // the version is v^5

const test = async (accountIndex?: number) => {
    const signer = (new ethers.providers.Web3Provider(web3Provider)).getSigner(accountIndex)
    const contract = new ethers.Contract(contractAddr, contractABI, signer)
    await Promise.all(dest.map(a => contract.broadcastText('hi!', a))) // here emit 2 logs with unique address
    const filter = contract.filters.TextMessage(dest[1]) // here request one address

    const logs = await contract.queryFilter(filter)
    console.log(logs.length, logs.length === 1) // expected one, but actually two
}

const contractAddr = '<ADDRESS>'
const contractABI = [
    'event TextMessage(address indexed, string)',
    'function broadcastText(string text, address dest)',
]

const dest = [
    '0x27b07C05B74c45C8EBfc970aeF6B32180065e801',
    '0xF2404a336381b2138b8D573e7F6b80445cc5F024',
]

test()
`

const byteCodeInSepolia = `0x6080604052600436106102ae5760003560e01c80637edb2c8111610175578063ba1842c5116100dc578063d2241c2711610095578063f2fde38b1161006f578063f2fde38b14610ab2578063f31b5b3314610adb578063f5839de114610af7578063f69b1b2914610b13576102ae565b8063d2241c2714610a21578063d5abeb0114610a4a578063e985e9c514610a75576102ae565b8063ba1842c5146108fd578063ba70e07514610926578063bd32fb6614610951578063c062977d1461097a578063c7eb4522146109bb578063c87b56dd146109e4576102ae565b8063a0bcfc7f1161012e578063a0bcfc7f14610803578063a22cb4651461082c578063aa98e0c614610855578063b37ee32814610880578063b61aa0e214610897578063b88d4fde146108d4576102ae565b80637edb2c811461070757806383b043e8146107305780638da5cb5b14610759578063938e15d51461078457806395d89b41146107ad5780639abc8320146107d8576102ae565b806342966c68116102195780636c302394116101d25780636c302394146105e75780636f8b44b01461062457806370a082311461064d578063715018a61461068a57806375fea21b146106a15780637696e088146106de576102ae565b806342966c68146104b5578063438b6300146104de578063451cadf61461051b578063474ffc47146105445780634f6ccce71461056d5780636352211e146105aa576102ae565b806318160ddd1161026b57806318160ddd146103c857806323b872dd146103f35780632f745c591461041c5780633ca81826146104595780633ccfd60b1461047557806342842e0e1461048c576102ae565b806301ffc9a7146102b357806306fdde03146102f0578063078a4cae1461031b578063081812fc14610337578063095ea7b314610374578063160e84321461039d575b600080fd5b3480156102bf57600080fd5b506102da60048036038101906102d59190613f85565b610b3e565b6040516102e79190613fcd565b60405180910390f35b3480156102fc57600080fd5b50610305610b50565b6040516103129190614078565b60405180910390f35b61033560048036038101906103309190614135565b610be2565b005b34801561034357600080fd5b5061035e60048036038101906103599190614195565b610ef5565b60405161036b9190614203565b60405180910390f35b34801561038057600080fd5b5061039b6004803603810190610396919061424a565b610f3b565b005b3480156103a957600080fd5b506103b2611052565b6040516103bf91906142a3565b60405180910390f35b3480156103d457600080fd5b506103dd611058565b6040516103ea91906142cd565b60405180910390f35b3480156103ff57600080fd5b5061041a600480360381019061041591906142e8565b611065565b005b34801561042857600080fd5b50610443600480360381019061043e919061424a565b6110c5565b60405161045091906142cd565b60405180910390f35b610473600480360381019061046e9190614135565b61116a565b005b34801561048157600080fd5b5061048a61147e565b005b34801561049857600080fd5b506104b360048036038101906104ae91906142e8565b611521565b005b3480156104c157600080fd5b506104dc60048036038101906104d79190614195565b611541565b005b3480156104ea57600080fd5b506105056004803603810190610500919061433b565b6115da565b6040516105129190614426565b60405180910390f35b34801561052757600080fd5b50610542600480360381019061053d9190614586565b611688565b005b34801561055057600080fd5b5061056b600480360381019061056691906145e2565b61177e565b005b34801561057957600080fd5b50610594600480360381019061058f9190614195565b6117a5565b6040516105a191906142cd565b60405180910390f35b3480156105b657600080fd5b506105d160048036038101906105cc9190614195565b611816565b6040516105de9190614203565b60405180910390f35b3480156105f357600080fd5b5061060e6004803603810190610609919061433b565b61189c565b60405161061b9190613fcd565b60405180910390f35b34801561063057600080fd5b5061064b60048036038101906106469190614195565b611946565b005b34801561065957600080fd5b50610674600480360381019061066f919061433b565b611958565b60405161068191906142cd565b60405180910390f35b34801561069657600080fd5b5061069f611a0f565b005b3480156106ad57600080fd5b506106c860048036038101906106c39190614195565b611a23565b6040516106d59190614203565b60405180910390f35b3480156106ea57600080fd5b50610705600480360381019061070091906145e2565b611a62565b005b34801561071357600080fd5b5061072e600480360381019061072991906145e2565b611a89565b005b34801561073c57600080fd5b506107576004803603810190610752919061464e565b611ab0565b005b34801561076557600080fd5b5061076e611ac2565b60405161077b9190614203565b60405180910390f35b34801561079057600080fd5b506107ab60048036038101906107a69190614730565b611aec565b005b3480156107b957600080fd5b506107c2611b8c565b6040516107cf9190614078565b60405180910390f35b3480156107e457600080fd5b506107ed611c1e565b6040516107fa9190614078565b60405180910390f35b34801561080f57600080fd5b5061082a600480360381019061082591906147d9565b611cac565b005b34801561083857600080fd5b50610853600480360381019061084e919061484e565b611cc7565b005b34801561086157600080fd5b5061086a611cdd565b60405161087791906142a3565b60405180910390f35b34801561088c57600080fd5b50610895611ce3565b005b3480156108a357600080fd5b506108be60048036038101906108b9919061433b565b611cfb565b6040516108cb91906142cd565b60405180910390f35b3480156108e057600080fd5b506108fb60048036038101906108f6919061492f565b611d13565b005b34801561090957600080fd5b50610924600480360381019061091f91906145e2565b611d75565b005b34801561093257600080fd5b5061093b611d9c565b60405161094891906142a3565b60405180910390f35b34801561095d57600080fd5b506109786004803603810190610973919061464e565b611da2565b005b34801561098657600080fd5b506109a1600480360381019061099c9190614195565b611db4565b6040516109b29594939291906149b2565b60405180910390f35b3480156109c757600080fd5b506109e260048036038101906109dd919061433b565b611e72565b005b3480156109f057600080fd5b50610a0b6004803603810190610a069190614195565b611ebe565b604051610a189190614078565b60405180910390f35b348015610a2d57600080fd5b50610a486004803603810190610a43919061464e565b611f26565b005b348015610a5657600080fd5b50610a5f611f38565b604051610a6c91906142cd565b60405180910390f35b348015610a8157600080fd5b50610a9c6004803603810190610a979190614a0c565b611f3e565b604051610aa99190613fcd565b60405180910390f35b348015610abe57600080fd5b50610ad96004803603810190610ad4919061433b565b611fd2565b005b610af56004803603810190610af09190614195565b612055565b005b610b116004803603810190610b0c9190614135565b6122d3565b005b348015610b1f57600080fd5b50610b286125e7565b604051610b359190614203565b60405180910390f35b6000610b498261260d565b9050919050565b606060008054610b5f90614a7b565b80601f0160208091040260200160405190810160405280929190818152602001828054610b8b90614a7b565b8015610bd85780601f10610bad57610100808354040283529160200191610bd8565b820191906000526020600020905b815481529060010190602001808311610bbb57829003601f168201915b5050505050905090565b8282600e54610c59838380806020026020016040519081016040528093929190818152602001838360200280828437600081840152601f19601f820116905080830192505050505050508233604051602001610c3e9190614af4565b60405160208183030381529060405280519060200120612687565b610c98576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610c8f90614b81565b60405180910390fd5b610ca13361189c565b15610ce1576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610cd890614bed565b60405180910390fd5b600084600d5481610cf0611058565b610cfa9190614c3c565b1115610d3b576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610d3290614cbc565b60405180910390fd5b600081118015610d61575060116000838152602001908152602001600020600201548111155b610da0576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610d9790614d28565b60405180910390fd5b42601160008481526020019081526020016000206003015411158015610ddb5750426011600084815260200190815260200160002060040154115b610e1a576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610e1190614d94565b60405180910390fd5b856011600080815260200190815260200160002060010154610e3c9190614db4565b341015610e7e576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610e7590614e42565b60405180910390fd5b610e88338761269e565b6014339080600181540180825580915050600190039060005260206000200160009091909190916101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505050505050505050565b6000610f00826126de565b6004600083815260200190815260200160002060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff169050919050565b6000610f4682611816565b90508073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff1603610fb6576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610fad90614ed4565b60405180910390fd5b8073ffffffffffffffffffffffffffffffffffffffff16610fd5612729565b73ffffffffffffffffffffffffffffffffffffffff161480611004575061100381610ffe612729565b611f3e565b5b611043576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161103a90614f66565b60405180910390fd5b61104d8383612731565b505050565b600e5481565b6000600880549050905090565b611076611070612729565b826127ea565b6110b5576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016110ac90614ff8565b60405180910390fd5b6110c083838361287f565b505050565b60006110d083611958565b8210611111576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016111089061508a565b60405180910390fd5b600660008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600083815260200190815260200160002054905092915050565b82826010546111e1838380806020026020016040519081016040528093929190818152602001838360200280828437600081840152601f19601f8201169050808301925050505050505082336040516020016111c69190614af4565b60405160208183030381529060405280519060200120612687565b611220576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161121790614b81565b60405180910390fd5b6112293361189c565b15611269576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161126090614bed565b60405180910390fd5b600284600d5481611278611058565b6112829190614c3c565b11156112c3576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016112ba90614cbc565b60405180910390fd5b6000811180156112e9575060116000838152602001908152602001600020600201548111155b611328576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161131f90614d28565b60405180910390fd5b426011600084815260200190815260200160002060030154111580156113635750426011600084815260200190815260200160002060040154115b6113a2576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161139990614d94565b60405180910390fd5b856011600060028152602001908152602001600020600101546113c59190614db4565b341015611407576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016113fe90614e42565b60405180910390fd5b611411338761269e565b6014339080600181540180825580915050600190039060005260206000200160009091909190916101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505050505050505050565b611486612b78565b6000601360009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16476040516114ce906150db565b60006040518083038185875af1925050503d806000811461150b576040519150601f19603f3d011682016040523d82523d6000602084013e611510565b606091505b505090508061151e57600080fd5b50565b61153c83838360405180602001604052806000815250611d13565b505050565b61155261154c612729565b826127ea565b8061158f5750611560611ac2565b73ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16145b6115ce576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016115c590614ff8565b60405180910390fd5b6115d781612bf6565b50565b606060006115e783611958565b905060008167ffffffffffffffff81111561160557611604614448565b5b6040519080825280602002602001820160405280156116335781602001602082028036833780820191505090505b50905060005b8281101561167d5761164b85826110c5565b82828151811061165e5761165d6150f0565b5b60200260200101818152505080806116759061511f565b915050611639565b508092505050919050565b611690612b78565b600d548151836116a09190614db4565b6116a8611058565b6116b29190614c3c565b11156116f3576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016116ea90614cbc565b60405180910390fd5b60008211611736576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161172d90614d28565b60405180910390fd5b60005b815181101561177957611766828281518110611758576117576150f0565b5b60200260200101518461269e565b80806117719061511f565b915050611739565b505050565b611786612b78565b8060116000848152602001908152602001600020600401819055505050565b60006117af611058565b82106117f0576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016117e7906151d9565b60405180910390fd5b60088281548110611804576118036150f0565b5b90600052602060002001549050919050565b60008061182283612d44565b9050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1603611893576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161188a90615245565b60405180910390fd5b80915050919050565b6000805b60148054905081101561193b578273ffffffffffffffffffffffffffffffffffffffff16601482815481106118d8576118d76150f0565b5b9060005260206000200160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1603611928576001915050611941565b80806119339061511f565b9150506118a0565b50600090505b919050565b61194e612b78565b80600d8190555050565b60008073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff16036119c8576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016119bf906152d7565b60405180910390fd5b600360008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b611a17612b78565b611a216000612d81565b565b60148181548110611a3357600080fd5b906000526020600020016000915054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b611a6a612b78565b8060116000848152602001908152602001600020600101819055505050565b611a91612b78565b8060116000848152602001908152602001600020600301819055505050565b611ab8612b78565b8060108190555050565b6000600a60009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b611af4612b78565b84601160008881526020019081526020016000206000019081611b1791906154a3565b50836011600088815260200190815260200160002060010181905550826011600088815260200190815260200160002060020181905550816011600088815260200190815260200160002060030181905550806011600088815260200190815260200160002060040181905550505050505050565b606060018054611b9b90614a7b565b80601f0160208091040260200160405190810160405280929190818152602001828054611bc790614a7b565b8015611c145780601f10611be957610100808354040283529160200191611c14565b820191906000526020600020905b815481529060010190602001808311611bf757829003601f168201915b5050505050905090565b600c8054611c2b90614a7b565b80601f0160208091040260200160405190810160405280929190818152602001828054611c5790614a7b565b8015611ca45780601f10611c7957610100808354040283529160200191611ca4565b820191906000526020600020905b815481529060010190602001808311611c8757829003601f168201915b505050505081565b611cb4612b78565b80600c9081611cc391906154a3565b5050565b611cd9611cd2612729565b8383612e47565b5050565b600f5481565b611ceb612b78565b60146000611cf99190613edb565b565b60126020528060005260406000206000915090505481565b611d24611d1e612729565b836127ea565b611d63576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401611d5a90614ff8565b60405180910390fd5b611d6f84848484612fb3565b50505050565b611d7d612b78565b8060116000848152602001908152602001600020600201819055505050565b60105481565b611daa612b78565b80600f8190555050565b6011602052806000526040600020600091509050806000018054611dd790614a7b565b80601f0160208091040260200160405190810160405280929190818152602001828054611e0390614a7b565b8015611e505780601f10611e2557610100808354040283529160200191611e50565b820191906000526020600020905b815481529060010190602001808311611e3357829003601f168201915b5050505050908060010154908060020154908060030154908060040154905085565b611e7a612b78565b80601360006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050565b6060611ec9826126de565b6000611ed361300f565b90506000815111611ef35760405180602001604052806000815250611f1e565b80611efd846130a1565b604051602001611f0e9291906155b1565b6040516020818303038152906040525b915050919050565b611f2e612b78565b80600e8190555050565b600d5481565b6000600560008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff16905092915050565b611fda612b78565b600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1603612049576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161204090615647565b60405180910390fd5b61205281612d81565b50565b600381600d5481612064611058565b61206e9190614c3c565b11156120af576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016120a690614cbc565b60405180910390fd5b6000811180156120d5575060116000838152602001908152602001600020600201548111155b612114576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161210b90614d28565b60405180910390fd5b4260116000848152602001908152602001600020600301541115801561214f5750426011600084815260200190815260200160002060040154115b61218e576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161218590614d94565b60405180910390fd5b42600f601260003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020546121db9190614c3c565b1061221b576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401612212906156b3565b60405180910390fd5b8260116000600381526020019081526020016000206001015461223e9190614db4565b341015612280576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161227790614e42565b60405180910390fd5b61228a338461269e565b42601260003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002081905550505050565b8282600f5461234a838380806020026020016040519081016040528093929190818152602001838360200280828437600081840152601f19601f82011690508083019250505050505050823360405160200161232f9190614af4565b60405160208183030381529060405280519060200120612687565b612389576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161238090614b81565b60405180910390fd5b6123923361189c565b156123d2576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016123c990614bed565b60405180910390fd5b600184600d54816123e1611058565b6123eb9190614c3c565b111561242c576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161242390614cbc565b60405180910390fd5b600081118015612452575060116000838152602001908152602001600020600201548111155b612491576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161248890614d28565b60405180910390fd5b426011600084815260200190815260200160002060030154111580156124cc5750426011600084815260200190815260200160002060040154115b61250b576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161250290614d94565b60405180910390fd5b8560116000600181526020019081526020016000206001015461252e9190614db4565b341015612570576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161256790614e42565b60405180910390fd5b61257a338761269e565b6014339080600181540180825580915050600190039060005260206000200160009091909190916101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505050505050505050565b601360009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b60007f780e9d63000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19161480612680575061267f8261316f565b5b9050919050565b6000826126948584613251565b1490509392505050565b60005b818110156126d9576126b3600b6132a7565b6126c6836126c1600b6132bd565b6132cb565b80806126d19061511f565b9150506126a1565b505050565b6126e7816132e9565b612726576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161271d90615245565b60405180910390fd5b50565b600033905090565b816004600083815260200190815260200160002060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550808273ffffffffffffffffffffffffffffffffffffffff166127a483611816565b73ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92560405160405180910390a45050565b6000806127f683611816565b90508073ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff16148061283857506128378185611f3e565b5b8061287657508373ffffffffffffffffffffffffffffffffffffffff1661285e84610ef5565b73ffffffffffffffffffffffffffffffffffffffff16145b91505092915050565b8273ffffffffffffffffffffffffffffffffffffffff1661289f82611816565b73ffffffffffffffffffffffffffffffffffffffff16146128f5576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016128ec90615745565b60405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1603612964576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161295b906157d7565b60405180910390fd5b612971838383600161332a565b8273ffffffffffffffffffffffffffffffffffffffff1661299182611816565b73ffffffffffffffffffffffffffffffffffffffff16146129e7576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016129de90615745565b60405180910390fd5b6004600082815260200190815260200160002060006101000a81549073ffffffffffffffffffffffffffffffffffffffff02191690556001600360008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055506001600360008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282540192505081905550816002600083815260200190815260200160002060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550808273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef60405160405180910390a4612b738383836001613488565b505050565b612b80612729565b73ffffffffffffffffffffffffffffffffffffffff16612b9e611ac2565b73ffffffffffffffffffffffffffffffffffffffff1614612bf4576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401612beb90615843565b60405180910390fd5b565b6000612c0182611816565b9050612c1181600084600161332a565b612c1a82611816565b90506004600083815260200190815260200160002060006101000a81549073ffffffffffffffffffffffffffffffffffffffff02191690556001600360008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055506002600083815260200190815260200160002060006101000a81549073ffffffffffffffffffffffffffffffffffffffff021916905581600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef60405160405180910390a4612d40816000846001613488565b5050565b60006002600083815260200190815260200160002060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff169050919050565b6000600a60009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905081600a60006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055508173ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a35050565b8173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff1603612eb5576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401612eac906158af565b60405180910390fd5b80600560008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060006101000a81548160ff0219169083151502179055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167f17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c3183604051612fa69190613fcd565b60405180910390a3505050565b612fbe84848461287f565b612fca8484848461348e565b613009576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161300090615941565b60405180910390fd5b50505050565b6060600c805461301e90614a7b565b80601f016020809104026020016040519081016040528092919081815260200182805461304a90614a7b565b80156130975780601f1061306c57610100808354040283529160200191613097565b820191906000526020600020905b81548152906001019060200180831161307a57829003601f168201915b5050505050905090565b6060600060016130b084613615565b01905060008167ffffffffffffffff8111156130cf576130ce614448565b5b6040519080825280601f01601f1916602001820160405280156131015781602001600182028036833780820191505090505b509050600082602001820190505b600115613164578080600190039150507f3031323334353637383961626364656600000000000000000000000000000000600a86061a8153600a858161315857613157615961565b5b0494506000850361310f575b819350505050919050565b60007f80ac58cd000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916148061323a57507f5b5e139f000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916145b8061324a575061324982613768565b5b9050919050565b60008082905060005b845181101561329c576132878286838151811061327a576132796150f0565b5b60200260200101516137d2565b915080806132949061511f565b91505061325a565b508091505092915050565b6001816000016000828254019250508190555050565b600081600001549050919050565b6132e58282604051806020016040528060008152506137fd565b5050565b60008073ffffffffffffffffffffffffffffffffffffffff1661330b83612d44565b73ffffffffffffffffffffffffffffffffffffffff1614159050919050565b61333684848484613858565b600181111561337a576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161337190615a02565b60405180910390fd5b6000829050600073ffffffffffffffffffffffffffffffffffffffff168573ffffffffffffffffffffffffffffffffffffffff16036133c1576133bc8161397e565b613400565b8373ffffffffffffffffffffffffffffffffffffffff168573ffffffffffffffffffffffffffffffffffffffff16146133ff576133fe85826139c7565b5b5b600073ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff16036134425761343d81613b34565b613481565b8473ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff16146134805761347f8482613c05565b5b5b5050505050565b50505050565b60006134af8473ffffffffffffffffffffffffffffffffffffffff16613c84565b15613608578373ffffffffffffffffffffffffffffffffffffffff1663150b7a026134d8612729565b8786866040518563ffffffff1660e01b81526004016134fa9493929190615a77565b6020604051808303816000875af192505050801561353657506040513d601f19601f820116820180604052508101906135339190615ad8565b60015b6135b8573d8060008114613566576040519150601f19603f3d011682016040523d82523d6000602084013e61356b565b606091505b5060008151036135b0576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016135a790615941565b60405180910390fd5b805181602001fd5b63150b7a0260e01b7bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916817bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19161491505061360d565b600190505b949350505050565b600080600090507a184f03e93ff9f4daa797ed6e38ed64bf6a1f0100000000000000008310613673577a184f03e93ff9f4daa797ed6e38ed64bf6a1f010000000000000000838161366957613668615961565b5b0492506040810190505b6d04ee2d6d415b85acef810000000083106136b0576d04ee2d6d415b85acef810000000083816136a6576136a5615961565b5b0492506020810190505b662386f26fc1000083106136df57662386f26fc1000083816136d5576136d4615961565b5b0492506010810190505b6305f5e1008310613708576305f5e10083816136fe576136fd615961565b5b0492506008810190505b612710831061372d57612710838161372357613722615961565b5b0492506004810190505b60648310613750576064838161374657613745615961565b5b0492506002810190505b600a831061375f576001810190505b80915050919050565b60007f01ffc9a7000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916827bffffffffffffffffffffffffffffffffffffffffffffffffffffffff1916149050919050565b60008183106137ea576137e58284613ca7565b6137f5565b6137f48383613ca7565b5b905092915050565b6138078383613cbe565b613814600084848461348e565b613853576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161384a90615941565b60405180910390fd5b505050565b600181111561397857600073ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff16146138ec5780600360008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282546138e49190615b05565b925050819055505b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff16146139775780600360008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825461396f9190614c3c565b925050819055505b5b50505050565b6008805490506009600083815260200190815260200160002081905550600881908060018154018082558091505060019003906000526020600020016000909190919091505550565b600060016139d484611958565b6139de9190615b05565b9050600060076000848152602001908152602001600020549050818114613ac3576000600660008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600084815260200190815260200160002054905080600660008773ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600084815260200190815260200160002081905550816007600083815260200190815260200160002081905550505b6007600084815260200190815260200160002060009055600660008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008381526020019081526020016000206000905550505050565b60006001600880549050613b489190615b05565b9050600060096000848152602001908152602001600020549050600060088381548110613b7857613b776150f0565b5b906000526020600020015490508060088381548110613b9a57613b996150f0565b5b906000526020600020018190555081600960008381526020019081526020016000208190555060096000858152602001908152602001600020600090556008805480613be957613be8615b39565b5b6001900381819060005260206000200160009055905550505050565b6000613c1083611958565b905081600660008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600083815260200190815260200160002081905550806007600084815260200190815260200160002081905550505050565b6000808273ffffffffffffffffffffffffffffffffffffffff163b119050919050565b600082600052816020526040600020905092915050565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1603613d2d576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401613d2490615bb4565b60405180910390fd5b613d36816132e9565b15613d76576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401613d6d90615c20565b60405180910390fd5b613d8460008383600161332a565b613d8d816132e9565b15613dcd576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401613dc490615c20565b60405180910390fd5b6001600360008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282540192505081905550816002600083815260200190815260200160002060006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550808273ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef60405160405180910390a4613ed7600083836001613488565b5050565b5080546000825590600052602060002090810190613ef99190613efc565b50565b5b80821115613f15576000816000905550600101613efd565b5090565b6000604051905090565b600080fd5b600080fd5b60007fffffffff0000000000000000000000000000000000000000000000000000000082169050919050565b613f6281613f2d565b8114613f6d57600080fd5b50565b600081359050613f7f81613f59565b92915050565b600060208284031215613f9b57613f9a613f23565b5b6000613fa984828501613f70565b91505092915050565b60008115159050919050565b613fc781613fb2565b82525050565b6000602082019050613fe26000830184613fbe565b92915050565b600081519050919050565b600082825260208201905092915050565b60005b83811015614022578082015181840152602081019050614007565b60008484015250505050565b6000601f19601f8301169050919050565b600061404a82613fe8565b6140548185613ff3565b9350614064818560208601614004565b61406d8161402e565b840191505092915050565b60006020820190508181036000830152614092818461403f565b905092915050565b600080fd5b600080fd5b600080fd5b60008083601f8401126140bf576140be61409a565b5b8235905067ffffffffffffffff8111156140dc576140db61409f565b5b6020830191508360208202830111156140f8576140f76140a4565b5b9250929050565b6000819050919050565b614112816140ff565b811461411d57600080fd5b50565b60008135905061412f81614109565b92915050565b60008060006040848603121561414e5761414d613f23565b5b600084013567ffffffffffffffff81111561416c5761416b613f28565b5b614178868287016140a9565b9350935050602061418b86828701614120565b9150509250925092565b6000602082840312156141ab576141aa613f23565b5b60006141b984828501614120565b91505092915050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006141ed826141c2565b9050919050565b6141fd816141e2565b82525050565b600060208201905061421860008301846141f4565b92915050565b614227816141e2565b811461423257600080fd5b50565b6000813590506142448161421e565b92915050565b6000806040838503121561426157614260613f23565b5b600061426f85828601614235565b925050602061428085828601614120565b9150509250929050565b6000819050919050565b61429d8161428a565b82525050565b60006020820190506142b86000830184614294565b92915050565b6142c7816140ff565b82525050565b60006020820190506142e260008301846142be565b92915050565b60008060006060848603121561430157614300613f23565b5b600061430f86828701614235565b935050602061432086828701614235565b925050604061433186828701614120565b9150509250925092565b60006020828403121561435157614350613f23565b5b600061435f84828501614235565b91505092915050565b600081519050919050565b600082825260208201905092915050565b6000819050602082019050919050565b61439d816140ff565b82525050565b60006143af8383614394565b60208301905092915050565b6000602082019050919050565b60006143d382614368565b6143dd8185614373565b93506143e883614384565b8060005b8381101561441957815161440088826143a3565b975061440b836143bb565b9250506001810190506143ec565b5085935050505092915050565b6000602082019050818103600083015261444081846143c8565b905092915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b6144808261402e565b810181811067ffffffffffffffff8211171561449f5761449e614448565b5b80604052505050565b60006144b2613f19565b90506144be8282614477565b919050565b600067ffffffffffffffff8211156144de576144dd614448565b5b602082029050602081019050919050565b60006145026144fd846144c3565b6144a8565b90508083825260208201905060208402830185811115614525576145246140a4565b5b835b8181101561454e578061453a8882614235565b845260208401935050602081019050614527565b5050509392505050565b600082601f83011261456d5761456c61409a565b5b813561457d8482602086016144ef565b91505092915050565b6000806040838503121561459d5761459c613f23565b5b60006145ab85828601614120565b925050602083013567ffffffffffffffff8111156145cc576145cb613f28565b5b6145d885828601614558565b9150509250929050565b600080604083850312156145f9576145f8613f23565b5b600061460785828601614120565b925050602061461885828601614120565b9150509250929050565b61462b8161428a565b811461463657600080fd5b50565b60008135905061464881614622565b92915050565b60006020828403121561466457614663613f23565b5b600061467284828501614639565b91505092915050565b600080fd5b600067ffffffffffffffff82111561469b5761469a614448565b5b6146a48261402e565b9050602081019050919050565b82818337600083830152505050565b60006146d36146ce84614680565b6144a8565b9050828152602081018484840111156146ef576146ee61467b565b5b6146fa8482856146b1565b509392505050565b600082601f8301126147175761471661409a565b5b81356147278482602086016146c0565b91505092915050565b60008060008060008060c0878903121561474d5761474c613f23565b5b600061475b89828a01614120565b965050602087013567ffffffffffffffff81111561477c5761477b613f28565b5b61478889828a01614702565b955050604061479989828a01614120565b94505060606147aa89828a01614120565b93505060806147bb89828a01614120565b92505060a06147cc89828a01614120565b9150509295509295509295565b6000602082840312156147ef576147ee613f23565b5b600082013567ffffffffffffffff81111561480d5761480c613f28565b5b61481984828501614702565b91505092915050565b61482b81613fb2565b811461483657600080fd5b50565b60008135905061484881614822565b92915050565b6000806040838503121561486557614864613f23565b5b600061487385828601614235565b925050602061488485828601614839565b9150509250929050565b600067ffffffffffffffff8211156148a9576148a8614448565b5b6148b28261402e565b9050602081019050919050565b60006148d26148cd8461488e565b6144a8565b9050828152602081018484840111156148ee576148ed61467b565b5b6148f98482856146b1565b509392505050565b600082601f8301126149165761491561409a565b5b81356149268482602086016148bf565b91505092915050565b6000806000806080858703121561494957614948613f23565b5b600061495787828801614235565b945050602061496887828801614235565b935050604061497987828801614120565b925050606085013567ffffffffffffffff81111561499a57614999613f28565b5b6149a687828801614901565b91505092959194509250565b600060a08201905081810360008301526149cc818861403f565b90506149db60208301876142be565b6149e860408301866142be565b6149f560608301856142be565b614a0260808301846142be565b9695505050505050565b60008060408385031215614a2357614a22613f23565b5b6000614a3185828601614235565b9250506020614a4285828601614235565b9150509250929050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b60006002820490506001821680614a9357607f821691505b602082108103614aa657614aa5614a4c565b5b50919050565b60008160601b9050919050565b6000614ac482614aac565b9050919050565b6000614ad682614ab9565b9050919050565b614aee614ae9826141e2565b614acb565b82525050565b6000614b008284614add565b60148201915081905092915050565b7f4164647265737320646f6573206e6f7420657869737420696e204d696e746c6960008201527f7374210000000000000000000000000000000000000000000000000000000000602082015250565b6000614b6b602383613ff3565b9150614b7682614b0f565b604082019050919050565b60006020820190508181036000830152614b9a81614b5e565b9050919050565b7f416c65616479204d696e74656421000000000000000000000000000000000000600082015250565b6000614bd7600e83613ff3565b9150614be282614ba1565b602082019050919050565b60006020820190508181036000830152614c0681614bca565b9050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b6000614c47826140ff565b9150614c52836140ff565b9250828201905080821115614c6a57614c69614c0d565b5b92915050565b7f4d617820737570706c7920657863656564656421000000000000000000000000600082015250565b6000614ca6601483613ff3565b9150614cb182614c70565b602082019050919050565b60006020820190508181036000830152614cd581614c99565b9050919050565b7f496e76616c6964206d696e7420616d6f756e7421000000000000000000000000600082015250565b6000614d12601483613ff3565b9150614d1d82614cdc565b602082019050919050565b60006020820190508181036000830152614d4181614d05565b9050919050565b7f53616c6573206973206e6f742079657421000000000000000000000000000000600082015250565b6000614d7e601183613ff3565b9150614d8982614d48565b602082019050919050565b60006020820190508181036000830152614dad81614d71565b9050919050565b6000614dbf826140ff565b9150614dca836140ff565b9250828202614dd8816140ff565b91508282048414831517614def57614dee614c0d565b5b5092915050565b7f496e73756666696369656e742066756e64732100000000000000000000000000600082015250565b6000614e2c601383613ff3565b9150614e3782614df6565b602082019050919050565b60006020820190508181036000830152614e5b81614e1f565b9050919050565b7f4552433732313a20617070726f76616c20746f2063757272656e74206f776e6560008201527f7200000000000000000000000000000000000000000000000000000000000000602082015250565b6000614ebe602183613ff3565b9150614ec982614e62565b604082019050919050565b60006020820190508181036000830152614eed81614eb1565b9050919050565b7f4552433732313a20617070726f76652063616c6c6572206973206e6f7420746f60008201527f6b656e206f776e6572206f7220617070726f76656420666f7220616c6c000000602082015250565b6000614f50603d83613ff3565b9150614f5b82614ef4565b604082019050919050565b60006020820190508181036000830152614f7f81614f43565b9050919050565b7f4552433732313a2063616c6c6572206973206e6f7420746f6b656e206f776e6560008201527f72206f7220617070726f76656400000000000000000000000000000000000000602082015250565b6000614fe2602d83613ff3565b9150614fed82614f86565b604082019050919050565b6000602082019050818103600083015261501181614fd5565b9050919050565b7f455243373231456e756d657261626c653a206f776e657220696e646578206f7560008201527f74206f6620626f756e6473000000000000000000000000000000000000000000602082015250565b6000615074602b83613ff3565b915061507f82615018565b604082019050919050565b600060208201905081810360008301526150a381615067565b9050919050565b600081905092915050565b50565b60006150c56000836150aa565b91506150d0826150b5565b600082019050919050565b60006150e6826150b8565b9150819050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b600061512a826140ff565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff820361515c5761515b614c0d565b5b600182019050919050565b7f455243373231456e756d657261626c653a20676c6f62616c20696e646578206f60008201527f7574206f6620626f756e64730000000000000000000000000000000000000000602082015250565b60006151c3602c83613ff3565b91506151ce82615167565b604082019050919050565b600060208201905081810360008301526151f2816151b6565b9050919050565b7f4552433732313a20696e76616c696420746f6b656e2049440000000000000000600082015250565b600061522f601883613ff3565b915061523a826151f9565b602082019050919050565b6000602082019050818103600083015261525e81615222565b9050919050565b7f4552433732313a2061646472657373207a65726f206973206e6f74206120766160008201527f6c6964206f776e65720000000000000000000000000000000000000000000000602082015250565b60006152c1602983613ff3565b91506152cc82615265565b604082019050919050565b600060208201905081810360008301526152f0816152b4565b9050919050565b60008190508160005260206000209050919050565b60006020601f8301049050919050565b600082821b905092915050565b6000600883026153597fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8261531c565b615363868361531c565b95508019841693508086168417925050509392505050565b6000819050919050565b60006153a061539b615396846140ff565b61537b565b6140ff565b9050919050565b6000819050919050565b6153ba83615385565b6153ce6153c6826153a7565b848454615329565b825550505050565b600090565b6153e36153d6565b6153ee8184846153b1565b505050565b5b81811015615412576154076000826153db565b6001810190506153f4565b5050565b601f82111561545757615428816152f7565b6154318461530c565b81016020851015615440578190505b61545461544c8561530c565b8301826153f3565b50505b505050565b600082821c905092915050565b600061547a6000198460080261545c565b1980831691505092915050565b60006154938383615469565b9150826002028217905092915050565b6154ac82613fe8565b67ffffffffffffffff8111156154c5576154c4614448565b5b6154cf8254614a7b565b6154da828285615416565b600060209050601f83116001811461550d57600084156154fb578287015190505b6155058582615487565b86555061556d565b601f19841661551b866152f7565b60005b828110156155435784890151825560018201915060208501945060208101905061551e565b86831015615560578489015161555c601f891682615469565b8355505b6001600288020188555050505b505050505050565b600081905092915050565b600061558b82613fe8565b6155958185615575565b93506155a5818560208601614004565b80840191505092915050565b60006155bd8285615580565b91506155c98284615580565b91508190509392505050565b7f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160008201527f6464726573730000000000000000000000000000000000000000000000000000602082015250565b6000615631602683613ff3565b915061563c826155d5565b604082019050919050565b6000602082019050818103600083015261566081615624565b9050919050565b7f426f74206973206e6f7420616c6c6f7765643a00000000000000000000000000600082015250565b600061569d601383613ff3565b91506156a882615667565b602082019050919050565b600060208201905081810360008301526156cc81615690565b9050919050565b7f4552433732313a207472616e736665722066726f6d20696e636f72726563742060008201527f6f776e6572000000000000000000000000000000000000000000000000000000602082015250565b600061572f602583613ff3565b915061573a826156d3565b604082019050919050565b6000602082019050818103600083015261575e81615722565b9050919050565b7f4552433732313a207472616e7366657220746f20746865207a65726f2061646460008201527f7265737300000000000000000000000000000000000000000000000000000000602082015250565b60006157c1602483613ff3565b91506157cc82615765565b604082019050919050565b600060208201905081810360008301526157f0816157b4565b9050919050565b7f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572600082015250565b600061582d602083613ff3565b9150615838826157f7565b602082019050919050565b6000602082019050818103600083015261585c81615820565b9050919050565b7f4552433732313a20617070726f766520746f2063616c6c657200000000000000600082015250565b6000615899601983613ff3565b91506158a482615863565b602082019050919050565b600060208201905081810360008301526158c88161588c565b9050919050565b7f4552433732313a207472616e7366657220746f206e6f6e20455243373231526560008201527f63656976657220696d706c656d656e7465720000000000000000000000000000602082015250565b600061592b603283613ff3565b9150615936826158cf565b604082019050919050565b6000602082019050818103600083015261595a8161591e565b9050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b7f455243373231456e756d657261626c653a20636f6e736563757469766520747260008201527f616e7366657273206e6f7420737570706f727465640000000000000000000000602082015250565b60006159ec603583613ff3565b91506159f782615990565b604082019050919050565b60006020820190508181036000830152615a1b816159df565b9050919050565b600081519050919050565b600082825260208201905092915050565b6000615a4982615a22565b615a538185615a2d565b9350615a63818560208601614004565b615a6c8161402e565b840191505092915050565b6000608082019050615a8c60008301876141f4565b615a9960208301866141f4565b615aa660408301856142be565b8181036060830152615ab88184615a3e565b905095945050505050565b600081519050615ad281613f59565b92915050565b600060208284031215615aee57615aed613f23565b5b6000615afc84828501615ac3565b91505092915050565b6000615b10826140ff565b9150615b1b836140ff565b9250828203905081811115615b3357615b32614c0d565b5b92915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603160045260246000fd5b7f4552433732313a206d696e7420746f20746865207a65726f2061646472657373600082015250565b6000615b9e602083613ff3565b9150615ba982615b68565b602082019050919050565b60006020820190508181036000830152615bcd81615b91565b9050919050565b7f4552433732313a20746f6b656e20616c7265616479206d696e74656400000000600082015250565b6000615c0a601c83613ff3565b9150615c1582615bd4565b602082019050919050565b60006020820190508181036000830152615c3981615bfd565b905091905056fea2646970667358221220cab453c54d0f54378c32d8041ca80fa3466bf7165db0242b387ea2433b3f619264736f6c63430008110033`
