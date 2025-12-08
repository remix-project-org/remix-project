'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  'Create blank workspace': function (browser: NightwatchBrowser) {
    browser
      .refreshPage()
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-blank-1"]')
      .click('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="workspace-name-blank-input"]')
      .click('*[data-id="workspace-name-blank-input"]')
      .pause(1000)
      .setValue('*[data-id="workspace-name-blank-input"]', 'Test Blank Workspace')
      .click('*[data-id="validate-blankworkspace-button"]')
      .pause(1000)
      .assert.textContains('*[data-id="workspacesSelect-togglerText"]', 'Test Blank Workspace', 'Workspace name is correct')
      .isVisible('*[data-id="treeViewDivDraggableItemremix.config.json"]')
      .isVisible('*[data-id="treeViewDivDraggableItem.prettierrc.json"]')
      .execute(function () {
        const fileList = document.querySelector('*[data-id="treeViewUltreeViewMenu"]')
        return fileList.getElementsByTagName('li').length;
      }, [], function (result) {
        browser.assert.equal(result.value, 3, 'Incorrect number of files in workspace');
      });
  },
  'Create Pectra 7702 based workspace': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-simpleEip7702-2"]')
      .click('*[data-id="template-card-simpleEip7702-2"]')
      .waitForElementVisible('*[data-id="workspace-name-simpleEip7702-input"]')
      .click('*[data-id="workspace-name-simpleEip7702-input"]')
      .setValue('*[data-id="workspace-name-simpleEip7702-input"]', 'Test Pectra 7702 Workspace')
      .click('*[data-id="validate-simpleEip7702workspace-button"]')
      .pause(1000)
      .assert.textContains('*[data-id="workspacesSelect-togglerText"]', 'Test Pectra 7702 Workspace', 'Workspace name is correct')
      .isVisible('*[data-id="treeViewDivDraggableItemremix.config.json"]')
      .waitForElementVisible('*[data-id="treeViewDivDraggableItemcontracts"]')
      .isVisible('*[data-id="treeViewDivDraggableItemcontracts/Example7702.sol"]')
      .waitForElementNotPresent('*[data-id="treeViewDivDraggableItemtests"]')
  },
  'Create Semaphore based workspace': function (browser: NightwatchBrowser) {
    browser
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
      .waitForElementVisible('*[data-id="workspace-name-semaphore-input"]')
      .click('*[data-id="workspace-name-semaphore-input"]')
      .setValue('*[data-id="workspace-name-semaphore-input"]', 'Test Semaphore Workspace')
      .click('*[data-id="validate-semaphoreworkspace-button"]')
      .pause(1000)
      .assert.textContains('*[data-id="workspacesSelect-togglerText"]', 'Test Semaphore Workspace', 'Workspace name is correct')
      .isVisible('*[data-id="treeViewDivDraggableItemremix.config.json"]')
      .waitForElementVisible('*[data-id="treeViewDivDraggableItemcircuits"]')
      .isVisible('*[data-id="treeViewDivDraggableItemcircuits/semaphore.circom"]')
      .waitForElementNotPresent('*[data-id="treeViewDivDraggableItemtests"]')
      .click('*[data-id="treeViewDivDraggableItemcircuits/semaphore.circom"]')
      .waitForElementVisible('*[data-id="compile-action"]')
      .click('*[data-id="compile-action"]')
      .pause(3000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Everything went okay', 60000)
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewDivDraggableItemcircuits/.bin/semaphore_js"]')
  },
  'Search for Noir Simple Multiplier template': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-search-input"]')
      .click('*[data-id="template-explorer-search-input"]')
      .setValue('*[data-id="template-explorer-search-input"]', 'Simple Multiplier')
      .pause(1000)
      .waitForElementVisible('*[data-id="template-card-multNr-0"]')
      .click('*[data-id="template-card-multNr-0"]')
      .waitForElementVisible('*[data-id="workspace-name-multNr-input"]')
      .click('*[data-id="workspace-name-multNr-input"]')
      .setValue('*[data-id="workspace-name-multNr-input"]', 'Test Simple Multiplier Workspace')
      .click('*[data-id="validate-multNrworkspace-button"]')
      .waitForElementVisible('*[data-id="treeViewDivDraggableItemNargo.toml"]')
      .isVisible('*[data-id="treeViewDivDraggableItemsrc"]')
      .isVisible('*[data-id="treeViewDivDraggableItemsrc/main.nr"]')
      .click('*[data-id="treeViewDivDraggableItemsrc/main.nr"]')
      .waitForElementVisible('*[data-id="compile-action"]')
  },
  'Create OpenZeppelin ERC20 template with Contract Wizard': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="contract-wizard-topcard"]')
      .click('*[data-id="contract-wizard-topcard"]')
      .waitForElementVisible('*[data-id="contract-wizard-container"]')
      .waitForElementVisible('*[data-id="contract-wizard-token-name-input"]')
      .setValue('*[data-id="contract-wizard-token-name-input"]', 'TestToken')
      .click('*[data-id="contract-wizard-mintable-checkbox"]')
      .click('*[data-id="contract-wizard-burnable-checkbox"]')
      .click('*[data-id="contract-wizard-pausable-checkbox"]')
      .assert.selected('*[data-id="contract-wizard-access-ownable-radio"]', 'checked')
      .click('*[data-id="contract-wizard-validate-workspace-button"]')
      .waitForElementVisible('*[data-id="treeViewDivDraggableItemremix.config.json"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/TestToken.sol"]')
      .click('*[data-id="treeViewLitreeViewItemcontracts/TestToken.sol"]')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`contract TestToken is ERC20, ERC20Burnable, ERC20Pausable, Ownable {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"]')
      .click('*[data-id="compile-action"]')
      .waitForElementVisible('#verticalIconsKindsolidity > i.remixui_status.fas.fa-check-circle.text-success.remixui_statusCheck')
      .pause(2000)
  },
  'Create OpenZeppelin ERC721 template with Contract Wizard': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="contract-wizard-topcard"]')
      .click('*[data-id="contract-wizard-topcard"]')
      .waitForElementVisible('*[data-id="contract-wizard-container"]')
      .waitForElementVisible('*[data-id="contract-wizard-token-name-input"]')
      .setValue('*[data-id="contract-wizard-token-name-input"]', 'Test721Token')
      .click('*[data-id="contract-wizard-contract-type-dropdown"]')
      .click('*[data-id="contract-wizard-contract-type-dropdown-item-erc721"]')
      .click('*[data-id="contract-wizard-mintable-checkbox"]')
      .click('*[data-id="contract-wizard-burnable-checkbox"]')
      .click('*[data-id="contract-wizard-pausable-checkbox"]')
      .assert.selected('*[data-id="contract-wizard-access-ownable-radio"]', 'checked')
      .click('*[data-id="contract-wizard-validate-workspace-button"]')
      .pause(1000)
      .perform(function () {
        browser.isVisible('*[data-id="treeViewUltreeViewMenu"]', function (result) {
          if (result.value === false) {
            browser.clickLaunchIcon('filePanel')
          }
        })
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemremix.config.json"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/Test721Token.sol"]')
      .click('*[data-id="treeViewLitreeViewItemcontracts/Test721Token.sol"]')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`contract Test721Token is ERC721, ERC721Pausable, Ownable, ERC721Burnable {`) !== -1,
          'Incorrect content')
      })
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"]')
      .click('*[data-id="compile-action"]')
      // Shows 3 warnings to inform about the deprecation of the use of 'assembly ("memory-safe")' in OZ files
      // See: https://docs.soliditylang.org/en/latest/assembly.html#memory-safety
      .waitForElementVisible('#verticalIconsKindsolidity > i.remixui_status.badge.rounded-pill.bg-warning')
      .clickLaunchIcon('solidity')
      .isVisible('*[data-id="compilation-details"]')
  },
  'Use default workspace and add github actions template #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="home"]')
      .click('*[data-id="landingPageImportFromTemplate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-remixDefault-0"]')
      .click('*[data-id="template-card-remixDefault-0"]')
      .click('*[data-id="default-workspace-name-edit-icon"]')
      .waitForElementVisible('*[data-id="workspace-name-input"]')
      .click('*[data-id="workspace-name-input"]')
      .setValue('*[data-id="workspace-name-input"]', 'Test Default Workspace')
      .click('*[data-id="initGitRepositoryLabel"')
      .click('*[data-id="validateWorkspaceButton"]')
      .pause(1000)
      .assert.textContains('*[data-id="workspacesSelect-togglerText"]', 'Test Default Workspace', 'Workspace name is correct')
      .perform(function () {
        browser.isVisible('*[data-id="treeViewUltreeViewMenu"]', function (result) {
          if (result.value === false) {
            browser.clickLaunchIcon('filePanel')
          }
        })
      })
      .waitForElementVisible('*[data-id="fileExplorerCreateButton"]')
      .click('*[data-id="fileExplorerCreateButton"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .click('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .waitForElementPresent('*[data-id="template-card-runSolidityUnittestingAction-1"]')
      .scrollInto('*[data-id="template-card-runSolidityUnittestingAction-1"]')
      .click('*[data-id="template-card-runSolidityUnittestingAction-1"]')
      .pause(3000)
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItem.github"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.github/workflows"]')
      .click('*[data-id="treeViewLitreeViewItem.github/workflows"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.github/workflows/run-solidity-unittesting.yml"]')
  },
  'Add Mocha Chai Test Workflow template #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton"]')
      .click('*[data-id="fileExplorerCreateButton"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .click('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .scrollInto('*[data-id="template-category-GitHub Actions"]')
      .waitForElementVisible('*[data-id="template-card-runJsTestAction-0"]')
      .click('*[data-id="template-card-runJsTestAction-0"]')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItem.github"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.github/workflows"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.github/workflows/run-js-test.yml"]')
      .click('*[data-id="treeViewLitreeViewItem.github/workflows/run-js-test.yml"]')
      .pause(1500)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`name: Running Mocha Chai Solidity Unit Tests`) !== -1,
          'Correct content')
      })
  },
  'Add Slither Workflow template #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton"]')
      .click('*[data-id="fileExplorerCreateButton"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .click('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .scrollInto('*[data-id="template-category-GitHub Actions"]')
      .waitForElementVisible('*[data-id="template-card-runSlitherAction-2"]')
      .click('*[data-id="template-card-runSlitherAction-2"]')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItem.github"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.github/workflows"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.github/workflows/run-slither-action.yml"]')
      .click('*[data-id="treeViewLitreeViewItem.github/workflows/run-slither-action.yml"]')
      .pause(1500)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`name: Slither Analysis`) !== -1,
          'Correct content')
      })
  },
  'Add Create2 Solidity Factory template #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton"]')
      .click('*[data-id="fileExplorerCreateButton"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .click('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .scrollInto('*[data-id="template-category-Solidity CREATE2"]')
      .waitForElementVisible('*[data-id="template-card-contractCreate2Factory-0"]')
      .click('*[data-id="template-card-contractCreate2Factory-0"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/libs"]')
      .click('*[data-id="treeViewLitreeViewItemcontracts/libs/create2-factory.sol"]')
      .pause(1500)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`contract Create2Factory {`) !== -1,
          'Correct content')
      })
  },
  'Add Contract Deployer Scripts template #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton"]')
      .click('*[data-id="fileExplorerCreateButton"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .click('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .scrollInto('*[data-id="template-category-Solidity CREATE2"]')
      .waitForElementVisible('*[data-id="template-card-contractDeployerScripts-1"]')
      .click('*[data-id="template-card-contractDeployerScripts-1"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/contract-deployer/basic-contract-deploy.ts"]')
      .pause(1500)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const deploy = async (contractName: string, args: Array<any>, accountIndex?: number): Promise<ethers.Contract> => {`) !== -1,
          'Correct content')
      })
  },
  'Add Etherscan scripts template #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton"]')
      .click('*[data-id="fileExplorerCreateButton"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .click('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .scrollInto('*[data-id="template-category-Contract Verification"]')
      .waitForElementVisible('*[data-id="template-card-etherscanScripts-0"]')
      .click('*[data-id="template-card-etherscanScripts-0"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/etherscan"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemscripts/etherscan/receiptGuidScript.ts"]')
      .click('*[data-id="treeViewLitreeViewItemscripts/etherscan/receiptGuidScript.ts"]')
      .pause(1500)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`export const receiptStatus = async (apikey: string, guid: string, isProxyContract?: boolean) => {`) !== -1,
          'Correct content')
      })
  },
  'Confirm that editing workspace name works': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-remixDefault-0"]')
      .click('*[data-id="template-card-remixDefault-0"]')
      .click('*[data-id="validateWorkspaceButton"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="landingPageImportFromTemplate"]')
      .click('*[data-id="landingPageImportFromTemplate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-remixDefault-0"]')
      .click('*[data-id="template-card-remixDefault-0"]')
      .waitForElementVisible('*[data-id="default-workspace-name-span"]')
      .waitForElementVisible('*[data-id="default-workspace-name-span"]')
      .assert.textEquals('*[data-id="default-workspace-name-span"]', 'BASIC - 1', 'Workspace name is correct')
      .click('*[data-id="default-workspace-name-edit-icon"]')
      .waitForElementVisible('*[data-id="workspace-name-input"]')
      .click('*[data-id="workspace-name-input"]')
      .setValue('*[data-id="workspace-name-input"]', 'ChangedWorkspaceName ')
      .click('*[data-id="default-workspace-name-edit-icon"]')
      .waitForElementVisible('*[data-id="default-workspace-name-span"]')
      .click('*[data-id="validateWorkspaceButton"]')
      .currentWorkspaceIs('ChangedWorkspaceName')
      .switchWorkspace('Basic')
  },
  'Creating a workspace with the same name as an existing one should show an error': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-remixDefault-0"]')
      .click('*[data-id="template-card-remixDefault-0"]')
      .waitForElementVisible('*[data-id="default-workspace-name-edit-icon"]')
      .click('*[data-id="default-workspace-name-edit-icon"]')
      .waitForElementVisible('*[data-id="workspace-name-input"]')
      .click('*[data-id="workspace-name-input"]')
      .setValue('*[data-id="workspace-name-input"]', 'Basic')
      .click('*[data-id="default-workspace-name-edit-icon"]')
      .click('*[data-id="validateWorkspaceButton"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="workspaceAlreadyExistsErrorModalDialogModalTitle-react"]')
      .click('*[data-id="workspaceAlreadyExistsError-modal-footer-ok-react"]')
  },
  'Add contract file to workspace using contract wizard #group1': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="template-card-remixDefault-0"]')
      .click('*[data-id="template-card-remixDefault-0"]')
      .click('*[data-id="validateWorkspaceButton"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="fileExplorerCreateButton"]')
      .click('*[data-id="fileExplorerCreateButton"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .click('*[data-id="fileExplorerCreateButton-createNewFile"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .waitForElementVisible('*[data-id="contract-wizard-topcard"]')
      .click('*[data-id="contract-wizard-topcard"]')
      .waitForElementVisible('*[data-id="contract-wizard-container"]')
      .waitForElementVisible('*[data-id="contract-wizard-token-name-input"]')
      .setValue('*[data-id="contract-wizard-token-name-input"]', 'AddedTestContract')
      .click('*[data-id="contract-wizard-validate-workspace-button"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/AddedTestContract.sol"]')
  },
  'Add contract file to workspace using import from IPFS #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="fileExplorerCreateButton"]')
      .click('*[data-id="fileExplorerCreateButton"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton-importFromIpfs"]')
      .click('*[data-id="fileExplorerCreateButton-importFromIpfs"]')
      .waitForElementVisible('*[data-path="templateExplorerModal-Files"]')
      .waitForElementVisible('*[data-id="importFromExternalSource-input"]')
      .setValue('*[data-id="importFromExternalSource-input"]', 'ipfs://QmQQfBMkpDgmxKzYaoAtqfaybzfgGm9b2LWYyT56Chv6xH')
      .click('*[data-id="validateWorkspaceButton"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemipfs/QmQQfBMkpDgmxKzYaoAtqfaybzfgGm9b2LWYyT56Chv6xH"]')
      .click('*[data-id="treeViewLitreeViewItemipfs/QmQQfBMkpDgmxKzYaoAtqfaybzfgGm9b2LWYyT56Chv6xH"]')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`contract Storage {`) !== -1,
          'Correct content')
      })
  },
  'Add contract file to workspace using import from HTTPS #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="fileExplorerCreateButton"]')
      .click('*[data-id="fileExplorerCreateButton"]')
      .waitForElementVisible('*[data-id="fileExplorerCreateButton-importFromIpfs"]')
      .click('*[data-id="fileExplorerCreateButton-importFromIpfs"]')
      .waitForElementVisible('*[data-path="templateExplorerModal-Files"]')
      .waitForElementVisible('*[data-id="importFromExternalSource-input"]')
      .setValue('*[data-id="importFromExternalSource-input"]', 'https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC6909/ERC6909.sol')
      .click('*[data-id="validateWorkspaceButton"]')
      .pause(1000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemgithub/OpenZeppelin"]')
      .click('*[data-id="treeViewLitreeViewItemgithub/OpenZeppelin"]')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemgithub/OpenZeppelin/openzeppelin-contracts"]')
      .click('*[data-id="treeViewDivtreeViewItemgithub/OpenZeppelin/openzeppelin-contracts"]')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemgithub/OpenZeppelin/openzeppelin-contracts/contracts"]')
      .click('*[data-id="treeViewDivtreeViewItemgithub/OpenZeppelin/openzeppelin-contracts/contracts"]')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemgithub/OpenZeppelin/openzeppelin-contracts/contracts/token"]')
      .click('*[data-id="treeViewDivtreeViewItemgithub/OpenZeppelin/openzeppelin-contracts/contracts/token"]')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemgithub/OpenZeppelin/openzeppelin-contracts/contracts/token/ERC6909"]')
      .click('*[data-id="treeViewDivtreeViewItemgithub/OpenZeppelin/openzeppelin-contracts/contracts/token/ERC6909"]')
      .waitForElementVisible('*[data-id="treeViewDivtreeViewItemgithub/OpenZeppelin/openzeppelin-contracts/contracts/token/ERC6909/ERC6909.sol"]')
      .click('*[data-id="treeViewDivtreeViewItemgithub/OpenZeppelin/openzeppelin-contracts/contracts/token/ERC6909/ERC6909.sol"]')
      .pause(2000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`contract ERC6909 is Context, ERC165, IERC6909 {`) !== -1,
          'Correct content')
      })
      .end()
  }
}
