import { ChildProcess, spawn } from "child_process"
import kill from 'tree-kill'
import { Nightwatch, NightwatchBrowser } from "nightwatch"
import { spawnGitServer, getGitLog, cloneOnServer, onLocalGitRepoAddFile, createCommitOnLocalServer, onLocalGitRepoPush, getBranches } from "../../lib/git"
let gitserver: ChildProcess

/* 
/ uses the git-http-backend package to create a git server ( if needed kill the server: kill -9 $(sudo lsof -t -i:6868)  )
/ GROUP 1: file operations PUSH PULL COMMIT SYNC FETCH CLONE ADD
/ GROUP 2: branch operations CREATE & PUBLISH
/ GROUP 3: file operations rename delete
*/

const tests = {
    before: function (browser: NightwatchBrowser, done: VoidFunction) {
        browser.hideToolTips()
        done()
    },
    after: function (browser: NightwatchBrowser) {
        browser.perform((done) => {
            console.log('kill server', gitserver.pid)
            kill(gitserver.pid)
            done()
        })
    },

    'run server #group1 #group2 #group3': function (browser: NightwatchBrowser) {
        browser.hideToolTips().perform(async (done) => {
            gitserver = await spawnGitServer('/tmp/')
            console.log('working directory', process.cwd())
            done()
        })
    },

    'clone a repo #group1 #group2 #group3': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('dgit')
            .pause(5000)
            .waitForElementVisible('*[data-id="cloneButton"]')
            .click('*[data-id="cloneButton"]')
            .pause(1000)
            .waitForElementVisible('[data-id="fileSystemModalDialogModalBody-react"]')
            .click('[data-id="fileSystemModalDialogModalBody-react"]')
            .waitForElementVisible('[data-id="modalDialogCustomPromptTextClone"]')
            .setValue('*[data-id="modalDialogCustomPromptTextClone"]', 'http://localhost:6868/bare.git')
            .click('[data-id="fileSystem-modal-footer-ok-react"]')
            .pause(5000)
            .windowHandles(function (result) {
                console.log(result.value)
                browser.hideToolTips().switchWindow(result.value[1])
                    .hideToolTips()
                    .waitForElementVisible('*[data-id="treeViewLitreeViewItem.git"]')
                    .hideToolTips()
            })
            .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.md"]')
    },
    'Update settings for git #group1 #group2 #group3': function (browser: NightwatchBrowser) {
        browser.
            clickLaunchIcon('dgit')
            .waitForElementVisible('*[data-id="github-panel"]')
            .pause(1000)
            .click('*[data-id="github-panel"]')
            .pause(1000)
            .setValue('*[data-id="gitubUsername"]', 'git')
            .pause(1000)
            .setValue('*[data-id="githubEmail"]', 'git@example.com')
            .pause(1000)
            .click('*[data-id="saveGitHubCredentials"]')
            .modalFooterOKClick('github-credentials-error')

    },

    // GROUP 2 
    'create a branch #group2': function (browser: NightwatchBrowser) {
        browser
            .click('*[data-id="branches-panel"]')
            .waitForElementVisible('*[data-id="newbranchname"]')
            .setValue('*[data-id="newbranchname"]', 'testbranch')
            .click('*[data-id="sourcecontrol-create-branch"]')
            .waitForElementVisible('*[data-id="branches-current-branch-testbranch"]')
            .pause(1000)
    },
    'check if the branch is in the filePanel #group2': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('filePanel')
            .pause(1000)
            .waitForElementVisible('*[data-id="workspaceGitBranchesDropdown"]')
            .click('[data-id="workspaceGitBranchesDropdown"]')
            .waitForElementVisible('*[data-id="workspaceGit-testbranch"]')
            .expect.element('[data-id="workspaceGit-testbranch"]').text.to.contain('✓ ')
    },
    'publish the branch #group2': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('dgit')
            .waitForElementVisible('*[data-id="sourcecontrol-panel"]')
            .click('*[data-id="sourcecontrol-panel"]')
            .pause(1000)
            .click('*[data-id="publishBranchButton"]')
            .pause(2000)
            .waitForElementNotVisible('*[data-id="publishBranchButton"]')
    },
    'check if the branch is published #group2': async function (browser: NightwatchBrowser) {
        const branches = await getBranches('/tmp/git/bare.git')
        browser.assert.ok(branches.includes('testbranch'))
    },
    'add file to new branch #group2': function (browser: NightwatchBrowser) {
        browser
            .pause(1000)
            .addFile('test.txt', { content: 'hello world' }, 'README.md')
            .clickLaunchIcon('dgit')
            .pause(2000)
            .waitForElementVisible({
                selector: "//*[@data-status='new-untracked' and @data-file='/test.txt']",
                locateStrategy: 'xpath'
            })
            .waitForElementVisible('*[data-id="addToGitChangestest.txt"]')
            .pause(1000)
            .click('*[data-id="addToGitChangestest.txt"]')
            .waitForElementVisible({
                selector: "//*[@data-status='added-staged' and @data-file='/test.txt']",
                locateStrategy: 'xpath'
            })
            .waitForElementVisible({
                selector: "//*[@data-status='new-untracked' and @data-file='/remix.config.json']",
                locateStrategy: 'xpath'
            })
            .waitForElementVisible('*[data-id="addToGitChangesremix.config.json"]')
            .pause(1000)
            .click('*[data-id="addToGitChangesremix.config.json"]')
            .waitForElementVisible({
                selector: "//*[@data-status='added-staged' and @data-file='/remix.config.json']",
                locateStrategy: 'xpath'
            })
            .setValue('*[data-id="commitMessage"]', 'testcommit')
            .waitForElementPresent({
                selector: '//*[@data-id="commitButton" and not(@disabled)]',
                locateStrategy: 'xpath'
            })
            .click('*[data-id="commitButton"]')
            .waitForElementPresent({
                selector: '//*[@data-id="commitButton" and @disabled]',
                locateStrategy: 'xpath'
            })
            .waitForElementNotPresent({
                selector: "//*[@data-status='added-staged' and @data-file='/test.txt']",
                locateStrategy: 'xpath'
            })
            .waitForElementNotPresent({
                selector: "//*[@data-status='added-staged' and @data-file='/remix.config.json']",
                locateStrategy: 'xpath'
            })
    },
    'check if the commit is ahead in the branches list #group2': function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="branches-panel"]')
            .click('*[data-id="branches-panel"]')
            .waitForElementVisible('*[data-id="branches-current-branch-testbranch"]')
            .pause(1000)
            .click({
                selector: "//*[@data-id='branches-panel-content']//*[@data-id='branches-current-branch-testbranch']",
                locateStrategy: 'xpath',
                suppressNotFoundErrors: true
            })
            .pause(1000)
            .click({
                selector: "//*[@data-id='branches-panel-content']//*[@data-id='commits-panel-ahead']",
                locateStrategy: 'xpath',
                suppressNotFoundErrors: true
            })
            .pause(1000)
            .click({
                selector: "//*[@data-id='branches-panel-content']//*[@data-id='branchdifference-commits-testbranch-ahead']//*[@data-id='commit-summary-testcommit-ahead']",
                locateStrategy: 'xpath',
            })
            .pause(1000)
            .click({
                selector: "//*[@data-id='branches-panel-content']//*[@data-id='branchdifference-commits-testbranch-ahead']//*[@data-id='commit-change-added-test.txt']",
                locateStrategy: 'xpath',
            })
            .pause(1000)
            .click({
                selector: "//*[@data-id='branches-panel-content']//*[@data-id='local-branch-commits-testbranch']//*[@data-id='commit-summary-testcommit-ahead']",
                locateStrategy: 'xpath',
            })
            .pause(1000)
            .waitForElementVisible({
                selector: "//*[@data-id='branches-panel-content']//*[@data-id='local-branch-commits-testbranch']//*[@data-id='commit-change-added-test.txt']",
                locateStrategy: 'xpath',
            })
    },
    'switch back to master #group2': function (browser: NightwatchBrowser) {
        browser
            .click({
                selector: "//*[@data-id='branches-panel-content']//*[@data-id='branches-toggle-branch-master']",
                locateStrategy: 'xpath',
            })
            .waitForElementVisible({
                selector: "//*[@data-id='branches-panel-content']//*[@data-id='branches-toggle-current-branch-master']",
                locateStrategy: 'xpath',
            })
    },
    'check if test file is gone #group2': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('filePanel')
            .waitForElementNotPresent('*[data-id="treeViewLitreeViewItemtest.txt"]')
    }
}

const useIsoGit = process.argv.includes('--useIsoGit');
if (process.platform.startsWith('win')) {
    module.exports = {}
}
else 
    module.exports = { ...tests }