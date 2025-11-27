'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done) {
    init(browser, done)
  },

  '@sources': function () {
    return sources
  },
  'open SUT plugin': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .clickLaunchIcon('pluginManager')
      .scrollAndClick('*[data-id="pluginManagerComponentActivateButtonsolidityUnitTesting"]')
      .click('*[data-id="verticalIconsKindsolidityUnitTesting"]')
      .waitForElementPresent('*[data-id="sidePanelSwapitTitle"]')
      .assert.containsText('*[data-id="sidePanelSwapitTitle"]', 'SOLIDITY UNIT TESTING')
      .clickLaunchIcon('filePanel')
      .waitForElementPresent('[data-id="treeViewDivtreeViewItemtests"]')
      .click('[data-id="treeViewDivtreeViewItemtests"]')
      .clickLaunchIcon('pluginManager')
  },

  'Should launch solidity unit test plugin and create test files in FE #group1 #group2': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('simple_storage.sol', sources[0]['simple_storage.sol'])
      .addFile('ks2a.sol', sources[0]['ks2a.sol'])
      .openFile('.deps/remix-tests/remix_tests.sol')
      // remix_test.sol should be opened in editor
      .getEditorValue((content) => browser.assert.ok(content.indexOf('library Assert {') !== -1))
      .openFile('.deps/remix-tests/remix_accounts.sol')
      // remix_accounts.sol should be opened in editor
      .getEditorValue((content) => browser.assert.ok(content.indexOf('library TestsAccounts {') !== -1))
  },

  'Should generate test file #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .clickLaunchIcon('filePanel')
      .openFile('simple_storage.sol')
      .click('*[data-id="verticalIconsKindsolidityUnitTesting"]')
      .waitForElementPresent('*[data-id="testTabGenerateTestFile"]')
      .click('*[data-id="testTabGenerateTestFile"]')
      .clickLaunchIcon('filePanel')
      .openFile('tests/simple_storage_test.sol')
      .waitForElementPresent('*[data-path="default_workspace/tests/simple_storage_test.sol"]')
      .removeFile('tests/simple_storage_test.sol', 'default_workspace')
  },

  'Should run simple unit test `simple_storage_test.sol` #group1': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .addFile('tests/simple_storage_test.sol', sources[0]['tests/simple_storage_test.sol'])
      .click('*[data-id="verticalIconsKindsolidityUnitTesting"]')
      .waitForElementPresent('*[data-id="testTabCheckAllTests"]')
      .click('*[data-id="testTabCheckAllTests"]')
      .clickElementAtPosition('.singleTestLabel', 1)
      .scrollAndClick('*[data-id="testTabRunTestsTabRunAction"]')
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'MyTest (tests/simple_storage_test.sol)', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', '✓ Initial value should be100', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', '✓ Value is set200', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', '✘ Should fail for wrong value200', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'Passed: 2', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'Failed: 1', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'FAILMyTest (tests/simple_storage_test.sol)', 120000)
      // '.failed_tests_simple_storage_test_solMyTest' is the class for 'FAIL' label
      .verify.elementPresent('.failed_tests_simple_storage_test_solMyTest')
  },

  'Should run advance unit test using natspec and experimental ABIEncoderV2 `ks2b_test.sol` #group2': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .clickLaunchIcon('filePanel')
      .addFile('tests/ks2b_test.sol', sources[0]['tests/ks2b_test.sol'])
      .click('*[data-id="verticalIconsKindsolidityUnitTesting"]')
      .waitForElementPresent('*[data-id="testTabCheckAllTests"]')
      .click('*[data-id="testTabCheckAllTests"]')
      .clickElementAtPosition('.singleTestLabel', 1)
      .scrollAndClick('*[data-id="testTabRunTestsTabRunAction"]')
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'tests/ks2b_test.sol', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', '✓ Check project exists', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', '✘ Check wrong project owner', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', '✘ Check wrong sender', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', '✘ Check wrong value', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', '✓ Check project is fundable', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'owner is incorrect', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'wrong sender', 120000)
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'wrong value', 120000)
  },

  'Should stop unit tests during test execution` #group2': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .waitForElementPresent('*[data-id="testTabRunTestsTabRunAction"]')
      .clickElementAtPosition('.singleTestLabel', 0)
      .scrollAndClick('*[data-id="testTabRunTestsTabRunAction"]')
      .click('*[data-id="testTabRunTestsTabStopAction"]')
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'tests/Ballot_test.sol', 200000)
      .notContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'tests/ks2b_test.sol')
      .notContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'tests/simple_storage_test.sol')
      .waitForElementContainsText('*[data-id="testTabTestsExecutionStopped"]', 'The test execution has been stopped', 60000)
  },

  'Should fail on compilation, open file on error click, not disappear error #group2': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .addFile('tests/compilationError_test.sol', sources[0]['compilationError_test.sol'])
      .click('div[data-path="default_workspace/tests/compilationError_test.sol"] span[class="close-tabs"]')
      .clickLaunchIcon('solidityUnitTesting')
      .pause(2000)
      .click('*[data-id="testTabCheckAllTests"]')
      // .click('#singleTesttests/compilationError_test.sol')
      .clickElementAtPosition('.singleTestLabel', 2)
      .scrollAndClick('*[data-id="testTabRunTestsTabRunAction"]')
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'SyntaxError: No visibility specified', 120000)
      .waitForElementContainsText('*[data-id="testTabTestsExecutionStoppedError"]', 'The test execution has been stopped because of error(s) in your test file', 120000)
      .click('#solidityUnittestsOutput *[data-id="tests/compilationError_test.sol"]')
      .pause(1000)
      .getEditorValue((content) => browser.assert.ok(content.indexOf('contract failOnCompilation {') !== -1))
      // Verify that compilation error is still present after a file is opened
      // usually, tests result is cleared on opening a new file
      .verify.elementPresent('#solidityUnittestsOutput *[data-id="tests/compilationError_test.sol"]')
  },

  'Should fail on deploy #group3': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .addFile('tests/deployError_test.sol', sources[0]['tests/deployError_test.sol'])
      .clickLaunchIcon('filePanel')
      .openFile('tests/deployError_test.sol')
      .clickLaunchIcon('solidityUnitTesting')
      .click('*[data-id="testTabCheckAllTests"]')
      .clickElementAtPosition('.singleTestLabel', 1)
      .scrollAndClick('*[data-id="testTabRunTestsTabRunAction"]')
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'contract deployment failed', 120000)
  },

  'Should fail when parameters are passed to method in test contract #group3': function (browser: NightwatchBrowser) {
    browser.waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .addFile('tests/methodFailure_test.sol', sources[0]['tests/methodFailure_test.sol'])
      .clickLaunchIcon('filePanel')
      .openFile('tests/methodFailure_test.sol')
      .clickLaunchIcon('solidityUnitTesting')
      .click('*[data-id="testTabCheckAllTests"]')
      .clickElementAtPosition('.singleTestLabel', 2)
      .scrollAndClick('*[data-id="testTabRunTestsTabRunAction"]')
      .waitForElementContainsText('*[data-id="testTabSolidityUnitTestsOutput"]', 'Method \'add\' can not have parameters inside a test contract', 120000)
  },

  'Changing current path #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .addFile('myTests/simple_storage_test.sol', sources[0]['tests/simple_storage_test.sol'])
      .clickLaunchIcon('solidityUnitTesting')
      .execute(() => {
        const myQuery: any = document.getElementById('utPath')
        myQuery.value = 'myTests'
      })
      .click('*[data-id="testTabGenerateTestFolder"]')
      .saveScreenshot('./reports/screenshots/changeCurrentPathg3.png')
      .clickElementAtPosition('.singleTest', 0, { forceSelectIfUnselected: true })
      .scrollAndClick('*[data-id="testTabRunTestsTabRunAction"]')
      .waitForElementPresent('*[data-id="testTabSolidityUnitTestsOutputheader"]', 60000)
      .waitForElementPresent('*[data-id="testTabSolidityUnitTestsOutput"]')
      .clearValue('*[data-id="uiPathInput"]')
      .setValue('*[data-id="uiPathInput"]', 'tests')
      .click('*[data-id="testTabGenerateTestFolder"]')
  },

  'Changing current path when workspace changed and checking test files creation #group4': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .clickLaunchIcon('solidityUnitTesting')
      .waitForElementPresent('*[data-id="uiPathInput"]', 3000)
      .clearValue('*[data-id="uiPathInput"]')
      .setValue('*[data-id="uiPathInput"]', 'tests1')
      .click('*[data-id="testTabGenerateTestFolder"]')
      .clickLaunchIcon('filePanel')
      // creating a new workspace
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementPresent('*[data-id="template-card-remixDefault-0"]')
      .click('*[data-id="template-card-remixDefault-0"]')
      .waitForElementVisible('*[data-id="default-workspace-name-edit-icon"]')
      .click('*[data-id="default-workspace-name-edit-icon"]')
      .waitForElementVisible('*[data-id="workspace-name-input"]')
      .setValue('*[data-id="workspace-name-input"]', 'workspace_new')
      .click('*[data-id="default-workspace-name-edit-icon"]')
      .waitForElementVisible('*[data-id="default-workspace-name-span"]')
      .assert.textContains('*[data-id="default-workspace-name-span"]', 'WORKSPACE_NEW', 'Workspace name is correct')
      .click('*[data-id="validateWorkspaceButton"]')
      .pause(3000)
      .currentWorkspaceIs('workspace_new')
      .expandAllFolders()
      .waitForElementVisible('li[data-id="treeViewLitreeViewItem.deps/remix-tests/remix_tests.sol"]')
      .waitForElementVisible('li[data-id="treeViewLitreeViewItem.deps/remix-tests/remix_accounts.sol"]')
      .openFile('.deps/remix-tests/remix_tests.sol')
      // remix_test.sol should be opened in editor
      .getEditorValue((content) => browser.assert.ok(content.indexOf('library Assert {') !== -1))
      .openFile('.deps/remix-tests/remix_accounts.sol')
      // remix_accounts.sol should be opened in editor
      .getEditorValue((content) => browser.assert.ok(content.indexOf('library TestsAccounts {') !== -1))
      // end of creating
      .clickLaunchIcon('solidityUnitTesting')
      .pause(2000)
      .verify.attributeEquals('*[data-id="uiPathInput"]', 'value', 'tests')
  },

  'Solidity Unit tests Basic #group4': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .clickLaunchIcon('filePanel')
      .openFile('contracts/3_Ballot.sol')
      .clickLaunchIcon('solidityUnitTesting')
      .pause(2000)
      .verify.attributeEquals('*[data-id="uiPathInput"]', 'value', 'tests')
      .pause(2000)
      .scrollAndClick('#runTestsTabRunAction')
      .waitForElementVisible('*[data-id="testTabSolidityUnitTestsOutputheader"]', 120000)
      .waitForElementPresent('#solidityUnittestsOutput div[class^="testPass"]', 60000)
      .waitForElementContainsText('#solidityUnittestsOutput', 'tests/Ballot_test.sol', 60000)
      .waitForElementContainsText('#solidityUnittestsOutput', '✓ Check winning proposal', 60000)
      .waitForElementContainsText('#solidityUnittestsOutput', '✓ Check winnin proposal with return value', 60000)
  },

  'Solidity Unit tests with hardhat console log #group4': function (browser: NightwatchBrowser) {
    const runtimeBrowser = browser.options.desiredCapabilities.browserName

    browser
      .waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .perform((done) => {
        if (runtimeBrowser !== 'chrome') {
          browser.clickLaunchIcon('filePanel')
            .waitForElementVisible('[data-id="treeViewLitreeViewItemtests"]')
        }
        done()
      })
      .addFile('tests/hhLogs_test.sol', sources[0]['tests/hhLogs_test.sol'])
      .clickLaunchIcon('solidityUnitTesting')
      .waitForElementVisible('*[id="idsingleTesttests/Ballot_test.sol"]', 60000)
      .click('*[id="idsingleTesttests/Ballot_test.sol"]')
      .click('#runTestsTabRunAction')
      .pause(2000)
      .waitForElementVisible('*[data-id="testTabSolidityUnitTestsOutputheader"]', 120000)
      .waitForElementPresent('#solidityUnittestsOutput div[class^="testPass"]', 60000)
      .waitForElementContainsText('#solidityUnittestsOutput', 'tests/hhLogs_test.sol', 60000)
      .pause(2000)
      .assert.textContains('#journal > div:nth-child(3) > span', 'Before all:')
      .assert.textContains('#journal > div:nth-child(3) > span', 'Inside beforeAll')
      .assert.textContains('#journal > div:nth-child(4) > span', 'Check sender:')
      .assert.textContains('#journal > div:nth-child(4) > span', 'msg.sender is 0x5B38Da6a701c568545dCfcB03FcB875f56beddC4')
      .assert.textContains('#journal > div:nth-child(5) > span', 'Check int logs:')
      .assert.textContains('#journal > div:nth-child(5) > span', '10 20')
      .assert.textContains('#journal > div:nth-child(5) > span', 'Number is 25')
      .openFile('tests/hhLogs_test.sol')
      .removeFile('tests/hhLogs_test.sol', 'workspace_new')
  },

  'Solidity Unit tests with hardhat console log for EVM revert #group5': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .addFile('tests/ballotFailedLog_test.sol', sources[0]['tests/ballotFailedLog_test.sol'])
      .clickLaunchIcon('solidityUnitTesting')
      .waitForElementVisible('*[id="idsingleTesttests/Ballot_test.sol"]', 60000)
      .click('*[id="idsingleTesttests/Ballot_test.sol"]')
      .click('#runTestsTabRunAction')
      .pause(2000)
      .waitForElementVisible('*[data-id="testTabSolidityUnitTestsOutputheader"]', 120000)
      .waitForElementContainsText('#solidityUnittestsOutput', 'tests/ballotFailedLog_test.sol', 60000)
      .assert.containsText('#journal', 'Check winning proposal:')
      .assert.containsText('#journal', 'Inside checkWinningProposal')
      .openFile('tests/ballotFailedLog_test.sol')
      .removeFile('tests/ballotFailedLog_test.sol', 'workspace_new')
  },

  'Debug tests using debugger #group7': function (browser: NightwatchBrowser) {
    browser
      .waitForElementPresent('*[data-id="verticalIconsKindfilePanel"]')
      .addFile('tests/ballotFailedDebug_test.sol', sources[0]['tests/ballotFailedDebug_test.sol'])
      .clickLaunchIcon('solidityUnitTesting')
      .waitForElementVisible('*[id="idsingleTesttests/Ballot_test.sol"]', 60000)
      .click('*[id="idsingleTesttests/Ballot_test.sol"]')
      .click('#runTestsTabRunAction')
      .waitForElementVisible('*[data-id="testTabSolidityUnitTestsOutputheader"]', 120000)
      .waitForElementContainsText('#solidityUnittestsOutput', 'tests/ballotFailedDebug_test.sol', 60000)
      .waitForElementContainsText('#solidityUnittestsOutput', '✘ Check winning proposal failed', 60000)
      .waitForElementContainsText('#solidityUnittestsOutput', '✓ Check winning proposal passed', 60000)
      .waitForElementContainsText('#solidityUnittestsOutput', '✘ Check winning proposal again', 60000)
      .waitForElementContainsText('#solidityUnittestsOutput', '✓ Check winnin proposal with return value', 60000)
      .click('#Check_winning_proposal_failed')
      .waitForElementContainsText('*[data-id="sidePanelSwapitTitle"]', 'DEBUGGER', 60000)
      .waitForElementContainsText('*[data-id="functionPanel"]', 'checkWinningProposalFailed()', 60000)
      .waitForElementVisible('*[data-id="dropdownPanelSolidityLocals"]').pause(1000)
      .waitForElementContainsText('*[data-id="solidityLocals"]', 'No data available', 60000)
      .goToVMTraceStep(316)
      .waitForElementContainsText('*[data-id="functionPanel"]', 'checkWinningProposalFailed()', 60000)
      .waitForElementContainsText('*[data-id="functionPanel"]', 'vote(proposal)', 60000)
      .waitForElementVisible({
        locateStrategy: 'xpath',
        selector: "//*[@data-id='treeViewDivtreeViewItemsender' and contains(.,'Ballot.Voter')]"
      })
      .checkVariableDebug('soliditylocals', locals)
      .clickLaunchIcon('solidityUnitTesting').pause(2000)
      .scrollAndClick('#Check_winning_proposal_passed')
      .waitForElementContainsText('*[data-id="sidePanelSwapitTitle"]', 'DEBUGGER', 60000)
      .waitForElementContainsText('*[data-id="functionPanel"]', 'checkWinningProposalPassed()', 60000)
      .goToVMTraceStep(1451)
      .waitForElementContainsText('*[data-id="functionPanel"]', 'equal(a, b, message)', 60000)
      .waitForElementContainsText('*[data-id="functionPanel"]', 'checkWinningProposalPassed()', 60000)
      // remix_test.sol should be opened in editor
      .getEditorValue((content) => browser.assert.ok(content.indexOf('library Assert {') !== -1))
      .click('*[id="debuggerTransactionStartButtonContainer"]') // stop debugging
      .openFile('tests/ballotFailedDebug_test.sol')
      .pause(2000)
      .clickLaunchIcon('solidityUnitTesting').pause(2000)
      .waitForElementPresent('#Check_winning_proposal_again')
      .scrollAndClick('#Check_winning_proposal_again')
      .pause(5000)
      .waitForElementContainsText('*[data-id="sidePanelSwapitTitle"]', 'DEBUGGER', 60000)
      .goToVMTraceStep(1151)
      .waitForElementContainsText('*[data-id="functionPanel"]', 'equal(a, b, message)', 60000)
      .waitForElementContainsText('*[data-id="functionPanel"]', 'checkWinningProposalAgain()', 60000)
      //.pause(5000)
      .click('*[id="debuggerTransactionStartButtonContainer"]') // stop debugging
      .openFile('tests/ballotFailedDebug_test.sol')
      .pause(2000)
      .clickLaunchIcon('solidityUnitTesting').pause(2000)
      .pause(5000)
      .scrollAndClick('#Check_winnin_proposal_with_return_value')
      .pause(5000)
      .waitForElementContainsText('*[data-id="sidePanelSwapitTitle"]', 'DEBUGGER', 60000)
      .waitForElementContainsText('*[data-id="functionPanel"]', 'checkWinninProposalWithReturnValue()', 60000)
      .goToVMTraceStep(321)
      .waitForElementContainsText('*[data-id="functionPanel"]', 'checkWinninProposalWithReturnValue()', 60000)
      .clickLaunchIcon('filePanel')
      .pause(2000)
      .openFile('tests/ballotFailedDebug_test.sol')
      .removeFile('tests/ballotFailedDebug_test.sol', 'workspace_new')
  },

  'Basic Solidity Unit tests with local compiler #group6': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-cancun')
      .clickLaunchIcon('solidity')
      .setSolidityCompilerVersion('builtin')
      .click('.remixui_compilerConfigSection')
      .setValue('#evmVersionSelector', 'cancun') // Temporary fix
      .clickLaunchIcon('filePanel')
      .click('*[data-id="treeViewLitreeViewItemcontracts"]')
      .openFile('contracts/3_Ballot.sol')
      .clickLaunchIcon('pluginManager')
      .scrollAndClick('[data-id="pluginManagerComponentDeactivateButtonsolidityUnitTesting"]')
      .pause(2000)
      .scrollAndClick('[data-id="pluginManagerComponentActivateButtonsolidityUnitTesting"]')
      .pause(5000)
      .clickLaunchIcon('solidityUnitTesting')
      .scrollAndClick('#runTestsTabRunAction')
      .waitForElementVisible('*[data-id="testTabSolidityUnitTestsOutputheader"]', 120000)
      .waitForElementPresent('#solidityUnittestsOutput div[class^="testPass"]', 60000)
      .waitForElementContainsText('#solidityUnittestsOutput', 'tests/Ballot_test.sol', 60000)
      .waitForElementContainsText('#solidityUnittestsOutput', '✓ Check winning proposal', 60000)
      .waitForElementContainsText('#solidityUnittestsOutput', '✓ Check winnin proposal with return value', 60000)
      .end()
  }
}

const sources = [
  {
    'simple_storage.sol': {
      content: `
      pragma solidity >=0.4.22 <0.9.0;

      contract SimpleStorage {
        uint public storedData;

        constructor() {
          storedData = 100;
        }

        function set(uint x) public {
          storedData = x;
        }

        function get() public view returns (uint retVal) {
          return storedData;
        }
      }
        `
    },
    'tests/simple_storage_test.sol': {
      content: `
      pragma solidity >=0.4.22 <0.9.0;
      import "remix_tests.sol";
      import "../simple_storage.sol";

      contract MyTest {
        SimpleStorage foo;

        function beforeEach() public {
          foo = new SimpleStorage();
        }

        function initialValueShouldBe100() public returns (bool) {
          return Assert.equal(foo.get(), 100, "initial value is not correct");
        }

        function valueIsSet200() public returns (bool) {
          foo.set(200);
          return Assert.equal(foo.get(), 200, "value is not 200");
        }

        function shouldFailForWrongValue200() public returns (bool) {
          foo.set(300);
          return Assert.equal(foo.get(), 200, "value is not 200");
        }
      }
        `
    },
    'ks2a.sol': {
      content: `
      pragma solidity >=0.4.22 <0.9.0;
      contract Kickstarter {
          enum State { Started, Completed }

          struct Project {
              address owner;
              string name;
              uint goal;
              uint fundsAvailable; // added
              uint amountContributed; // added
              State state;
              mapping(address => uint) funders; // added
          }
          uint numProjects;
          Project[] public projects;

          constructor() {
          }

          function createProject(string memory name, uint goal) public {
              projects.push(); // new line
              Project storage project = projects[projects.length - 1];
              project.name = name;
              project.goal = goal;
              project.owner = msg.sender;
              project.state = State.Started;
          }

          function fundProject(uint projectId) payable public {
          Project storage project = projects[projectId];
              // require project exists
              // PLEASE CHECK / or erase
              // not this: require(projects[projectId].exists, "the project must exist to be funded");

              // require for... underflow/overflow protection
              project.funders[msg.sender] += msg.value;
              project.amountContributed += msg.value;
              project.fundsAvailable += msg.value;

              if (project.amountContributed >= project.goal) {
                  project.state = State.Completed;
              }
          }

          // this function is here because we can't use web3 when using the VM
          function getContractBalance() public view returns(uint balance) {
              return address(this).balance;
          }

      }
        `
    },
    'tests/ks2b_test.sol': {
      content: `
      pragma solidity >=0.4.22 <0.9.0;
      pragma experimental ABIEncoderV2;

      import "remix_tests.sol"; // this import is automatically injected by Remix.
      import "remix_accounts.sol";
      import "../ks2a.sol";

      contract kickstarterTest {
          enum State { Started, Completed }

          Kickstarter kickstarter;

          function beforeAll () public {
            kickstarter = new Kickstarter();
            kickstarter.createProject("ProjectA", 123000);
            kickstarter.createProject("ProjectB", 100);
          }

          /// #sender: account-1
          /// #value: 10000000
          function checkProjectExists () public payable {
              (address owner, string memory name, uint goal, uint fundsAvailable, uint amountContributed, Kickstarter.State state) = kickstarter.projects(0);
              Assert.equal(name, "ProjectA", "project name is incorrect");
              Assert.equal(goal, 123000, "funding goal is incorrect");
              Assert.equal(owner, address(this), "owner is incorrect");
              Assert.equal(msg.sender, TestsAccounts.getAccount(1), "wrong sender");
              Assert.equal(msg.value, 10000000, "wrong value");
          }

          /// #sender: account-1
          /// #value: 10000000
          function checkWrongProjectOwner () public payable {
            (address owner,,,,,) = kickstarter.projects(0);
            Assert.equal(owner, TestsAccounts.getAccount(0), "owner is incorrect"); //failing case
          }

          /// #sender: account-1
          /// #value: 10000000
          function checkWrongSender () public payable {
            Assert.equal(msg.sender, TestsAccounts.getAccount(0), "wrong sender"); //failing case
          }

          /// #sender: account-1
          /// #value: 10000000
          function checkWrongValue () public payable {
            Assert.equal(msg.value, 5000000, "wrong value"); //failing case
          }

          function checkProjectIsFundable () public {
              kickstarter.fundProject{value:120000}(0);
              (address owner, string memory name, uint goal, uint fundsAvailable, uint amountContributed, Kickstarter.State state) = kickstarter.projects(0);
              Assert.equal(amountContributed, 120000, "contributed amount is incorrect");
          }

      }
        `
    },
    'compilationError_test.sol': {
      content: `
      pragma solidity ^0.8.0;

      contract failOnCompilation {
        fallback() {

        }
      }
        `
    },
    'tests/deployError_test.sol': {
      content: `
      pragma solidity ^0.8.0;

      contract failingDeploy {
          constructor() {
              revert('Deploy Failed');
          }
      }
        `
    },
    'tests/methodFailure_test.sol': {
      content: `
      pragma solidity ^0.8.0;

      contract methodfailure {
        function add(uint a, uint b) public {
           uint c = a+b;
           Assert.equal(a+b, c, "wrong value");
        }
      }
        `
    },
    'tests/ballotFailedDebug_test.sol': {
      content: `// SPDX-License-Identifier: GPL-3.0

      pragma solidity >=0.7.0 <0.9.0;
      import "remix_tests.sol"; // this import is automatically injected by Remix.
      import "../contracts/3_Ballot.sol";

      contract BallotTest {

          bytes32[] proposalNames;

          Ballot ballotToTest;
          function beforeAll () public {
              proposalNames.push(bytes32("candidate1"));
              ballotToTest = new Ballot(proposalNames);
          }

          function checkWinningProposalFailed () public {
              ballotToTest.vote(1);
              Assert.equal(ballotToTest.winningProposal(), uint(0), "proposal at index 0 should be the winning proposal");
          }

          function checkWinningProposalPassed () public {
              ballotToTest.vote(0);
              Assert.equal(ballotToTest.winningProposal(), uint(0), "proposal at index 0 should be the winning proposal");
          }

          function checkWinningProposalAgain () public {
              Assert.equal(ballotToTest.winningProposal(), uint(1), "proposal at index 0 should be the winning proposal");
          }

          function checkWinninProposalWithReturnValue () public view returns (bool) {
              return ballotToTest.winningProposal() == 0;
          }
      }`
    },
    'tests/ballotFailedLog_test.sol': {
      content: `// SPDX-License-Identifier: GPL-3.0

      pragma solidity >=0.7.0 <0.9.0;
      import "remix_tests.sol"; // this import is automatically injected by Remix.
      import "../contracts/3_Ballot.sol";

      import "hardhat/console.sol";

      contract BallotTest {

          bytes32[] proposalNames;

          Ballot ballotToTest;
          function beforeAll () public {
              proposalNames.push(bytes32("candidate1"));
              ballotToTest = new Ballot(proposalNames);
          }

          function checkWinningProposal () public {
              console.log("Inside checkWinningProposal");
              ballotToTest.vote(1); // This will revert the transaction
          }
      }`
    },
    'tests/hhLogs_test.sol': {
      content: `// SPDX-License-Identifier: GPL-3.0

      pragma solidity >=0.7.0 <0.9.0;
      import "remix_tests.sol"; // this import is automatically injected by Remix.
      import "hardhat/console.sol";

      contract hhLogs {

          function beforeAll () public {
              console.log('Inside beforeAll');
          }

          function checkSender () public {
              console.log('msg.sender is %s', msg.sender);
              Assert.ok(true, "should be true");
          }

          function checkIntLogs () public {
            console.log(10,20);
            console.log('Number is %d', 25);
            Assert.ok(true, "should be true");
        }
      }`
    }
  }
]

const locals = {
  sender: {
    value: {
      weight: {
        value: '1',
        type: 'uint256'
      },
      voted: {
        value: false,
        type: 'bool'
      },
      delegate: {
        value: '0x0000000000000000000000000000000000000000',
        type: 'address'
      },
      vote: {
        value: '0',
        type: 'uint256'
      }
    },
    type: 'struct Ballot.Voter'
  },
  proposal: {
    value: '1',
    type: 'uint256'
  }
}
