'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import { JsonRpcProvider } from 'ethers'

const branch = process.env.CIRCLE_BRANCH;
const isMasterBranch = branch === 'master';
const runMasterTests: boolean = (branch ? (isMasterBranch ? true : false) : true)

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  '@sources': function () {
    return sources
  },

  'Execute Simple Contract and Test Terminal #group1': function (browser: NightwatchBrowser) {
    browser.testContracts('Untitled.sol', sources[0]['Untitled.sol'], ['TestContract'])
      .clickLaunchIcon('udapp')
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c') // this account will be used for this test suite
      .click('.udapp_contractActionsContainerSingle > div')
      .clickInstance(0)
      .clickFunction('f - transact (not payable)')
      .testFunction('last',
        {
          status: '0x1 Transaction mined and execution succeed',
          'decoded output': { 0: 'uint256: 8' }
        })
      .clickFunction('g - transact (not payable)')
      .testFunction('last',
        {
          status: '0x1 Transaction mined and execution succeed',
          'decoded output': {
            0: 'uint256: 345',
            1: 'string: comment_comment_',
            2: 'bool: true',
            3: 'uint256: 4'
          }
        })
      .click('*[data-id="deployAndRunClearInstances"]')
  },

  'Test Complex Return Values #group1': function (browser: NightwatchBrowser) {
    browser.testContracts('returnValues.sol', sources[1]['returnValues.sol'], ['testReturnValues'])
      .clickLaunchIcon('udapp')
      .click('.udapp_contractActionsContainerSingle > div')
      .clickInstance(0)
      .clickFunction('returnValues1 - transact (not payable)')
      .testFunction('last',
        {
          status: '0x1 Transaction mined and execution succeed',
          'decoded output': {
            0: 'bool: _b true',
            1: 'uint256: _u 345',
            2: 'int256: _i -345',
            3: 'address: _a 0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c'
          }
        })
      .clickFunction('returnValues2 - transact (not payable)')
      .testFunction('last',
        {
          status: '0x1 Transaction mined and execution succeed',
          'decoded output': {
            0: 'bytes1: _b 0x12',
            1: 'bytes2: _b2 0x1223',
            2: 'bytes3: _b3 0x000000',
            3: 'bytes: _blit 0x123498',
            4: 'bytes5: _b5 0x0432450000',
            5: 'bytes6: _b6 0x234553253200',
            6: 'string: _str this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string',
            7: 'bytes7: _b7 0x03252353253253',
            8: 'bytes22: _b22 0x32523523532532532523532500000000000000000000',
            9: 'bytes32: _b32 0x0325235325325235325235325235320000000000000000000000000000000000'
          }
        }).pause(500)
      .clickFunction('returnValues3 - transact (not payable)')
      .testFunction('last',
        {
          status: '0x1 Transaction mined and execution succeed',
          'decoded output': {
            0: 'uint8: _en 2',
            1: 'int256[5][]: _a1 1,-45,-78,56,60,-1,42,334,-45455,-446,1,10,-5435,45,-7'
          }
        }).click('*[data-id="deployAndRunClearInstances"]')
  },

  'Test Complex Input Values #group2': function (browser: NightwatchBrowser) {
    browser.testContracts('inputValues.sol', sources[2]['inputValues.sol'], ['test'])
      .clickLaunchIcon('udapp')
      .click('.udapp_contractActionsContainerSingle > div')
      .clickInstance(0)
      .clickFunction('inputValue1 - transact (not payable)', { types: 'uint256 _u, int256 _i, string _str', values: '"2343242", "-4324324", "string _ string _  string _  string _  string _  string _  string _  string _  string _  string _"' })
      .testFunction('last',
        {
          status: '0x1 Transaction mined and execution succeed',
          'decoded output': {
            0: 'uint256: _uret 2343242',
            1: 'int256: _iret -4324324',
            2: 'string: _strret string _ string _  string _  string _  string _  string _  string _  string _  string _  string _'
          }
        })
      .pause(500)
      .clickFunction('inputValue2 - transact (not payable)', { types: 'uint256[3] _n, bytes8[4] _b8', values: '[1,2,3], ["0x1234000000000000", "0x1234000000000000","0x1234000000000000","0x1234000000000000"]' })
      .testFunction('last', {
        status: '0x1 Transaction mined and execution succeed',
        'decoded output': {
          0: 'uint256[3]: _nret 1,2,3',
          1: 'bytes8[4]: _b8ret 0x1234000000000000,0x1234000000000000,0x1234000000000000,0x1234000000000000'
        },
        logs: [
          {
            from: '0xd9145CCE52D386f254917e481eB44e9943F39138',
            topic: '0xd30981760edbf605bda8689e945f622877f230c9a77cbfbd448aa4b7d8ac6e7f',
            event: 'event1',
            args: {
              0: '-123',
              1: '123',
              2: {
                _isIndexed: true,
                hash: '0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658'
              },
              3: '0x12340000',
              4: 'test _ test _ test _ test test _ test test _ test test _ test test _ test test _ test test _ test '
            }
          }
        ]
      })
      .click('*[data-id="deployAndRunClearInstances"]')
  },

  'Should Compile and Deploy a contract which has an event declaring a function as parameter #group2': function (browser: NightwatchBrowser) {
    browser.testContracts('eventFunctionInput.sol', sources[3]['eventFunctionInput.sol'], ['C'])
      .clickLaunchIcon('udapp')
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c') // this account will be used for this test suite
      .click('.udapp_contractActionsContainerSingle > div')
      .clickInstance(0)
      .click('*[data-id="deployAndRunClearInstances"]')
  },

  'Should use scientific notation as parameters #group2': function (browser: NightwatchBrowser) {
    browser.testContracts('scientific_notation.sol', sources[8]['scientific_notation.sol'], ['test'])
      .clickLaunchIcon('udapp')
      .click('.udapp_contractActionsContainerSingle > div')
      .clickInstance(0)
      .clickFunction('inputValue1 - transact (not payable)', { types: 'uint256 _u, int256 _i', values: '"101e3", "-1.13e4"' })
      .waitForElementContainsText('*[data-id="terminalJournal"]', '101000', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', '-11300', 60000)
      .clickFunction('inputValue2 - transact (not payable)', { types: 'uint256 _u', values: '2.345e10' })
      .waitForElementContainsText('*[data-id="terminalJournal"]', '2340000000', 60000)
      .clickFunction('inputValue3 - transact (not payable)', { types: 'uint256[] _u', values: '["2.445e10", "13e1"]' })
      .waitForElementContainsText('*[data-id="terminalJournal"]', '24450000000', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', '130', 60000)
      .click('*[data-id="deployAndRunClearInstances"]')
  },

  'Should filter displayed transactions #group2': function (browser: NightwatchBrowser) {
    browser
      // it should contain: 0xd9145CCE52D386f254917e481eB44e9943F39138
      .checkTerminalFilter('0xd9145CCE52D386f254917e481eB44e9943F39138', '0xd9145CCE52D386f254917e481eB44e9943F39138', false)
      // it should not contain: 0xd9145CCE52D386f254917e481eB44e9943F39140 (it ends with 40)
      .checkTerminalFilter('0xd9145CCE52D386f254917e481eB44e9943F39140', '0xd9145CCE52D386f254917e481eB44e9943F39138', true)
  },

  'Should Compile and Deploy a contract which define a custom error, the error should be logged in the terminal #group3': function (browser: NightwatchBrowser) {
    browser.testContracts('customError.sol', sources[4]['customError.sol'], ['C'])
      .clickLaunchIcon('udapp')
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c') // this account will be used for this test suite
      .createContract('')
      .clickInstance(0)
      .clickFunction('g - transact (not payable)')
      .journalLastChildIncludes('Error provided by the contract:')
      .journalLastChildIncludes('CustomError : error description')
      .journalLastChildIncludes('Parameters:')
      .journalLastChildIncludes('"value": "2"')
      .journalLastChildIncludes('"value": "3"')
      .journalLastChildIncludes('"value": "error_string_2"')
      .journalLastChildIncludes('"documentation": "param1"')
      .journalLastChildIncludes('"documentation": "param2"')
      .journalLastChildIncludes('"documentation": "param3"')
      .click('*[data-id="deployAndRunClearInstances"]')
  },

  'Should Compile and Deploy a contract which define a custom error, the error should be logged in the terminal , using London VM Fork #group3': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .click('.remixui_compilerConfigSection')
      .setValue('#evmVersionSelector', 'london') // Set EVM version as fork version
      .clearTransactions()
      .switchEnvironment('vm-london', true) // switch to London fork
      .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c') // this account will be used for this test suite
      .createContract('')
      .clickInstance(0)
      .clickFunction('g - transact (not payable)')
      .journalLastChildIncludes('Error provided by the contract:')
      .journalLastChildIncludes('CustomError : error description')
      .journalLastChildIncludes('Parameters:')
      .journalLastChildIncludes('"value": "2"')
      .journalLastChildIncludes('"value": "3"')
      .journalLastChildIncludes('"value": "error_string_2"')
      .journalLastChildIncludes('"documentation": "param1"')
      .journalLastChildIncludes('"documentation": "param2"')
      .journalLastChildIncludes('"documentation": "param3"')
  },

  'Should Compile and Deploy a contract which define a custom error in a library, the error should be logged in the terminal #group3': function (browser: NightwatchBrowser) {
    browser.testContracts('customErrorLib.sol', sources[5]['customErrorLib.sol'], ['D'])
      .clickLaunchIcon('udapp')
      .click('.udapp_contractActionsContainerSingle > div')
      .clickInstance(1)
      .clickFunction('h - transact (not payable)')
      .journalLastChildIncludes('Error provided by the contract:')
      .journalLastChildIncludes('CustomError : error description from library')
      .journalLastChildIncludes('Parameters:')
      .journalLastChildIncludes('"value": "48"')
      .journalLastChildIncludes('"value": "46"')
      .journalLastChildIncludes('"value": "error_string_from_library"')
      .journalLastChildIncludes('"documentation": "param1 from library"')
      .journalLastChildIncludes('"documentation": "param2 from library"')
      .journalLastChildIncludes('"documentation": "param3 from library"')
  },

  'Should compile and deploy 2 simple contracts, the contract creation component state should be correctly reset for the deployment of the second contract #group4': function (browser: NightwatchBrowser) {
    browser
      .addFile('Storage.sol', sources[6]['Storage.sol'])
      .pause(1000)
      .addFile('Owner.sol', sources[6]['Owner.sol'])
      .pause(1000)
      .clickLaunchIcon('udapp')
      .createContract('42, 24')
      .openFile('Storage.sol')
      .clickLaunchIcon('udapp')
      .waitForElementVisible('*[data-bs-title="uint256 p"]', 10000)
      .createContract('102') // this creation will fail if the component hasn't been properly reset.
      .clickInstance(1)
      .clickFunction('store - transact (not payable)', { types: 'uint256 num', values: '24' })
      .testFunction('last', // we check if the contract is actually reachable.
        {
          status: '0x1 Transaction mined and execution succeed',
          'decoded input': {
            'uint256 num': '24'
          }
        })
  },

  'Should switch to the mainnet VM fork and execute a tx to query ENS #group5': function (browser: NightwatchBrowser) {
    if (!runMasterTests) {
      return
    }
    let addressRef
    browser
      .addFile('mainnet_ens.sol', sources[7]['mainnet_ens.sol'])
      .clickLaunchIcon('solidity')
      .setSolidityCompilerVersion('soljson-v0.8.17+commit.8df45f5f.js')
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-mainnet-fork')
      .click('*[data-id="runTabSelectAccount"]')
      .waitForElementPresent({
        locateStrategy: 'css selector',
        selector: `*[data-id="0xdD870fA1b7C4700F2BD7f44238821C26f7392148"]`,
        timeout: 250000
      }) // wait for the udapp to load the list of accounts
      .click('*[data-id="0xdD870fA1b7C4700F2BD7f44238821C26f7392148"]')
      .selectContract('MyResolver')
      .pause(5000)
      .createContract('')
      .clickInstance(0)
      .getAddressAtPosition(0, (address) => {
        addressRef = address
      })
      .clickFunction('resolve - call')
      .perform((done) => {
        browser.verifyCallReturnValue(addressRef, ['0:address: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'])
          .perform(() => done())
      })
  },

  'Should stay connected in the mainnet VM fork and execute state changing operations and non state changing operations #group5': function (browser: NightwatchBrowser) {
    if (!runMasterTests) {
      return
    }
    let addressRef
    browser
      .click('*[data-id="deployAndRunClearInstances"]') // clear udapp instances
      .clickLaunchIcon('filePanel')
      .testContracts('basic_state.sol', sources[9]['basic_state.sol'], ['BasicState'])
      .clickLaunchIcon('udapp')
      .selectContract('BasicState')
      .createContract('')
      .clickInstance(0)
      .getAddressAtPosition(0, (address) => {
        addressRef = address
      })
      .clickFunction('cake - call')
      .pause(500)
      .perform((done) => {
        browser.verifyCallReturnValue(addressRef, ['0:uint256: 0'])
          .perform(() => done())
      })
      .clickFunction('up - transact (payable)')
      .pause(500)
      .clickFunction('cake - call')
      .pause(1000)
      .perform((done) => {
        browser.verifyCallReturnValue(addressRef, ['0:uint256: 1'])
          .perform(() => done())
      })
      .clickFunction('up - transact (payable)')
      .pause(500)
      .clickFunction('cake - call')
      .pause(1000)
      .perform((done) => {
        browser.verifyCallReturnValue(addressRef, ['0:uint256: 2'])
          .perform(() => done())
      })
      .clickFunction('up - transact (payable)')
      .pause(500)
      .clickFunction('cake - call')
      .pause(1000)
      .perform((done) => {
        browser.verifyCallReturnValue(addressRef, ['0:uint256: 3'])
          .perform(() => done())
      })
  },

  'Should stay connected to mainnet VM fork and: check the block number is advancing and is not low #group5': function (browser: NightwatchBrowser) {
    if (!runMasterTests) {
      return
    }
    /*
        Should stay connected in the mainnet VM fork and: 
    - check the block number has been set to the current mainnet block number.
    - check blocknumber is advancing
    - fork and check blocknumber is advancing the forked state. The name is 'Mainnet fork 1'
    - fork again and check blocknumber is advancing the forked state. The name is 'Mainnet fork 2'
    - switch back to Mainnet fork 1 and check we have the right number of blocks.
    - transact again using Mainnet fork 1
    */
    let addressRef
    let currentBlockNumber: number
    browser
      .perform(async (done) => {
        try {
          console.log('getting the provider up..')
          const provider = new JsonRpcProvider('https://go.getblock.us/1552e4e35bcf4efe8a78897cba5557f9')
          currentBlockNumber = (await provider.getBlockNumber()) as number
          console.log('getBlockNumber', currentBlockNumber)
          done()
        } catch (e) {
          console.error(e)
        }        
      })
      .click('*[data-id="deployAndRunClearInstances"]') // clear udapp instances
      .clickLaunchIcon('filePanel')
      .testContracts('MainnetBlockNumberContract.sol', sources[10]['MainnetBlockNumberContract.sol'], ['MainnetBlockNumberContract'])
      .clickLaunchIcon('udapp')
      .selectContract('MainnetBlockNumberContract')
      .perform((done) => {
        browser.createContract((currentBlockNumber) + '')
        .waitForElementPresent('*[data-shared="universalDappUiInstance"]')
        .perform(() => {
          done()
        })
      })
      .clickInstance(0)
      .clickFunction('getB - call')
      .clickFunction('checkBlockNumberIsAdvancing - transact (not payable)')
      .perform((done) => {
        browser.testFunction('last',
          {
            status: '0x1 Transaction mined and execution succeed',
            'decoded output': { '0':'bool: true' }
          }).perform(() => done())
      })
      .clickFunction('getB - call')
      .clickFunction('checkBlockNumberIsAdvancing - transact (not payable)')
      .perform((done) => {
        browser.testFunction('last',
          {
            status: '0x1 Transaction mined and execution succeed',
            'decoded output': { '0':'bool: true' }
          }).perform(() => done())
      })
      .clickFunction('getB - call')
      .clickFunction('checkBlockNumberIsAdvancing - transact (not payable)')
      .perform((done) => {
        browser.testFunction('last',
          {
            status: '0x1 Transaction mined and execution succeed',
            'decoded output': { '0':'bool: true' }
          }).perform(() => done())
      })
      // Should fork the mainnet VM fork and execute some transaction
      .click('*[data-id="fork-state-icon"]')
      .waitForElementVisible('*[data-id="udappNotifyModalDialogModalTitle-react"]')
      .click('input[data-id="modalDialogForkState"]')
      .setValue('input[data-id="modalDialogForkState"]', 'Mainnet fork 1')
      .modalFooterOKClick('udappNotify')
      // check toaster for forked state
      .waitForElementVisible(
        {
          selector: '//*[@data-shared="tooltipPopup" and contains(.,"New environment \'Mainnet fork 1\' created with forked state.")]',
          locateStrategy: 'xpath'
        }
      )
      .pause(2000)
      .perform((done) => {
        browser.createContract((currentBlockNumber) + '')
        .waitForElementPresent('*[data-shared="universalDappUiInstance"]')
        .perform(() => {
          done()
        })
      })
      .clickInstance(0)
      .click('*[data-id="universalDappUiUdappPin"]') // pin the contract for later use by a forked state.
      .clickFunction('getB - call')
      .clickFunction('checkBlockNumberIsAdvancing - transact (not payable)')
      .perform((done) => {
        browser.testFunction('last',
          {
            status: '0x1 Transaction mined and execution succeed',
            'decoded output': { '0':'bool: true' }
          }).perform(() => done())
      })
      .clickFunction('getB - call')
      .clickFunction('checkBlockNumberIsAdvancing - transact (not payable)')
      .perform((done) => {
        browser.testFunction('last',
          {
            status: '0x1 Transaction mined and execution succeed',
            'decoded output': { '0':'bool: true' }
          }).perform(() => done())
      })
      // Should fork the mainnet VM fork again and execute some transaction
      .click('*[data-id="fork-state-icon"]')  
      .waitForElementVisible('*[data-id="udappNotifyModalDialogModalTitle-react"]')
      .click('input[data-id="modalDialogForkState"]')
      .setValue('input[data-id="modalDialogForkState"]', 'Mainnet fork 2')
      .modalFooterOKClick('udappNotify')
      // check toaster for forked state
      .waitForElementVisible(
        {
          selector: '//*[@data-shared="tooltipPopup" and contains(.,"New environment \'Mainnet fork 2\' created with forked state.")]',
          locateStrategy: 'xpath'
        }
      )
      .pause(2000)
      .clickInstance(0)
      .clickFunction('getB - call')
      .clickFunction('checkBlockNumberIsAdvancing - transact (not payable)')
      .perform((done) => {
        browser.testFunction('last',
          {
            status: '0x1 Transaction mined and execution succeed',
            'decoded output': { '0':'bool: true' }
          }).perform(() => done())
      })
      .clickFunction('getB - call')
      .clickFunction('checkBlockNumberIsAdvancing - transact (not payable)')
      .perform((done) => {
        browser.testFunction('last',
          {
            status: '0x1 Transaction mined and execution succeed',
            'decoded output': { '0':'bool: true' }
          }).perform(() => done())
      })
      .clickFunction('getB - call')
      .getAddressAtPosition(0, (address) => {
        console.log('Test Fork Mainnet', address)
        addressRef = address
      })
      // from Mainnet fork 2, check that block number is at `currentBlockNumber` + 4
      .clickFunction('checkOrigin - transact (not payable)', { types: 'uint256 incr', values: '3'})
      .perform((done) => {
        browser.testFunction('last',
          {
            status: '0x1 Transaction mined and execution succeed',
            'decoded output': { '0':'bool: true' }
          }).perform(() => done())
      })
      // switch back to Mainnet fork 1 and check that block number is at `currentBlockNumber` + 2
      .switchEnvironment('vm-fs-Mainnet fork 1')
      .pause(2000)
      .clickInstance(0)
      .clickFunction('checkOrigin - transact (not payable)', { types: 'uint256 incr', values: '1'})
      .perform((done) => {
        browser.testFunction('last',
          {
            status: '0x1 Transaction mined and execution succeed',
            'decoded output': { '0':'bool: true' }
          }).perform(() => done())
      })
    }
}

// @TODO test: bytes8[3][] type as input

const sources = [
  {
    'Untitled.sol': {
      content: `
      contract TestContract { function f() public returns (uint) { return 8; }
      function g() public returns (uint, string memory, bool, uint) {
        uint payment = 345;
        bool paid = true;
        string memory comment = "comment_comment_";
        uint month = 4;
        return (payment, comment, paid, month); } }`
    }
  },
  {
    'returnValues.sol': {
      content: `
  contract testReturnValues {
    enum ActionChoices { GoLeft, GoRight, GoStraight, SitStill }
    function returnValues1 () public returns (bool _b, uint _u, int _i, address _a)  {
        _b = true;
        _u = 345;
        _i = -345;
        _a = msg.sender;
    }

    function returnValues2 () public returns (bytes1 _b, bytes2 _b2, bytes3 _b3, bytes memory _blit, bytes5 _b5, bytes6 _b6, string memory _str, bytes7 _b7, bytes22 _b22, bytes32 _b32)  {
        _b = 0x12;
        _b2 = 0x1223;
        _b5 = hex"043245";
        _b6 = hex"2345532532";
        _b7 = hex"03252353253253";
        _b22 = hex"325235235325325325235325";
        _b32 = hex"032523532532523532523532523532";
        _blit = hex"123498";
        _str = "this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string _ this is a long string";
    }

    function returnValues3 () public returns (ActionChoices _en, int[5][] memory _a1)  {
       _en = ActionChoices.GoStraight;
       int[5][] memory a = new int[5][](3);
       a[0] = [int(1),-45,-78,56,60];
       a[1] = [int(-1),42,334,-45455,-446];
       a[2] = [int(1),10,-5435,45,-7];
      _a1 = a;
    }
  }`
    }
  },
  {
    'inputValues.sol': {
      content: `
  contract test {
    event event1(int _i, uint indexed _u, string indexed _str, bytes4 _b, string _notIndexed);
    function inputValue1 (uint _u, int _i, string memory _str) public returns (uint _uret, int _iret, string memory _strret) {
      _uret = _u;
      _iret = _i;
      _strret = _str;
    }
    function inputValue2 (uint[3] memory _n, bytes8[4] memory _b8) public returns (uint[3] memory _nret, bytes8[4] memory _b8ret){
        _nret = _n;
        _b8ret = _b8;
        emit event1(-123, 123, "test", hex"1234", "test _ test _ test _ test test _ test test _ test test _ test test _ test test _ test test _ test ");
    }
}`
    }
  },
  // https://github.com/ethereum/remix-project/issues/404
  {
    'eventFunctionInput.sol': {
      content: `
pragma solidity >= 0.7.0;
contract C {
    event Test(function() external);
}`
    }
  },
  // https://github.com/ethereum/remix-project/issues/1152
  {
    'customError.sol': {
      content: `// SPDX-License-Identifier: GPL-3.0

      pragma solidity ^0.8.7;

      /// error description
      /// @param a param1
      /// @param b param2
      /// @param c param3
      error CustomError(uint a, uint b, string c);
      contract C {
          function f() public pure {
              revert CustomError(2, 3, "error_string");
          }
          function g() public {
              revert CustomError(2, 3, "error_string_2");
          }
      }`
    }
  },
  {
    'customErrorLib.sol': {
      content: `// SPDX-License-Identifier: GPL-3.0

      pragma solidity ^0.8.7;

      library lib {
          /// error description from library
          /// @param a param1 from library
          /// @param b param2 from library
          /// @param c param3 from library
          error CustomError(uint a, uint b, string c);
          function set() public {
              revert CustomError(48, 46, "error_string_from_library");
          }
      }

      contract D {
          function h() public {
              lib.set();
          }
      }`
    }
  },
  {
    'Owner.sol': {
      content: `
      // SPDX-License-Identifier: GPL-3.0

      pragma solidity >=0.7.0 <0.9.0;

      /**
       * @title Owner
       * @dev Set & change owner
       */
      contract Owner {

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
          constructor(uint p, uint o) {
              owner = msg.sender; // 'msg.sender' is sender of current call, contract deployer for a constructor
              emit OwnerSet(address(0), owner);
          }

          /**
           * @dev Change owner
           * @param newOwner address of new owner
           */
          function changeOwner(address newOwner) public isOwner {
              emit OwnerSet(owner, newOwner);
              owner = newOwner;
          }

          /**
           * @dev Return owner address
           * @return address of owner
           */
          function getOwner() external view returns (address) {
              return owner;
          }
      }`
    },
    'Storage.sol': {
      content: `
      // SPDX-License-Identifier: GPL-3.0

      pragma solidity >=0.7.0 <0.9.0;

      /**
       * @title Storage
       * @dev Store & retrieve value in a variable
       */
      contract Storage {

          uint256 number;

          constructor(uint p) {

          }

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
      }`
    }
  }, {
    'mainnet_ens.sol': {
      content:
        `
        import "https://github.com/ensdomains/ens-contracts/blob/master/contracts/utils/NameEncoder.sol";

        abstract contract ENS {
            function resolver(bytes32 node) public virtual view returns (Resolver);
        }

        abstract contract Resolver {
            function addr(bytes32 node) public virtual view returns (address);
        }

        contract MyResolver {
            // Same address for Mainnet, Ropsten, Rinkerby, Gorli and other networks;
            ENS ens = ENS(0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e);

            function resolve() public view returns(address) {
                (,bytes32 node) = NameEncoder.dnsEncodeName("vitalik.eth");
                Resolver resolver = ens.resolver(node);
                return resolver.addr(node);
            }
        }
        `
    }
  }, {
    "scientific_notation.sol": {
      content: `
      import "hardhat/console.sol";
      contract test {
        function inputValue1 (uint _u, int _i) public {
          console.log(_u);
          console.logInt(_i);
        }
        function inputValue2 (uint _u) public {
          console.log(_u);
        }
        function inputValue3 (uint[] memory _u) public {
          console.log(_u[0]);
          console.log(_u[1]);
        }
      }
      `
    }
  },
  {
    'basic_state.sol': {
      content:
        `
        contract BasicState {
          uint public cake;
          function up() public payable {
             cake++;
          }
      }
        `
    }
  }, {
    'MainnetBlockNumberContract.sol': {
      content: `
      // SPDX-License-Identifier: GPL-3.0

      pragma solidity >=0.8.2 <0.9.0;

      contract MainnetBlockNumberContract {
      uint b;
      uint orgB;
      constructor(uint blockNumber) {
          b = blockNumber;
      }
      function checkBlockNumberIsAdvancing()  public returns (bool) {
          if (orgB == 0) orgB = block.number;
          bool ret = b < block.number;
          b = block.number;
          return ret;
      }
      function getB() view public returns(uint) {
          return b;
      }
      function checkOrigin(uint incr) public returns (bool) {
        bool ret = orgB + incr == b;
        return ret;
      }
  }
`
    }
  }
]
