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
      .createContract('')
      .debugTransaction(0)
      // Check that execution trace section is visible
      .waitForElementVisible('*[data-id="callTraceHeader"]', 60000)
      // Check that step debug buttons are visible in bottom bar
      .waitForElementVisible('*[data-id="btnJumpPreviousBreakpoint"]', 60000)
      .waitForElementVisible('*[data-id="btnStepBack"]', 60000)
      .waitForElementVisible('*[data-id="btnStepInto"]', 60000)
      .waitForElementVisible('*[data-id="btnStepForward"]', 60000)
      .waitForElementVisible('*[data-id="btnJumpNextBreakpoint"]', 60000)
  },

  'Should debug failing transaction #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="verticalIconsKindudapp"]')
      .clickLaunchIcon('udapp')
      .clickInstance(0)
      .clearConsole()
      .clickFunction(0, 0, { types: 'string name, uint256 goal', values: '"toast", 999' })
      .debugTransaction(0)
      .pause(2000)
      .goToVMTraceStep(327)
      .pause(500)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 327', 10000)
      .waitForElementVisible('*[data-id="stateLocalsContent"]')
      .pause(1000) // Wait for data to load
      // First expand "locals" to see variable names
      .execute(function () {
        // Step 1: Expand the "locals" key
        const solidityLocals = document.querySelector('[data-id="solidityLocals"]')
        if (solidityLocals) {
          const firstIcon = solidityLocals.querySelector('.json-expand-icon')
          if (firstIcon) (firstIcon as any).click()
        }
      })
      .waitForElementVisible('*[data-id="name-expand-icon"]')
      .click('*[data-id="name-expand-icon"]')
      .waitForElementContainsText('[data-id="name-json-nested"] [data-id="value-json-value"]', 'toast')
      .click('*[data-id="goal-expand-icon"]')
      .waitForElementContainsText('[data-id="goal-json-nested"] [data-id="value-json-value"]', '999')
  },

  'Should step back and forward transaction #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('*[data-id="verticalIconsKindudapp"]')
      .waitForElementPresent('*[data-id="btnStepBack"]')
      .click('*[data-id="btnStepBack"]')
      .pause(2000)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 326', 60000)
      .click('*[data-id="btnStepInto"]')
      .pause(2000)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 327', 60000)
  },

  'Should jump through breakpoints #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementVisible('#editorView')
      .execute(() => {
        (window as any).addRemixBreakpoint(11)
      }, [], () => { })
      .execute(() => {
        (window as any).addRemixBreakpoint(21)
      }, [], () => { })
      .waitForElementVisible('*[data-id="btnJumpPreviousBreakpoint"]')
      .click('*[data-id="btnJumpPreviousBreakpoint"]')
      .pause(2000)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 0', 60000)
      .click('*[data-id="btnJumpNextBreakpoint"]')
      .pause(10000)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 352', 60000)
  },

  'Should display transaction details #group1': function (browser: NightwatchBrowser) {
    // The debugger is already running from previous test
    // Transaction details should be visible in the debugger view
    browser
      .waitForElementVisible('*[data-id="callTraceHeader"]', 10000)
      .pause(2000) // Wait for transaction details to load
      // Check if transaction details section exists
      .waitForElementVisible('*[data-id="txDetails"]', 10000)
      // Verify Status field
      .waitForElementVisible('*[data-id="txStatus"]', 10000)
      .waitForElementContainsText('*[data-id="txStatus"]', 'Failed')
      // Verify Tx Fee is visible and not N/A
      .waitForElementContainsText('*[data-id="txFee"]', '500940000000000 Wei')
      // Verify Block number is visible
      .waitForElementContainsText('*[data-id="txBlock"]', '2')
      // Verify Tx Type is visible
      .waitForElementContainsText('*[data-id="txType"]', 'Type 0')
      // Verify Timestamp is visible
      .waitForElementVisible('*[data-id="txTimestamp"]')
      .getText('*[data-id="txTimestamp"]', (result) => {
        const value = typeof result.value === 'string' ? result.value : ''
        browser.assert.ok(value !== 'N/A' && value.length > 0, 'Timestamp should be displayed')
      })
      // Verify Gas Price is visible
      .waitForElementContainsText('*[data-id="txGasPrice"]', '20000000000 Wei')
      // Verify From address is visible
      .waitForElementContainsText('*[data-id="txFrom"]', '0x5B38...ddC4')
      // Verify Gas Used is visible
      .waitForElementContainsText('*[data-id="txGasUsed"]', '25047')
      // Verify To address is visible
      .waitForElementContainsText('*[data-id="txTo"]', '0xd914...9138')
      // Verify Tx Index is visible
      .waitForElementContainsText('*[data-id="txIndex"]', '0')
      // Verify Function name is visible
      .waitForElementContainsText('*[data-id="txFunction"]', 'createProject')
      // Verify Tx Nonce is visible
      .waitForElementContainsText('*[data-id="txNonce"]', '1')
      // Verify Value is visible
      .waitForElementContainsText('*[data-id="txValue"]', '0 Wei')
  },

  'Should click Ask RemixAI while debugging and open assistant on right side #group1': function (browser: NightwatchBrowser) {
    browser
      // Step 1: Stop any existing debugger session
      .perform((done) => {
        browser.elements('css selector', '*[id="debuggerTransactionStartButtonContainer"]', (result) => {
          if (Array.isArray(result.value) && result.value.length > 0) {
            // Check if the stop button is visible (debugger is running)
            browser.isVisible('*[id="debuggerTransactionStartButtonContainer"]', (visResult) => {
              if (visResult.value === true) {
                browser
                  .click('*[id="debuggerTransactionStartButtonContainer"]')
                  .pause(1000)
                  .perform(() => done())
              } else {
                done()
              }
            })
          } else {
            done()
          }
        })
      })
      // Step 2: Open AI assistant and ensure it's on the left side
      .clickLaunchIcon('remixaiassistant')
      .waitForElementVisible('*[data-id="remix-ai-assistant"]', 10000)
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(500)
      // Move assistant to left side if it's on the right
      .perform((done) => {
        browser.elements('css selector', '*[data-id="movePluginToLeft"]', (result) => {
          if (Array.isArray(result.value) && result.value.length > 0) {
            // Assistant is on right side, move it to left
            browser
              .click('*[data-id="movePluginToLeft"]')
              .pause(1000)
              .perform(() => done())
          } else {
            // Already on left side
            done()
          }
        })
      })
      // Verify assistant is on the left side
      .waitForElementVisible('*[data-id="movePluginToRight"]', 5000)
      .waitForElementVisible('#side-panel', 5000) // Left panel should be visible
      // Clear any existing chat
      .assistantClearChat()
      .pause(500)
      // Step 3: Start a new debugging session
      .clickLaunchIcon('udapp')
      .clearConsole()
      .clickFunction(0, 0, { types: 'string name, uint256 goal', values: '"test", 100' })
      .pause(2000)
      .debugTransaction(0)
      .waitForElementVisible('*[data-id="callTraceHeader"]', 60000)
      .pause(1000)
      // Step 4: Click Ask RemixAI button while debugging
      .waitForElementVisible('*[data-id="ask-remixai-action"]', 10000)
      .click('*[data-id="ask-remixai-action"]')
      .pause(2000) // Wait for the assistant to process and move to right side
      // Step 5: Verify AI assistant is now on the right side panel
      .waitForElementVisible('#right-side-panel', 10000) // Right side panel should be visible
      .waitForElementVisible('*[data-id="movePluginToLeft"]', 10000) // Move to left button indicates it's on right side
      .waitForElementVisible('*[data-id="remix-ai-assistant"]', 10000) // Assistant should be visible
      .waitForElementPresent({
        selector: "//*[@data-id='remix-ai-assistant-ready']",
        locateStrategy: 'xpath',
        timeout: 120000
      })
      .pause(1000) // Wait for the prompt to be sent
      // Verify the correct prompt was sent to the AI assistant
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: '//div[contains(@class,"chat-bubble") and contains(.,"Give me more info about current debugging session")]'
      }, 10000)
      // Wait for AI to finish responding
      .waitForElementPresent({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='remix-ai-streaming' and @data-streaming='false']"
      }, 60000) // Wait for streaming to complete
  },

  'Should display solidity imported code while debugging github import #group2': function (browser: NightwatchBrowser) {
    browser
      .clearConsole()
      .clearTransactions()
      .clickLaunchIcon('solidity')
      .testContracts('externalImport.sol', sources[1]['externalImport.sol'], ['ERC20'])
      .clickLaunchIcon('udapp')
      .selectContract('ERC20')
      .createContract('"tokenName", "symbol"')
      .debugTransaction(0)
      .waitForElementVisible('*[data-id="callTraceHeader"]')
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 474')
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`constructor (string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }`) !== -1,
          'current displayed content is not from the ERC20 source code')
      })
      .goToVMTraceStep(10)
      .pause(300)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 10', 10000)
  },

  'Should display correct source highlighting while debugging a contract which has ABIEncoderV2 #group2': function (browser: NightwatchBrowser) {
    /*
      localVariable_step266_ABIEncoder and localVariable_step717_ABIEncoder
      still contains unwanted values (related to decoding calldata types)
      This is still an issue @todo(https://github.com/ethereum/remix-project/issues/481), so this test will fail when this issue is fixed
    */
    browser
      .refreshPage()
      .clickLaunchIcon('solidity')
      .testContracts('withABIEncoderV2.sol', sources[2]['withABIEncoderV2.sol'], ['test'])
      .clickLaunchIcon('udapp')
      .selectContract('test')
      .createContract('')
      .clearConsole()
      .clickInstance(0)
      .clickFunction(0, 0, { types: 'bytes userData', values: '0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000015b38da6a701c568545dcfcb03fcb875f56beddc4' })
      .debugTransaction(0)
      .waitForElementVisible('*[data-id="callTraceHeader"]')
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 131')
      .goToVMTraceStep(261)
      .pause(500)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 261', 10000)
      .waitForElementPresent('.highlightLine8')
      /*
        for the test below:
        source highlight should remain line `bytes32 idAsk = abi.decode(userData[:33], (bytes32));`
        At this vmtrace index, the sourcemap has file = -1 because the execution is in the generated sources (ABIEncoderV2)
        the atIndex of SourceLocationTracker was buggy and return an incorrect value, this is fixed
        But the debugger uses now validSourcelocation, which means file is not -1.
        In that case the source highlight at 261 should be the same as for step 262
      */

      .goToVMTraceStep(265)
      .pause(500)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 265', 10000)
      .pause(500)
      .execute(function () {
        const solidityLocals = document.querySelector('[data-id="solidityLocals"]')
        if (solidityLocals) {
          const firstIcon = solidityLocals.querySelector('.json-expand-icon')
          if (firstIcon) (firstIcon as any).click()
        }
      })
      .pause(500)
      .checkVariableDebug('soliditylocals', localVariable_step266_ABIEncoder) // locals should not be initiated at this point, only idAsk should
      .goToVMTraceStep(717)
      .pause(500)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 717', 10000)
      .pause(500)

      .checkVariableDebug('soliditylocals', localVariable_step717_ABIEncoder) // all locals should be initiated
      .clearTransactions()
  },

  'Should load more solidity locals array #group3': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .testContracts('locals.sol', sources[3]['locals.sol'], ['testLocals'])
      .clickLaunchIcon('udapp')
      .createContract('')
      .pause(2000)
      .clearConsole()
      .clickInstance(0)
      .clickFunction(0, 0)
      .pause(2000)
      .debugTransaction(0)
      .waitForElementPresent('*[data-id="callTraceHeader"]', 60000)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step:', 60000)
      .pause(1000)
      // Use goToVMTraceStep which intelligently uses jumpTo method when available
      // This avoids clicking 5453 times and instead uses stepManager.jumpTo(5453) directly
      .goToVMTraceStep(5453)
      .pause(2000)
      // Verify we reached the correct step
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 5453', 10000)
      .waitForElementVisible('*[data-id="stateLocalsContent"]', 10000)
      .pause(2000) // Wait for large array to be processed and rendered
      // Expand "locals" first to see variable names
      .execute(function () {
        const solidityLocals = document.querySelector('[data-id="solidityLocals"]')
        if (solidityLocals) {
          const firstIcon = solidityLocals.querySelector('.json-expand-icon')
          if (firstIcon) (firstIcon as any).click()
        }
      })
      .pause(2000) // Wait for variables to render
      // Expand the array variable to see its values
      .waitForElementVisible('*[data-id="array-expand-icon"]', 20000)
      .click('*[data-id="array-expand-icon"]')
      .pause(1000)
      // Verify array content is displayed
      .waitForElementContainsText('[data-id="array-json-nested"]', '9', 60000)
      // Cleanup
      .clearDeployedContracts()
      .clearConsole()
      .pause(1000)
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
      .clickFunction(0, 0, { types: 'uint256[] ', values: '[]' })
      .debugTransaction(0)
      .pause(2000)
      .click('*[id="debuggerTransactionStartButtonContainer"]') // stop debugging
      .click('*[data-id="debugGeneratedSourcesLabel"]') // select debug with generated sources
      .debugTransaction(0) // start debugging again with generated sources
      .pause(4000)
      .goToVMTraceStep(39)
      .pause(500)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 39', 10000)
      .pause(500)
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
      .pause(5000) // Wait for the API call to start debugging and open the panel      
      .waitForElementVisible('*[data-id="callTraceHeader"]')
      .goToVMTraceStep(154)
      .pause(500)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 154', 10000)
  },

  'Should start debugging using remix debug nodes (rinkeby) #group4': '' + function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .setSolidityCompilerVersion('soljson-v0.8.7+commit.e28d00a7.js')
      .addFile('useDebugNodes.sol', sources[5]['useDebugNodes.sol']) // compile contract
      .clickLaunchIcon('udapp')
      .connectToExternalHttpProvider('https://remix-rinkeby.ethdevops.io', 'Custom')
      .createContract('') // wait for the compilation to succeed
      .clickLaunchIcon('debugger')
      .clearValue('*[data-id="debuggerTransactionInput"]')
      .setValue('*[data-id="debuggerTransactionInput"]', '0x156dbf7d0f9b435dd900cfc8f3264d523dd25733418ddbea1ce53e294f421013')
      .click('*[data-id="debugGeneratedSourcesLabel"]') // unselect debug with generated sources
      .click('*[data-id="debuggerTransactionStartButton"]')
      .waitForElementVisible('*[data-id="stateLocalsContent"]', 60000)
      .pause(10000)
      // Expand "locals" first
      .execute(function () {
        const solidityLocals = document.querySelector('[data-id="solidityLocals"]')
        if (solidityLocals) {
          const firstIcon = solidityLocals.querySelector('.json-expand-icon')
          if (firstIcon) (firstIcon as any).click()
        }
      })
      .pause(500)
      // Expand "state" first
      .execute(function () {
        const solidityState = document.querySelector('[data-id="solidityState"]')
        if (solidityState) {
          const firstIcon = solidityState.querySelector('.json-expand-icon')
          if (firstIcon) (firstIcon as any).click()
        }
      })
      .pause(500)
      .checkVariableDebug('soliditylocals', { num: { value: '2', type: 'uint256' } })
      .checkVariableDebug('soliditystate', { number: { value: '0', type: 'uint256', constant: false, immutable: false } })
  },

  // Commented out: "Go to Revert" button feature is not currently implemented
  // TODO: Re-enable when the feature is available
  /* 'Should debug reverted transactions #group5': function (browser: NightwatchBrowser) {
    browser
      .testContracts('reverted.sol', sources[6]['reverted.sol'], ['A', 'B', 'C'])
      .clickLaunchIcon('udapp')
      .selectContract('A')
      .createContract('')
      .pause(500)
      .clickInstance(0)
      .clickFunction(0, 0)
      .debugTransaction(1)
      .waitForElementVisible('*[data-id="callTraceHeader"]', 60000)
      .pause(2000) // Wait for trace to fully load
      .goToVMTraceStep(80)
      .pause(1000)
      .waitForElementContainsText('*[data-id="callTraceHeader"]', 'Step: 80', 60000)
      .waitForElementVisible('*[data-id="debugGoToRevert"]', 60000)
      .click('*[data-id="debugGoToRevert"]')
      .pause(1000)
      .waitForElementContainsText('*[data-id="asmitems"] div[selected="selected"]', '114 REVERT')
  } */
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
	"userData": {
		"value": "0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000015b38da6a701c568545dcfcb03fcb875f56beddc4",
		"type": "bytes"
	},
	"<1>": {
		"length": "0xNaN",
		"value": "0x",
		"type": "bytes"
	},
	"<2>": {
		"value": "0x0000000000000000000000000000000000000000000000000000000000000000",
		"type": "bytes32"
	},
	"<3>": {
		"value": "0x0000000000000000000000000000000000000000000000000000000000000000",
		"type": "bytes32"
	},
	"<4>": {
		"value": "0",
		"type": "uint256"
	},
	"idAsk": {
		"value": "0x0000000000000000000000000000000000000000000000000000000000000002",
		"type": "bytes32"
	}
}

const localVariable_step717_ABIEncoder = { // eslint-disable-line
	"userData": {
		"value": "0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000015b38da6a701c568545dcfcb03fcb875f56beddc4",
		"type": "bytes"
	},
	"<1>": {
		"length": "0xd0",
		"value": "0x5b38da6a701c568545dcfcb03fcb875f56beddc45b38da6a701c568545dcfcb03fcb875f56beddc400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001",
		"type": "bytes"
	},
	"<2>": {
		"value": "0x0000000000000000000000000000000000000000000000000000000000000002",
		"type": "bytes32"
	},
	"<3>": {
		"value": "0x0000000000000000000000000000000000000000000000000000000000000001",
		"type": "bytes32"
	},
	"<4>": {
		"value": "84",
		"type": "uint256"
	},
	"idAsk": {
		"value": "0x0000000000000000000000000000000000000000000000000000000000000002",
		"type": "bytes32"
	},
	"idOffer": {
		"value": "0x0000000000000000000000000000000000000000000000000000000000000001",
		"type": "bytes32"
	},
	"ro": {
		"length": "0xd0",
		"value": "0x5b38da6a701c568545dcfcb03fcb875f56beddc45b38da6a701c568545dcfcb03fcb875f56beddc400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001",
		"type": "bytes"
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
