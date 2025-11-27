/* eslint-disable @typescript-eslint/no-unused-vars */
'use strict'
import { NightwatchBrowser } from "nightwatch"
import init from "../helpers/init"
import sauce from "./sauce"

module.exports = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  'Should be able to create GIT without credentials #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
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
      .setValue('*[data-id="workspace-name-input"]', 'workspace_blank')
      .click('[data-id="initGitRepositoryLabel"]')
      .click('*[data-id="validateWorkspaceButton"]')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts"]')
      .waitForElementPresent('*[data-id="treeViewLitreeViewItem.git"]')
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemREADME.txt"]')
  },
  'Should add credentials #group1 #group2 #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="topbar-settingsIcon"]')
      .click('*[data-id="topbar-settingsIcon"]')
      .setValue('[data-id="settingsTabgithub-user-name"]', 'circleci')
      .setValue('[data-id="settingsTabgithub-email"]', 'remix@circleci.com')
      .click('[data-id="settingsTabSavegithub-config"]')
  },

  'Should create and initialize a GIT repository #group1': function (browser: NightwatchBrowser) {
    browser
      // .waitForElementNotVisible('[data-id="workspaceGitPanel"]')
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementPresent('*[data-id="template-card-blank-1"]')
      .scrollAndClick('*[data-id="template-card-blank-1"]')
      .waitForElementVisible('*[data-id="workspace-name-blank-input"]')
      .click('*[data-id="workspace-name-blank-input"]')
      .setValue('*[data-id="workspace-name-blank-input"]', 'workspace_blank_git')
      .click('[data-id="initializeAsGitRepo-blank"]')
      .click('*[data-id="validate-blankworkspace-button"]')
      // eslint-disable-next-line dot-notation
      .pause(100)
      .waitForElementVisible('[data-id="workspaceGitPanel"]')
      .waitForElementContainsText('[data-id="workspaceGitBranchesDropdown"]', 'main')
  },
  'check git for the commit #group1': function (browser: NightwatchBrowser) {
    browser.
      clickLaunchIcon('dgit')
      .click('*[data-id="commits-panel"]')
      .waitForElementPresent({
        selector: '//*[@data-id="commits-current-branch-main"]//*[@data-id="commit-summary-Initial commit: remix template blank-"]',
        locateStrategy: 'xpath'
      })
      .click('*[data-id="branches-panel"]')
      .waitForElementPresent({
        selector: '//*[@data-id="branches-panel-content"]//*[@data-id="branches-current-branch-main"]',
        locateStrategy: 'xpath'
      })
  },

  // CLONE REPOSITORY E2E START

  'Should clone a repository #group2': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="github-dropdown-toggle"]')
      .click('*[data-id="github-dropdown-toggle"]')
      .waitForElementVisible('*[data-id="github-dropdown-item-clone"]')
      .click('*[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('[data-id="topbarModalModalDialogModalBody-react"]')
      .click('[data-id="topbarModalModalDialogModalBody-react"]')
      .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
      .setValue('[data-id="modalDialogCustomPromptTextClone"]', 'https://github.com/remix-project-org/awesome-remix')
      .click('[data-id="topbarModal-modal-footer-ok-react"]')
      .waitForElementPresent('.fa-spinner')
      .pause(5000)
      .waitForElementNotPresent('.fa-spinner')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItem.git"]')
      .waitForElementContainsText('[data-id="workspacesSelect"]', 'awesome-remix')
  },

  'Should display dgit icon for cloned workspace #group2': function (browser: NightwatchBrowser) {
    browser
      .switchWorkspace('default_workspace')
      .waitForElementNotVisible('[data-id="workspacesSelect"] .fa-code-branch')
      .switchWorkspace('awesome-remix')
      .waitForElementVisible('[data-id="workspacesSelect"] .fa-code-branch')
  },

  'Should display non-clashing names for duplicate clone #group2': '' + function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="github-dropdown-toggle"]')
      .click('*[data-id="github-dropdown-toggle"]')
      .waitForElementVisible('*[data-id="github-dropdown-item-clone"]')
      .click('*[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('[data-id="topbarModalModalDialogModalBody-react"]')
      .click('[data-id="topbarModalModalDialogModalBody-react"]')
      .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
      .setValue('[data-id="modalDialogCustomPromptTextClone"]', 'https://github.com/remix-project-org/awesome-remix')
      .click('[data-id="topbarModal-modal-footer-ok-react"]')
      .pause(5000)
      .waitForElementContainsText('[data-id="workspacesSelect"]', 'awesome-remix1')
      .waitForElementVisible('*[data-id="github-dropdown-toggle"]')
      .click('*[data-id="github-dropdown-toggle"]')
      .waitForElementVisible('*[data-id="github-dropdown-item-clone"]')
      .click('*[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('[data-id="topbarModalModalDialogModalBody-react"]')
      .click('[data-id="topbarModalModalDialogModalBody-react"]')
      .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
      .setValue('[data-id="modalDialogCustomPromptTextClone"]', 'https://github.com/remix-project-org/awesome-remix')
      .click('[data-id="topbarModal-modal-footer-ok-react"]')
      .pause(5000)
      .waitForElementContainsText('[data-id="workspacesSelect"]', 'awesome-remix2')
      .waitForElementVisible('*[data-id="github-dropdown-toggle"]')
      .click('*[data-id="github-dropdown-toggle"]')
      .waitForElementVisible('*[data-id="github-dropdown-item-clone"]')
      .click('*[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('[data-id="topbarModalModalDialogModalBody-react"]')
      .click('[data-id="topbarModalModalDialogModalBody-react"]')
      .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
      .setValue('[data-id="modalDialogCustomPromptTextClone"]', 'https://github.com/remix-project-org/awesome-remix')
      .click('[data-id="topbarModal-modal-footer-ok-react"]')
      .pause(5000)
      .waitForElementContainsText('[data-id="workspacesSelect"]', 'awesome-remix3')
      .switchWorkspace('awesome-remix')
      .switchWorkspace('awesome-remix1')
      .switchWorkspace('awesome-remix2')
      .switchWorkspace('awesome-remix3')
  },

  'Should display error message in modal for failed clone #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="github-dropdown-toggle"]')
      .click('*[data-id="github-dropdown-toggle"]')
      .waitForElementVisible('*[data-id="github-dropdown-item-clone"]')
      .click('*[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('[data-id="topbarModalModalDialogModalBody-react"]')
      .click('[data-id="topbarModalModalDialogModalBody-react"]')
      .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
      .setValue('[data-id="modalDialogCustomPromptTextClone"]', 'https://github.com/ethereum/non-existent-repo')
      .click('[data-id="topbarModal-modal-footer-ok-react"]')
      .pause(5000)
      .waitForElementVisible('[data-id="cloneGitRepositoryModalDialogModalBody-react"]')
      .waitForElementContainsText('[data-id="cloneGitRepositoryModalDialogModalBody-react"]', 'An error occurred: Please check that you have the correct URL for the repo. If the repo is private, you need to add your github credentials (with the valid token permissions) in the Git plugin')
      .click('[data-id="cloneGitRepository-modal-footer-ok-react"]')
  },

  // CLONE REPOSITORY E2E END

  // GIT BRANCHES E2E START
  'Should show all cloned repo branches #group3': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      // .waitForElementNotVisible('[data-id="workspaceGitPanel"]')
      .waitForElementVisible('*[data-id="github-dropdown-toggle"]')
      .click('*[data-id="github-dropdown-toggle"]')
      .waitForElementVisible('*[data-id="github-dropdown-item-clone"]')
      .click('*[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('[data-id="topbarModalModalDialogModalBody-react"]')
      .click('[data-id="topbarModalModalDialogModalBody-react"]')
      .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
      .setValue('[data-id="modalDialogCustomPromptTextClone"]', 'https://github.com/ioedeveloper/test-branch-change')
      .click('[data-id="topbarModal-modal-footer-ok-react"]')
      .waitForElementPresent('.fa-spinner')
      .pause(7000)
      .waitForElementNotPresent('.fa-spinner')
      .waitForElementContainsText('[data-id="workspacesSelect"]', 'test-branch-change')
      .waitForElementVisible('[data-id="workspaceGitPanel"]')
      .waitForElementVisible('[data-id="workspaceGitBranchesDropdown"]')
      .click('[data-id="workspaceGitBranchesDropdown"]')
      .pause(1000)
      .waitForElementVisible('[data-id="custom-dropdown-menu"]')
      .waitForElementContainsText('[data-id="custom-dropdown-items"]', 'origin/dev')
      .waitForElementContainsText('[data-id="custom-dropdown-items"]', 'origin/production')
      .waitForElementContainsText('[data-id="custom-dropdown-items"]', 'origin/setup')
      .expect.element('[data-id="workspaceGit-main"]').text.to.contain('✓ ')
  },

  'Should a checkout to a remote branch #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('[data-id="custom-dropdown-menu"]')
      .waitForElementContainsText('[data-id="custom-dropdown-items"]', 'origin/dev')
      .waitForElementPresent('[data-id="workspaceGit-origin/dev"]')
      .click('[data-id="workspaceGit-origin/dev"]')
      .pause(5000)
      .waitForElementPresent('[data-id="treeViewDivtreeViewItemdev.ts"]')
      .click('[data-id="workspaceGitBranchesDropdown"]')
      .expect.element('[data-id="workspaceGit-dev"]').text.to.contain('✓ ')
  },

  'Should search for a branch (local and remote) #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('[data-id="custom-dropdown-menu"]')
      .waitForElementPresent('[data-id="workspaceGitInput"]')
      .sendKeys('[data-id="workspaceGitInput"]', 'setup')
      .waitForElementNotPresent('[data-id="workspaceGit-origin/dev"]')
      .waitForElementNotPresent('[data-id="workspaceGit-origin/production"]')
      .waitForElementNotPresent('[data-id="workspaceGit-dev"]')
      .waitForElementNotPresent('[data-id="workspaceGit-main"]')
      .waitForElementPresent('[data-id="workspaceGit-origin/setup"]')
  },

  'Should checkout to a new local branch #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('[data-id="custom-dropdown-menu"]')
      .waitForElementPresent('[data-id="workspaceGitInput"]')
      .clearValue('[data-id="workspaceGitInput"]')
      .sendKeys('[data-id="workspaceGitInput"]', 'newLocalBranch')
      .waitForElementContainsText('[data-id="workspaceGitCreateNewBranch"]', `Create branch: newLocalBranch from 'dev'`)
      .click('[data-id="workspaceGitCreateNewBranch"]')
      .pause(2000)
      .click('[data-id="workspaceGitBranchesDropdown"]')
      .waitForElementVisible('[data-id="custom-dropdown-menu"]')
      .expect.element('[data-id="workspaceGit-newLocalBranch"]').text.to.contain('✓ ')
  },

  'Should checkout to an existing local branch #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('[data-id="custom-dropdown-menu"]')
      .waitForElementPresent('[data-id="workspaceGitInput"]')
      .clearValue('[data-id="workspaceGitInput"]')
      .sendKeys('[data-id="workspaceGitInput"]', [browser.Keys.SPACE, browser.Keys.BACK_SPACE])
      .waitForElementPresent('[data-id="workspaceGit-main"]')
      .click('[data-id="workspaceGit-main"]')
      .pause(2000)
      .waitForElementNotPresent('[data-id="treeViewDivtreeViewItemdev.ts"]')
      .waitForElementPresent('[data-id="treeViewDivtreeViewItemmain.ts"]')
      .click('[data-id="workspaceGitBranchesDropdown"]')
      .expect.element('[data-id="workspaceGit-main"]').text.to.contain('✓ ')
  },

  'Should prevent checkout to a branch if local changes exists #group3': function (browser: NightwatchBrowser) {
    browser
      .renamePath('README.md', 'README_2', 'README_2.md')
      .waitForElementVisible('[data-id="workspaceGitBranchesDropdown"]')
      .waitForElementVisible('[data-id="workspaceGit-dev"]')
      .click('[data-id="workspaceGit-dev"]')
      .waitForElementVisible('[data-id="switchBranchModalDialogContainer-react"]')
      .waitForElementContainsText('[data-id="switchBranchModalDialogModalBody-react"]', 'Your local changes to the following files would be overwritten by checkout.')
      .click('[data-id="switchBranchModalDialogModalFooter-react"]')
      .click('[data-id="switchBranch-modal-footer-cancel-react"]')
      .pause(2000)
      .click('[data-id="workspaceGitBranchesDropdown"]')
      .expect.element('[data-id="workspaceGit-main"]').text.to.contain('✓ ')
  },

  'Should force checkout to a branch with existing local changes #group3': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('[data-id="workspaceGit-dev"]')
      .click('[data-id="workspaceGit-dev"]')
      .waitForElementVisible('[data-id="switchBranchModalDialogContainer-react"]')
      .waitForElementContainsText('[data-id="switchBranchModalDialogModalBody-react"]', 'Your local changes to the following files would be overwritten by checkout.')
      .click('[data-id="switchBranchModalDialogModalFooter-react"]')
      .click('[data-id="switchBranch-modal-footer-ok-react"]')
      .pause(2000)
      .click('[data-id="workspaceGitBranchesDropdown"]')
      .expect.element('[data-id="workspaceGit-dev"]').text.to.contain('✓ ')
  },

  // GIT BRANCHES E2E END

  // GIT SUBMODULES E2E START

  'Should clone a repository with submodules #group4': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('[data-id="github-dropdown-toggle-login"]')
      .click('[data-id="github-dropdown-toggle"]')
      .waitForElementVisible('[data-id="github-dropdown-item-clone"]')
      .click('[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
      .click('[data-id="modalDialogCustomPromptTextClone"]')
      .setValue('[data-id="modalDialogCustomPromptTextClone"]', 'https://github.com/bunsenstraat/test-branch-submodule')
      .click('[data-id="topbarModal-modal-footer-ok-react"]')
      .waitForElementVisible('[data-id="github-dropdown-toggle"]')
      .click('[data-id="github-dropdown-toggle"]')
      .click('[data-id="github-dropdown-item-clone"]')
      .waitForElementVisible('[data-id="topbarModalModalDialogModalBody-react"]')
      .click('[data-id="topbarModalModalDialogModalBody-react"]')
      .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
      .click('[data-id="modalDialogCustomPromptTextClone"]')
      .setValue('[data-id="modalDialogCustomPromptTextClone"]', 'https://github.com/bunsenstraat/test-branch-submodule')
      .click('[data-id="topbarModal-modal-footer-ok-react"]')
      .waitForElementPresent('.fa-spinner')
      .waitForElementVisible({
        selector: '*[data-id="treeViewLitreeViewItem.git"]',
        timeout: 240000
      })
      .waitForElementContainsText('[data-id="workspacesSelect"]', 'test-branch-submodule')
      .waitForElementVisible('[data-id="updatesubmodules"]')
      .click('[data-id="updatesubmodules"]')
      .waitForElementPresent('.fa-spinner')
      .waitForElementVisible({
        selector: '*[data-id="treeViewLitreeViewItem.git"]',
        timeout: 240000,
        abortOnFailure: false,
        suppressNotFoundErrors: true
      })
      .pause(2000)
      // check recursive submodule
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive"]')
      .click('[data-id="treeViewDivDraggableItemREADME.md"]')
      .click('[data-id="treeViewDivDraggableItemtest-branch-submodule-2"]')
      .pause(3000)
      .click('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive"]')
      .click('[data-id="treeViewDivtreeViewItem.git"]')
      .pause(3000)
      .click('[data-id="treeViewDivtreeViewItem.gitmodules"]')
      .click('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive"]')
      .click('[data-id="treeViewDivtreeViewItemlibdeep"]')
      .click('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive"]')
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive/test-branch-submodule-2"]')
      .click('[data-id="treeViewDivDraggableItem.git"]')
      .pause(3000)
      .click('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive"]')
      .pause(3000)
      .click('[data-id="treeViewLitreeViewItemREADME.md"]')
      .click('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive"]')
      .pause(3000)
      .click('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive/test-branch-submodule-2"]')
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive/test-branch-submodule-2/submodule2.ts"]')
      // check test-branch-submodule-2 submodule
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemtest-branch-submodule-2"]')
      .pause(3000)
      .click('[data-id="treeViewDivtreeViewItemtest-branch-submodule-2"]')
      .pause(3000)
      .click('[data-id="treeViewDivtreeViewItemtest-branch-submodule-2"]')
      .pause(3000)
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemtest-branch-submodule-2/submodule2.ts"]')
      // check libdeep submodule
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep"]')
      .click('[data-id="treeViewDivtreeViewItemlibdeep"]')
      .pause(3000)
      .click('[data-id="treeViewDivtreeViewItemlibdeep"]')
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep/test-branch-submodule-2"]')
      .pause(3000)
      .click('[data-id="treeViewDivtreeViewItemlibdeep/test-branch-submodule-2"]')
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep/test-branch-submodule-2/submodule2.ts"]')
      // check libdeep2 submodule
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep2"]')
      .pause(3000)
      .click('[data-id="treeViewDivtreeViewItemlibdeep2"]')
      .pause(3000)
      // .click('[data-id="treeViewDivtreeViewItemlibdeep2"]')
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep2/recursive"]')
      .click('[data-id="treeViewDivtreeViewItemlibdeep2/recursive"]')
      .pause(2000)
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep2/recursive/test-branch-submodule-2"]')
      .pause(3000)
      .click('[data-id="treeViewDivtreeViewItemlibdeep2/recursive/test-branch-submodule-2"]')
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep2/recursive/test-branch-submodule-2/submodule2.ts"]')
  },
  'When switching branches the submodules should disappear #group4': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('[data-id="workspaceGitBranchesDropdown"]')
      .click('[data-id="workspaceGitBranchesDropdown"]')
      .waitForElementVisible('[data-id="custom-dropdown-menu"]')
      .waitForElementContainsText('[data-id="custom-dropdown-items"]', 'origin/empty')
      .waitForElementPresent('[data-id="workspaceGit-origin/empty"]')
      .click('[data-id="workspaceGit-origin/empty"]')
      .waitForElementNotPresent('[data-id="treeViewDivtreeViewItemlibdeep"]')
      .waitForElementNotPresent('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive"]')
      .waitForElementNotPresent('[data-id="treeViewDivtreeViewItemtest-branch-submodule-2"]')
      .click('[data-id="workspacesSelect"]')
      .waitForElementVisible('*[data-id="dropdown-item-test-branch-submodule"]')
      .waitForElementVisible('*[data-id="dropdown-item-default_workspace"]')
      .click('*[data-id="dropdown-item-default_workspace"]')
  },
  'When switching to main update the modules #group4': function (browser: NightwatchBrowser) {
    browser
      .click('[data-id="workspacesSelect"]')
      .waitForElementVisible('*[data-id="dropdown-item-test-branch-submodule"]')
      .click('[data-id="dropdown-item-test-branch-submodule"]')
      .refreshPage()
      .click('[data-id="treeViewUltreeViewMenu"]')
      .waitForElementVisible('[data-id="workspaceGitBranchesDropdown"]')
      .click('[data-id="workspaceGitBranchesDropdown"]')
      .pause(2000)
      .waitForElementVisible('[data-id="custom-dropdown-menu"]')
      .waitForElementContainsText('[data-id="custom-dropdown-items"]', 'origin/main')
      .waitForElementPresent('[data-id="workspaceGit-origin/main"]')
      .click('[data-id="workspaceGit-origin/main"]')
      .waitForElementVisible('[data-id="updatesubmodules"]')
      .click('[data-id="updatesubmodules"]')
      .waitForElementPresent('.fa-spinner')
      .waitForElementVisible({
        selector: '*[data-id="treeViewLitreeViewItem.git"]',
        timeout: 240000
      })
      .pause(2000)
      // check recursive submodule
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive"]')
      .pause(2000)
      .click('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive"]')
      .pause(2000)
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive/test-branch-submodule-2"]')
      .pause(2000)
      .click('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive/test-branch-submodule-2"]')
      .pause(2000)
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemtest-branch-submodule-recursive/test-branch-submodule-2/submodule2.ts"]')
      // check test-branch-submodule-2 submodule
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemtest-branch-submodule-2"]')
      .click('[data-id="treeViewDivtreeViewItemtest-branch-submodule-2"]')
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemtest-branch-submodule-2/submodule2.ts"]')
      .pause(2000)
      // check libdeep submodule
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep"]')
      .click('[data-id="treeViewDivtreeViewItemlibdeep"]')
      .pause(2000)
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep/test-branch-submodule-2"]')
      .pause(2000)
      .click('[data-id="treeViewDivtreeViewItemlibdeep/test-branch-submodule-2"]')
      .pause(2000)
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep/test-branch-submodule-2/submodule2.ts"]')
      // check libdeep2 submodule
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep2"]')
      .click('[data-id="treeViewDivtreeViewItemlibdeep2"]')
      .pause(2000)
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep2/recursive"]')
      .pause(2000)
      .click('[data-id="treeViewDivtreeViewItemlibdeep2/recursive"]')
      .pause(2000)
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep2/recursive/test-branch-submodule-2"]')
      .pause(2000)
      .click('[data-id="treeViewDivtreeViewItemlibdeep2/recursive/test-branch-submodule-2"]')
      .pause(2000)
      .waitForElementVisible('[data-id="treeViewDivtreeViewItemlibdeep2/recursive/test-branch-submodule-2/submodule2.ts"]')
  },

  // GIT SUBMODULES E2E ENDS

  // GIT WORKSPACE E2E STARTS

  'Should create a git workspace (uniswapV4Template) #group4': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementPresent('*[data-id="template-card-uniswapV4Template-0"]')
      .scrollAndClick('*[data-id="template-card-uniswapV4Template-0"]')
      .waitForElementVisible('*[data-id="generic-template-section-uniswapV4Template"]')
      .waitForElementVisible('*[data-id="workspace-name-uniswapV4Template-input"]')
      .click('*[data-id="workspace-name-uniswapV4Template-input"]')
      .setValue('*[data-id="workspace-name-uniswapV4Template-input"]', 'uniswapv4')
      .click('*[data-id="validate-uniswapV4Templateworkspace-button"]')
      .pause(100)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemsrc"]')
      .openFile('src')
      .openFile('src/Counter.sol')
      .pause(1000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`contract Counter is BaseHook {`) !== -1,
          'Incorrect content')
      })
  },

  'Should create Remix default workspace with files #group5': function (browser: NightwatchBrowser) {
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
      .waitForElementVisible('*[data-id="contract-wizard-edit-icon"]')
      .click('*[data-id="contract-wizard-edit-icon"]')
      .waitForElementVisible('*[data-id="contract-wizard-token-name-input"]')
      .setValue('*[data-id="contract-wizard-token-name-input"]', 'MyToken_test')
      .click('*[data-id="contract-wizard-mintable-checkbox"]')
      .click('*[data-id="contract-wizard-burnable-checkbox"]')
      .click('*[data-id="contract-wizard-pausable-checkbox"]')
      .assert.selected('*[data-id="contract-wizard-access-ownable-radio"]', 'checked')
      .click('*[data-id="contract-wizard-validate-workspace-button"]')
      .clickLaunchIcon('filePanel')
      .pause(1000)
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemcontracts/MyToken_test.sol"]')
  },
  'Update settings for git #group5': function (browser: NightwatchBrowser) {
    browser.
      clickLaunchIcon('dgit')
      .waitForElementVisible('*[data-id="initgit-btn"]')
      .click('*[data-id="initgit-btn"]')
      .waitForElementVisible('*[data-id="github-panel"]')
      .pause(1000)
      .click('*[data-id="github-panel"]')
      .waitForElementVisible('*[data-id="gitubUsername"]')
      .setValue('*[data-id="gitubUsername"]', 'git')
      .setValue('*[data-id="githubEmail"]', 'git@example.com')
      .click('*[data-id="saveGitHubCredentials"]')
      .modalFooterOKClick('github-credentials-error')
  },
  'check source control panel #group5': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="sourcecontrol-panel"]')
      .click('*[data-id="sourcecontrol-panel"]')
      .waitForElementVisible({
        selector: "//*[@data-status='new-untracked' and @data-file='/tests/MyToken_test_test.sol']",
        locateStrategy: 'xpath'
      })
  },
  'switch workspace and check git #group5': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('filePanel')
      .switchWorkspace('default_workspace')
  },
  'check source control panel again #group5': function (browser: NightwatchBrowser) {
    browser
      .pause(1000)
      .clickLaunchIcon('dgit')
      .waitForElementVisible({
        selector: '*[data-id="initgit-btn"]',
        suppressNotFoundErrors: true
      })
      .click({
        selector:'*[data-id="initgit-btn"]',
        suppressNotFoundErrors: true
      })
      .pause(2000)
      .waitForElementVisible({
        selector: "//*[@data-status='new-untracked' and @data-file='/tests/storage.test.js']",
        locateStrategy: 'xpath'
      })
  },
  'Should create a git workspace (uniswapV4Template) #group5': function (browser: NightwatchBrowser) {
    browser
      .click('*[data-id="workspacesSelect"]')
      .pause(2000)
      .click('*[data-id="workspacecreate"]')
      .waitForElementVisible('*[data-id="template-explorer-modal-react"]')
      .waitForElementVisible('*[data-id="template-explorer-template-container"]')
      .click('*[data-id="template-explorer-template-container"]')
      .waitForElementPresent('*[data-id="template-card-uniswapV4Template-0"]')
      .scrollAndClick('*[data-id="template-card-uniswapV4Template-0"]')
      .waitForElementVisible('*[data-id="generic-template-section-uniswapV4Template"]')
      .waitForElementVisible('*[data-id="workspace-name-uniswapV4Template-input"]')
      .click('*[data-id="workspace-name-uniswapV4Template-input"]')
      .setValue('*[data-id="workspace-name-uniswapV4Template-input"]', 'uniswapv4-workspace')
      .click('*[data-id="initializeAsGitRepo-uniswapV4Template"]')
      .click('*[data-id="validate-uniswapV4Templateworkspace-button"]')
      .pause(2000)
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemsrc"]')
      .openFile('src')
      .openFile('src/Counter.sol')
      .pause(1000)
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`contract Counter is BaseHook {`) !== -1,
          'Incorrect content')
      })
  },
  'check source control panel for uniswap #group5': function (browser: NightwatchBrowser) {
    browser
      .pause(5000)
      .clickLaunchIcon('dgit')
      .click('*[data-id="remotes-panel"]')
      .waitForElementVisible('*[data-id="remotes-panel-content"]')
      .click({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-detail-origin-default"]',
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: '//*[@data-id="remotes-panel-content"]//*[@data-id="remote-detail-origin-default" and contains(.,"v4-template")]',
        locateStrategy: 'xpath'
      })
  },

  // GIT WORKSPACE E2E ENDS

  tearDown: sauce,
}

const gitmodules = `[submodule "subdemo3"]
path = subdemo3
url = https://github.com/bunsenstraat/empty3
[submodule "testactionsub"]
path = testactionsub
url = https://github.com/bunsenstraat/testactions
`
