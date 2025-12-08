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

  'Should launch debugger #group1': function (browser: NightwatchBrowser) {
    browser.addFile('blah.sol', sources[0]['blah.sol'])
      .pause(4000)
      // on autocompile sometimes the compiler returns invalid source, so we need to recompile to make sure the source is valid
      .clickLaunchIcon('solidity').click('*[data-id="compilerContainerCompileBtn"]')
      .pause(4000)
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-bs-title="Deploy - transact (not payable)"]', 60000)
      .click('*[data-bs-title="Deploy - transact (not payable)"]')
      .debugTransaction(0)
      .waitForElementContainsText('*[data-id="sidePanelSwapitTitle"]', 'DEBUGGER', 60000)
      .clearConsole()
  },

  'Should debug failing transaction #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="verticalIconsKindudapp"]')
      .clickLaunchIcon('udapp')
      .clickInstance(0)
      .scrollAndClick('*[data-bs-title="string name, uint256 goal"]')
      .setValue('*[data-bs-title="string name, uint256 goal"]', '"toast", 999')
      .click('*[data-id="createProject - transact (not payable)"]')
      .debugTransaction(0)
      .pause(2000)
      .scrollAndClick('*[data-id="solidityLocals"]')
      .waitForElementContainsText('*[data-id="solidityLocals"]', 'toast', 60000)
      .waitForElementContainsText('*[data-id="solidityLocals"]', '999', 60000)
  },

  'Should debug transaction using slider #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="verticalIconsKindudapp"]')
      .waitForElementVisible('*[data-id="slider"]')
      .goToVMTraceStep(51)
      .waitForElementContainsText('*[data-id="solidityLocals"]', 'toast', 60000)
      .waitForElementContainsText('*[data-id="solidityLocals"]', '999', 60000)
      .waitForElementContainsText('*[data-id="stepdetail"]', 'vm trace step:\n51', 60000)
  },

  'Should step back and forward transaction #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="verticalIconsKindudapp"]')
      .waitForElementPresent('*[data-id="buttonNavigatorIntoBack"]')
      .scrollAndClick('*[data-id="buttonNavigatorIntoBack"]')
      .pause(2000)
      .waitForElementContainsText('*[data-id="stepdetail"]', 'vm trace step:\n50', 60000)
      .waitForElementContainsText('*[data-id="stepdetail"]', 'execution step:\n50', 60000)
      .click('*[data-id="buttonNavigatorIntoForward"]')
      .pause(2000)
      .waitForElementContainsText('*[data-id="stepdetail"]', 'vm trace step:\n51', 60000)
      .waitForElementContainsText('*[data-id="stepdetail"]', 'execution step:\n51', 60000)
  },

  'Should jump through breakpoints #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('#editorView')
      .execute(() => {
        (window as any).addRemixBreakpoint(11)
      }, [], () => { })
      .execute(() => {
        (window as any).addRemixBreakpoint(21)
      }, [], () => { })
      .waitForElementVisible('*[data-id="buttonNavigatorJumpPreviousBreakpoint"]')
      .click('*[data-id="buttonNavigatorJumpPreviousBreakpoint"]')
      .pause(2000)
      .waitForElementContainsText('*[data-id="stepdetail"]', 'vm trace step:\n0', 60000)
      .waitForElementContainsText('*[data-id="stepdetail"]', 'execution step:\n0', 60000)
      .click('*[data-id="buttonNavigatorJumpNextBreakpoint"]')
      .pause(10000)
      .waitForElementContainsText('*[data-id="stepdetail"]', 'vm trace step:\n352', 60000)
      .waitForElementContainsText('*[data-id="stepdetail"]', 'execution step:\n352', 60000)
  },

  'Should display solidity imported code while debugging github import #group2': function (browser: NightwatchBrowser) {
    browser
      .clearConsole()
      .clearTransactions()
      .clickLaunchIcon('solidity')
      .testContracts('externalImport.sol', sources[1]['externalImport.sol'], ['ERC20'])
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-bs-title="Deploy - transact (not payable)"]', 35000)
      .selectContract('ERC20')
      .createContract('"tokenName", "symbol"')
      .debugTransaction(0)
      .waitForElementVisible('#stepdetail')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//*[@data-id="treeViewLivm trace step" and contains(.,"475")]',
      })
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`constructor (string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }`) !== -1,
          'current displayed content is not from the ERC20 source code')
      })
      .goToVMTraceStep(10)
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//*[@data-id="treeViewLivm trace step" and contains(.,"10")]',
      })
  },

  'Should display correct source highlighting while debugging a contract which has ABIEncoderV2 #group2': function (browser: NightwatchBrowser) {
    /*
      localVariable_step266_ABIEncoder and localVariable_step717_ABIEncoder
      still contains unwanted values (related to decoding calldata types)
      This is still an issue @todo(https://github.com/ethereum/remix-project/issues/481), so this test will fail when this issue is fixed
    */
    browser
      .clearConsole().clearTransactions()
      .clickLaunchIcon('solidity')
      .setSolidityCompilerVersion('soljson-v0.6.12+commit.27d51765.js')
      .testContracts('withABIEncoderV2.sol', sources[2]['withABIEncoderV2.sol'], ['test'])
      .clickLaunchIcon('udapp')
      .selectContract('test')
      .createContract('')
      .clearConsole()
      .clickInstance(0)
      .clickFunction('test1 - transact (not payable)', { types: 'bytes userData', values: '0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000015b38da6a701c568545dcfcb03fcb875f56beddc4' })
      .debugTransaction(0)
      .waitForElementVisible('#stepdetail')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//*[@data-id="treeViewLivm trace step" and contains(.,"133")]',
      })
      .goToVMTraceStep(261)
      .waitForElementPresent('.highlightLine8')
      /*
        for the test below:
        source highlight should remain line `bytes32 idAsk = abi.decode(userData[:33], (bytes32));`
        At this vmtrace index, the sourcemap has file = -1 because the execution is in the generated sources (ABIEncoderV2)
        the atIndex of SourceLocationTracker was buggy and return an incorrect value, this is fixed
        But the debugger uses now validSourcelocation, which means file is not -1.
        In that case the source highlight at 261 should be the same as for step 262
      */

      .goToVMTraceStep(266)
      .checkVariableDebug('soliditylocals', localVariable_step266_ABIEncoder) // locals should not be initiated at this point, only idAsk should
      .goToVMTraceStep(717)
      .checkVariableDebug('soliditylocals', localVariable_step717_ABIEncoder) // all locals should be initiaed
      .clearTransactions()
  },

  'Should load more solidity locals array #group3': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .testContracts('locals.sol', sources[3]['locals.sol'], ['testLocals'])
      .clickLaunchIcon('udapp')
      .waitForElementPresent('*[data-bs-title="Deploy - transact (not payable)"]', 40000)
      .createContract('')
      .pause(2000)
      .clearConsole()
      .clickInstance(0)
      .clickFunction('t - transact (not payable)')
      .pause(2000)
      .debugTransaction(0)
      .waitForElementVisible('*[data-id="slider"]')
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//*[@data-id="treeViewLivm trace step" and contains(.,"29")]',
      })
      .goToVMTraceStep(5453)
      .waitForElementPresent('*[data-id="treeViewDivtreeViewItemarray"]')
      .click('*[data-id="treeViewDivtreeViewItemarray"]')
      .waitForElementPresent('*[data-id="treeViewDivtreeViewLoadMore"]')
      .waitForElementVisible('*[data-id="solidityLocals"]')
      .waitForElementContainsText('*[data-id="solidityLocals"]', '9: 9 uint256', 60000)
      .notContainsText('*[data-id="solidityLocals"]', '10: 10 uint256')
      .clearTransactions()
      .clearConsole().pause(2000)
  },

  'Should debug using generated sources #group4': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .pause(2000)
      .testContracts('withGeneratedSources.sol', sources[4]['withGeneratedSources.sol'], ['A'])
      .clickLaunchIcon('udapp')
      .createContract('')
      .clearConsole()
      .clickInstance(0)
      .clickFunction('f - transact (not payable)', { types: 'uint256[] ', values: '[]' })
      .debugTransaction(0)
      .pause(2000)
      .click('*[id="debuggerTransactionStartButtonContainer"]') // stop debugging
      .click('*[data-id="debugGeneratedSourcesLabel"]') // select debug with generated sources
      .click('*[id="debuggerTransactionStartButtonContainer"]') // start debugging
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf('if slt(sub(dataEnd, headStart), 32)') !== -1, 'current displayed content is not a generated source')
      })
      .click('*[id="debuggerTransactionStartButtonContainer"]')
  },
  // depends on Should debug using generated sources
  'Should call the debugger api: getTrace #group4': function (browser: NightwatchBrowser) {
    let txhash
    browser
      .clickLaunchIcon('udapp')
      .perform((done) => {
        browser.getLastTransactionHash((hash) => {
          txhash = hash
          done()
        })
      })
      .perform((done) => {
        browser.addFile('test_jsGetTrace.js', { content: jsGetTrace.replace('<txhash>', txhash) }).perform(() => {
          done()
        })
      })
      .executeScriptInTerminal('remix.exeCurrent()')
      .pause(3000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', '{"gas":"0x5752","return":"0x0000000000000000000000000000000000000000000000000000000000000000","structLogs":', 60000)
  },
  // depends on Should debug using generated sources
  'Should call the debugger api: debug #group4': function (browser: NightwatchBrowser) {
    let txhash
    browser
      .clickLaunchIcon('udapp')
      .perform((done) => {
        browser.getLastTransactionHash((hash) => {
          txhash = hash
          done()
        })
      })
      .perform((done) => {
        browser.addFile('test_jsDebug.js', { content: jsDebug.replace('<txhash>', txhash) }).perform(() => {
          done()
        })
      })      
      .executeScriptInTerminal('remix.exeCurrent()')
      .pause(3000)
      .clickLaunchIcon('debugger')
      .waitForElementVisible('*[data-id="slider"]')
      .goToVMTraceStep(154)
      .scrollInto('*[data-id="stepdetail"]')
      .waitForElementContainsText('*[data-id="stepdetail"]', 'vm trace step:\n154', 60000)
  },

  'Should start debugging using remix debug nodes (rinkeby) #group4': '' + function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .setSolidityCompilerVersion('soljson-v0.8.7+commit.e28d00a7.js')
      .addFile('useDebugNodes.sol', sources[5]['useDebugNodes.sol']) // compile contract
      .clickLaunchIcon('udapp')
      .switchEnvironment('basic-http-provider') // select web3 provider with debug nodes URL
      .clearValue('*[data-id="modalDialogCustomPromptText"]')
      .setValue('*[data-id="modalDialogCustomPromptText"]', 'https://remix-rinkeby.ethdevops.io')
      .modalFooterOKClick()
      .waitForElementPresent('*[title="Deploy - transact (not payable)"]', 65000) // wait for the compilation to succeed
      .clickLaunchIcon('debugger')
      .clearValue('*[data-id="debuggerTransactionInput"]')
      .setValue('*[data-id="debuggerTransactionInput"]', '0x156dbf7d0f9b435dd900cfc8f3264d523dd25733418ddbea1ce53e294f421013')
      .click('*[data-id="debugGeneratedSourcesLabel"]') // unselect debug with generated sources
      .click('*[data-id="debuggerTransactionStartButton"]')
      .waitForElementVisible('*[data-id="solidityLocals"]', 60000)
      .pause(10000)
      .checkVariableDebug('soliditylocals', { num: { value: '2', type: 'uint256' } })
      .checkVariableDebug('soliditystate', { number: { value: '0', type: 'uint256', constant: false, immutable: false } })
  },

  'Should debug reverted transactions #group5': function (browser: NightwatchBrowser) {
    browser
      .testContracts('reverted.sol', sources[6]['reverted.sol'], ['A', 'B', 'C'])
      .clickLaunchIcon('udapp')
      .selectContract('A')
      .createContract('')
      .pause(500)
      .clickInstance(0)
      .clickFunction('callA - transact (not payable)')
      .debugTransaction(1)
      .pause(4000)
      .goToVMTraceStep(80)
      .waitForElementVisible('*[data-id="debugGoToRevert"]', 60000)
      .click('*[data-id="debugGoToRevert"]')
      .waitForElementContainsText('*[data-id="asmitems"] div[selected="selected"]', '114 REVERT')
  }
}

const sources = [
  {
    'blah.sol': {
      content: `
    pragma solidity >=0.7.0 <0.9.0;

    contract Kickstarter {

        enum State { Started, Completed }

        struct Project {
            address owner;
            string name;
            uint goal;
            State state;
        }

        Project[] public projects;

        constructor() {

        }

        function createProject(string memory name, uint goal) public {
            Project storage project = projects[projects.length];
            project.name = name;
            project.owner = msg.sender;
            project.state = State.Started;
            project.goal = goal;
        }
    }
        `
    }
  },
  {
    'externalImport.sol': { content: 'import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v4.1/contracts/token/ERC20/ERC20.sol"; contract test7 {}' }
  },
  {
    'withABIEncoderV2.sol': {
      content: `
    pragma experimental ABIEncoderV2;

    contract test {
    // 000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000015b38da6a701c568545dcfcb03fcb875f56beddc4
    // 0000000000000000000000000000000000000000000000000000000000000002
    function test1 (bytes calldata userData) external returns (bytes memory, bytes32, bytes32, uint) {
        bytes32 idAsk = abi.decode(userData[:33], (bytes32));
        bytes32 idOffer = abi.decode(userData[32:64], (bytes32));

        bytes memory ro  = abi.encodePacked(msg.sender, msg.sender, idAsk, idOffer);
        return (ro, idAsk, idOffer, userData.length);
    }


    function testgp (bytes calldata userData) external returns (bytes4) {
        return  abi.decode(userData[:4], (bytes4));
    }
}
    `
    }
  },
  {
    'locals.sol': {
      content: `
      pragma solidity ^0.8.0;
      contract testLocals {
        function t () public {
            uint[] memory array = new uint[](150);
            for (uint k = 0; k < 150; k++) {
                array[k] = k;
            }
        }
      }
        `
    }
  },
  {
    'withGeneratedSources.sol': {
      content: `
      // SPDX-License-Identifier: GPL-3.0
      pragma experimental ABIEncoderV2;
      contract A {
        function f(uint[] memory) public returns (uint256) { }
      }
      `
    }
  },
  {
    'useDebugNodes.sol': {
      content: `
      // SPDX-License-Identifier: GPL-3.0

      pragma solidity >=0.7.0 <0.9.0;

      /**
       * @title Storage
       * @dev Store & retrieve value in a variable
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
      }
      `
    }
  },
  {
    'reverted.sol': {
      content: `contract A {
        B b;
        uint p;
        constructor () {
            b = new B();
        }
        function callA() public {
            p = 123;
            try b.callB() {

            }
            catch (bytes memory reason) {

            }
        }
    }

    contract B {
        C c;
        uint p;
        constructor () {
            c = new C();
        }
        function callB() public {
            p = 124;
            revert("revert!");
            c.callC();
        }
    }

    contract C {
        uint p;
        function callC() public {
            p = 125;
        }
    }`
    }
  }
]

const localVariable_step266_ABIEncoder = { // eslint-disable-line
  '<1>': {
    length: '0x0',
    type: 'bytes',
    value: '0x'
  },
  '<2>': {
    type: 'bytes32',
    value: '0x0000000000000000000000000000000000000000000000000000000000000000'
  },
  '<3>': {
    type: 'bytes32',
    value: '0x0000000000000000000000000000000000000000000000000000000000000000'
  },
  '<4>': {
    type: 'uint256',
    value: '0'
  },
  idAsk: {
    type: 'bytes32',
    value: '0x0000000000000000000000000000000000000000000000000000000000000002'
  },
  userData: {
    value: '0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000015b38da6a701c568545dcfcb03fcb875f56beddc4',
    type: 'bytes'
  }
}

const localVariable_step717_ABIEncoder = { // eslint-disable-line
  '<1>': {
    length: '0xd0',
    type: 'bytes',
    value: '0x5b38da6a701c568545dcfcb03fcb875f56beddc45b38da6a701c568545dcfcb03fcb875f56beddc400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001'
  },
  '<2>': {
    type: 'bytes32',
    value: '0x0000000000000000000000000000000000000000000000000000000000000002'
  },
  '<3>': {
    type: 'bytes32',
    value: '0x0000000000000000000000000000000000000000000000000000000000000001'
  },
  '<4>': {
    type: 'uint256',
    value: '84'
  },
  idAsk: {
    type: 'bytes32',
    value: '0x0000000000000000000000000000000000000000000000000000000000000002'
  },
  idOffer: {
    type: 'bytes32',
    value: '0x0000000000000000000000000000000000000000000000000000000000000001'
  },
  ro: {
    length: '0xd0',
    type: 'bytes',
    value: '0x5b38da6a701c568545dcfcb03fcb875f56beddc45b38da6a701c568545dcfcb03fcb875f56beddc400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001'
  },
  userData: {
    value: '0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000015b38da6a701c568545dcfcb03fcb875f56beddc4',
    type: 'bytes'
  }
}

const jsGetTrace = `(async () => {
  try {
      const result = await remix.call('debugger', 'getTrace', '<txhash>')
      console.log('result ', result)
  } catch (e) {
      console.log(e.message)
  }
})()`

const jsDebug = `(async () => {
  try {
      const result = await remix.call('debugger', 'debug', '<txhash>')
      console.log('result ', result)
  } catch (e) {
      console.log(e.message)
  }
})()`
