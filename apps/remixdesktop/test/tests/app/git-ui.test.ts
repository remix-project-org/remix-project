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

    // GROUP 1

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
            .waitForElementVisible('*[data-id="addToGitChangesremix.config.json"]')
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
    'look at the commit #group1': function (browser: NightwatchBrowser) {
        browser
            .click('*[data-id="commits-panel"]')
            .waitForElementPresent({
                selector: '//*[@data-id="commit-summary-testcommit-ahead"]',
                locateStrategy: 'xpath'
            })
    },
    'sync the commit #group1': function (browser: NightwatchBrowser) {
        browser
            .pause(1000)
            .waitForElementVisible('*[data-id="sourcecontrol-panel"]')
            .click('*[data-id="sourcecontrol-panel"]')

            .waitForElementVisible('*[data-id="syncButton"]')
            .click('*[data-id="syncButton"]')
            .pause(2000)
            .waitForElementVisible('*[data-id="commitButton"]')
            .click('*[data-id="commits-panel"]')
            .waitForElementPresent({
                selector: '//*[@data-id="commit-summary-testcommit-"]',
                locateStrategy: 'xpath'
            })
    },
    'check the log #group1': async function (browser: NightwatchBrowser) {
        const logs = await getGitLog('/tmp/git/bare.git')
        console.log(logs)
        browser.assert.ok(logs.includes('testcommit'))
    },
    'change a file #group1': function (browser: NightwatchBrowser) {
        browser.
            openFile('test.txt').
            pause(1000).
            setEditorValue('changes', null)
    },
    'stage changed file #group1': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('dgit')
            .click('*[data-id="sourcecontrol-panel"]')
            .waitForElementVisible({
                selector: "//*[@data-status='modified-unstaged' and @data-file='/test.txt']",
                locateStrategy: 'xpath'
            })
            .waitForElementVisible('*[data-id="addToGitChangestest.txt"]')
            .click('*[data-id="addToGitChangestest.txt"]')
            .waitForElementVisible({
                selector: "//*[@data-status='modified-staged' and @data-file='/test.txt']",
                locateStrategy: 'xpath'
            })
            .setValue('*[data-id="commitMessage"]', 'testcommit2')
            .waitForElementPresent({
                selector: '//*[@data-id="commitButton" and not(@disabled)]',
                locateStrategy: 'xpath'
            })
            .click('*[data-id="commitButton"]')
            .waitForElementNotPresent({
                selector: "//*[@data-status='modified-staged' and @data-file='/test.txt']",
                locateStrategy: 'xpath'
            })
    },
    'push the commit #group1': function (browser: NightwatchBrowser) {
        browser
            .click('*[data-id="commands-panel"]')
            .waitForElementVisible('*[data-id="sourcecontrol-push"]')
            .click('*[data-id="sourcecontrol-push"]')
            .pause(2000)
            .click('*[data-id="commits-panel"]')
            .waitForElementPresent({
                selector: '//*[@data-id="commit-summary-testcommit2-"]',
                locateStrategy: 'xpath'
            }).pause(2000)
    },
    'check the log for testcommit2 #group1': async function (browser: NightwatchBrowser) {
        const logs = await getGitLog('/tmp/git/bare.git')
        console.log(logs)
        browser.assert.ok(logs.includes('testcommit2'))
    },
    'clone locally and add a file and push #group1': async function (browser: NightwatchBrowser) {
        await cloneOnServer('http://localhost:6868/bare.git', '/tmp/')
        await onLocalGitRepoAddFile('/tmp/bare/', 'test2.txt')
        await createCommitOnLocalServer('/tmp/bare/', 'testlocal')
        await onLocalGitRepoPush('/tmp/bare/', 'master')
    },
    'run a git fetch #group1': function (browser: NightwatchBrowser) {
        browser
            .pause(2000)
            .click('*[data-id="commands-panel"]')
            .waitForElementVisible('*[data-id="sourcecontrol-fetch-branch"]')

            .click('*[data-id="sourcecontrol-fetch-branch"]')
            .pause(2000)
            .click('*[data-id="commits-panel"]')
            .waitForElementVisible('*[data-id="commits-panel-behind"]')
            .click('*[data-id="commits-panel-behind"]')
            .waitForElementPresent({
                selector: '//*[@data-id="commit-summary-testlocal-"]',
                locateStrategy: 'xpath'
            })
    },
    'run pull from the header #group1': function (browser: NightwatchBrowser) {
        browser.
            click('*[data-id="sourcecontrol-button-pull"]')
            .waitForElementNotPresent('*[data-id="commits-panel-behind"]')
    },
    'check if the file is added #group1': function (browser: NightwatchBrowser) {
        browser
            .clickLaunchIcon('filePanel')
            .waitForElementVisible('*[data-id="treeViewLitreeViewItemtest2.txt"]')
    },
}
const useIsoGit = process.argv.includes('--use-isogit');
if (process.platform.startsWith('win')) {
    module.exports = {}
}
else 
    module.exports = { ...tests }


