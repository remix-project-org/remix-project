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
            .saveScreenshot('./reports/screenshots/gitui.png')
            .waitForElementVisible('*[data-id="github-panel"]')
            .pause(1000)
            .saveScreenshot('./reports/screenshots/gitui2.png')
            .pause(1000)
            .saveScreenshot('./reports/screenshots/gitui3.png')
            .click('*[data-id="github-panel"]')
            .pause(1000)
            .setValue('*[data-id="gitubUsername"]', 'git')
            .pause(1000)
            .setValue('*[data-id="githubEmail"]', 'git@example.com')
            .pause(1000)
            .click('*[data-id="saveGitHubCredentials"]')
            .pause(1000)
            .modalFooterOKClick('github-credentials-error')

    },

    'check file added #group1 #group3': function (browser: NightwatchBrowser) {
        browser
            .addFile('test.txt', { content: 'hello world' }, 'README.md')
            .clickLaunchIcon('dgit')
            .pause(1000)
            .click('*[data-id="sourcecontrol-panel"]')
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
    },

    // group 3
    'rename a file #group3': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest.txt"]')
            .click('*[data-id="treeViewLitreeViewItemtest.txt"]')
            .renamePath('test.txt', 'test_rename', 'test_rename.txt')
            .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest_rename.txt"]')
            .pause(1000)
    },
    'stage renamed file #group3': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('dgit')
            .waitForElementVisible({
                selector: "//*[@data-status='deleted-unstaged' and @data-file='/test.txt']",
                locateStrategy: 'xpath'
            })
            .waitForElementVisible('*[data-id="addToGitChangestest.txt"]')
            .waitForElementVisible({
                selector: "//*[@data-status='new-untracked' and @data-file='/test_rename.txt']",
                locateStrategy: 'xpath'
            })
            .pause(2000)
            .click('*[data-id="sourcecontrol-add-all"]')
            .waitForElementVisible({
                selector: "//*[@data-status='added-staged' and @data-file='/test_rename.txt']",
                locateStrategy: 'xpath'
            })
    },
    'undo the rename #group3': function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="unStageStagedtest_rename.txt"]')
            .click('*[data-id="unStageStagedtest_rename.txt"]')
            .pause(1000)
            .click('*[data-id="unDoStagedtest.txt"]')
            .pause(1000)
            .waitForElementNotPresent({
                selector: "//*[@data-file='/test.txt']",
                locateStrategy: 'xpath'
            })
    },
    'check if file is returned #group3': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest.txt"]')
    },


}

const useIsoGit = process.argv.includes('--use-isogit');
if (process.platform.startsWith('win')) {
    module.exports = {}
}
else 
    module.exports = { ...tests }