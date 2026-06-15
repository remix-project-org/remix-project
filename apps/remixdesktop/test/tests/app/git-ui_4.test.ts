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
            .saveScreenshot('./reports/screenshots/gitui1.png')
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
            .pause(1000)

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
            .saveScreenshot('./reports/screenshots/gitui4.png')
            .waitForElementVisible('*[data-id="addToGitChangestest.txt"]')
            .saveScreenshot('./reports/screenshots/gitui5.png')
            .pause(1000)
            .click('*[data-id="addToGitChangestest.txt"]')
            .saveScreenshot('./reports/screenshots/gitui6.png')
            .waitForElementVisible({
                selector: "//*[@data-status='added-staged' and @data-file='/test.txt']",
                locateStrategy: 'xpath'
            })
            .saveScreenshot('./reports/screenshots/gitui7.png')
            .setValue('*[data-id="commitMessage"]', 'testcommit')
            .saveScreenshot('./reports/screenshots/gitui8.png')
            .waitForElementPresent({
                selector: '//*[@data-id="commitButton" and not(@disabled)]',
                locateStrategy: 'xpath'
            })
            .saveScreenshot('./reports/screenshots/gitui9.png')
            .click('*[data-id="commitButton"]')
            .saveScreenshot('./reports/screenshots/gitui10.png')
            .execute(function() {
                const el = document.querySelector('[data-id="terminalJournal"]');
                if (el) {
                    el.scrollTop = el.scrollHeight;
                }
            })
            .waitForElementPresent({
                selector: '//*[@data-id="commitButton" and @disabled]',
                locateStrategy: 'xpath'
            })
            .saveScreenshot('./reports/screenshots/gitui11.png')
            
            .waitForElementNotPresent({
                selector: "//*[@data-status='added-staged' and @data-file='/test.txt']",
                locateStrategy: 'xpath'
            })
    },
    'look at the commit #group1': function (browser: NightwatchBrowser) {
        browser
            .click('*[data-id="commits-panel"]')
            .saveScreenshot('./reports/screenshots/gitui12.png')
            .waitForElementPresent({
                selector: '//*[@data-id="commit-summary-testcommit-ahead"]',
                locateStrategy: 'xpath'
            })
    },
    'add second remote #group4': function (browser: NightwatchBrowser) {
        browser
            .pause(1000)
            .click('*[data-id="remotes-panel"]')
            .waitForElementVisible('*[data-id="add-manual-remoteurl"]')
            .setValue('*[data-id="add-manual-remoteurl"]', 'http://localhost:6868/bare2.git')
            .waitForElementVisible('*[data-id="add-manual-remotename"]')
            .setValue('*[data-id="add-manual-remotename"]', 'origin2')
            .waitForElementVisible('*[data-id="add-manual-remotebtn"]')
            .click('*[data-id="add-manual-remotebtn"]')
    },
    'check the buttons #group4': function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="default-remote-check-origin"]')
            .waitForElementVisible('*[data-id="set-as-default-origin2"]')
    },
    'check the commands #group4': function (browser: NightwatchBrowser) {
        browser
            .click('*[data-id="commands-panel"]')
            .waitForElementVisible({
                selector: "//div[@id='commands-remote-origin-select']//div[contains(@class, 'singleValue') and contains(text(), 'origin')]",
                locateStrategy: 'xpath'
            })
    },
    'switch to origin2 #group4': function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="remotes-panel"]')
            .pause(2000)
            .click('*[data-id="remotes-panel"]')
            .waitForElementVisible('*[data-id="fetch-repositories"]')
            .waitForElementVisible('*[data-id="set-as-default-origin2"]')
            .click('*[data-id="set-as-default-origin2"]')
    },
    'check the commands for origin2 #group4': function (browser: NightwatchBrowser) {
        browser
            .click('*[data-id="commands-panel"]')
            .waitForElementVisible({
                selector: "//div[@id='commands-remote-origin-select']//div[contains(@class, 'singleValue') and contains(text(), 'origin2')]",
                locateStrategy: 'xpath'
            })
    },
    'sync the commit #group4': function (browser: NightwatchBrowser) {
        browser
            .pause(1000)
            .waitForElementVisible('*[data-id="sourcecontrol-panel"]')
            .click('*[data-id="sourcecontrol-panel"]')
            .waitForElementVisible('*[data-id="syncButton"]')
            .click('*[data-id="syncButton"]')
            .waitForElementVisible('*[data-id="commitButton"]')
            .click('*[data-id="commits-panel"]')
            .waitForElementPresent({
                selector: '//*[@data-id="commit-summary-testcommit-"]',
                locateStrategy: 'xpath'
            })
    },
    'check the log #group4': async function (browser: NightwatchBrowser) {
        const logs = await getGitLog('/tmp/git/bare2.git')
        console.log(logs)
        browser.assert.ok(logs.includes('testcommit'))
        const logs2 = await getGitLog('/tmp/git/bare.git')
        console.log(logs2)
        console.log(logs2.includes('testcommit3'))
        browser.assert.ok(logs2.includes('testcommit3'))
    },
    'switch to origin #group4': function (browser: NightwatchBrowser) {
        browser
            .waitForElementVisible('*[data-id="remotes-panel"]')
            .pause(2000)
            .click('*[data-id="remotes-panel"]')
            .waitForElementVisible('*[data-id="fetch-repositories"]')
            .waitForElementVisible('*[data-id="set-as-default-origin"]')
            .pause(1000)
            .click('*[data-id="set-as-default-origin"]')
    },
    'check the commands for origin #group4': function (browser: NightwatchBrowser) {
        browser
            .click('*[data-id="commands-panel"]')
            .waitForElementVisible({
                selector: "//div[@id='commands-remote-origin-select']//div[contains(@class, 'singleValue') and contains(text(), 'origin')]",
                locateStrategy: 'xpath'
            })
    },
    'check the commit ahead #group4': function (browser: NightwatchBrowser) {
        browser
            .pause(1000)
            .waitForElementVisible('*[data-id="sourcecontrol-panel"]')
            .click('*[data-id="sourcecontrol-panel"]')
            .waitForElementVisible('*[data-id="syncButton"]')
            // do not sync
            .click('*[data-id="commits-panel"]')
            .waitForElementPresent({
                selector: '//*[@data-id="commit-summary-testcommit-ahead"]',
                locateStrategy: 'xpath'
            })
    },
}

const useIsoGit = process.argv.includes('--use-isogit');
if (process.platform.startsWith('win')) {
    module.exports = {}
}
else 
    module.exports = { ...tests }