import { ChildProcess, spawn } from "child_process"
import kill from 'tree-kill'
import init from "../helpers/init"
import { Nightwatch, NightwatchBrowser } from "nightwatch"
let gitserver: ChildProcess

/*
/ uses the git-http-backend package to create a git server ( if needed kill the server: kill -9 $(sudo lsof -t -i:6868)  )
/ GROUP 1: file operations PUSH PULL COMMIT SYNC FETCH CLONE ADD
/ GROUP 2: branch operations CREATE & PUBLISH
/ GROUP 3: file operations rename delete
*/

module.exports = {
  '@disabled': true,
  before: function (browser, done) {
    init(browser, done)
  },
  after: function (browser: NightwatchBrowser) {
    browser.perform((done) => {
      console.log('kill server', gitserver.pid)
      kill(gitserver.pid)
      done()
    })
  },

  'run server #group1 #group2 #group3 #group4': function (browser: NightwatchBrowser) {
    browser.perform(async (done) => {
      gitserver = await spawnGitServer('/tmp/')
      console.log('working directory', process.cwd())
      done()
    })
  },
  'Update settings for git #group1 #group2 #group3 #group4': function (browser: NightwatchBrowser) {
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
      .pause(2000)
  },
  'clone a repo #group1 #group2 #group3 #group4': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="clone-panel"]')
      .click('*[data-id="clone-panel"]')
      .waitForElementVisible('*[data-id="clone-url"]')
      .setValue('*[data-id="clone-url"]', 'http://localhost:6868/bare.git')
      .waitForElementVisible('*[data-id="clone-btn"]')
      .click('*[data-id="clone-btn"]')
      .clickLaunchIcon('filePanel')
      .waitForElementVisible('*[data-id="treeViewLitreeViewItemREADME.md"]')
  },

  // GROUP 1

  'check file added #group1 #group3 #group4': function (browser: NightwatchBrowser) {
    browser.
      addFile('test.txt', { content: 'hello world' }, 'README.md')
      .clickLaunchIcon('dgit')
      .pause(3000)
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
      .click('*[data-id="commitButton"]')
  },
  'look at the commit #group1 #group4': function (browser: NightwatchBrowser) {
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
      .click('*[data-id="commitButton"]')
  },
  'push the commit #group1': function (browser: NightwatchBrowser) {
    // const tag = browser.options.desiredCapabilities?.browserName === 'firefox' ? 'ahead' : ''
    browser
      .waitForElementVisible('*[data-id="commands-panel"]', 60000)
      .click('*[data-id="commands-panel"]')
      .waitForElementVisible('*[data-id="sourcecontrol-push"]', 60000)
      .click('*[data-id="sourcecontrol-push"]')
      .pause(2000)
      .waitForElementVisible('*[data-id="commits-panel"]', 60000)
      .click('*[data-id="commits-panel"]')
      .waitForElementPresent({
        selector: `//*[@data-id="commit-summary-testcommit2-"]`,
        locateStrategy: 'xpath',
        timeout: 60000
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
      .pause(3000)
      .waitForElementVisible({
        selector: "//*[@data-status='deleted-unstaged' and @data-file='/test.txt']",
        locateStrategy: 'xpath'
      })
      .waitForElementVisible('*[data-id="addToGitChangestest.txt"]')
      .waitForElementVisible({
        selector: "//*[@data-status='new-untracked' and @data-file='/test_rename.txt']",
        locateStrategy: 'xpath'
      })
      .click('*[data-id="sourcecontrol-add-all"]')
      .pause(2000)
      .waitForElementVisible({
        selector: "//*[@data-status='deleted-staged' and @data-file='/test.txt']",
        locateStrategy: 'xpath'
      })
      .waitForElementVisible({
        selector: "//*[@data-status='added-staged' and @data-file='/test_rename.txt']",
        locateStrategy: 'xpath'
      })
  },
  'undo the rename #group3': function (browser: NightwatchBrowser) {
    browser

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

  // GROUP 2
  'create a branch #group2': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('dgit')
      .pause(3000)
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
      .waitForElementVisible('*[data-id="workspaceGitBranchesDropdown"]')
      .pause(1000)
      .click('[data-id="workspaceGitBranchesDropdown"]')
      .expect.element('[data-id="workspaceGit-testbranch"]').text.to.contain('✓ ')
  },
  'publish the branch #group2': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('dgit')
      .pause(3000)
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
      .setValue('*[data-id="commitMessage"]', 'testcommit')
      .click('*[data-id="commitButton"]')
      .pause(1000)
  },
  'check if the commit is ahead in the branches list #group2': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="branches-panel"]')
      .click('*[data-id="branches-panel"]')
      .waitForElementVisible('*[data-id="branches-current-branch-testbranch"]')
      .click({
        selector: "//*[@data-id='branches-panel-content']//*[@data-id='branches-current-branch-testbranch']",
        locateStrategy: 'xpath',
        suppressNotFoundErrors: true
      })
      .click({
        selector: "//*[@data-id='branches-panel-content']//*[@data-id='commits-panel-ahead']",
        locateStrategy: 'xpath',
        suppressNotFoundErrors: true
      })
      .click({
        selector: "//*[@data-id='branches-panel-content']//*[@data-id='branchdifference-commits-testbranch-ahead']//*[@data-id='commit-summary-testcommit-ahead']",
        locateStrategy: 'xpath',
      })
      .click({
        selector: "//*[@data-id='branches-panel-content']//*[@data-id='branchdifference-commits-testbranch-ahead']//*[@data-id='commit-change-added-test.txt']",
        locateStrategy: 'xpath',
      })
      .click({
        selector: "//*[@data-id='branches-panel-content']//*[@data-id='local-branch-commits-testbranch']//*[@data-id='commit-summary-testcommit-ahead']",
        locateStrategy: 'xpath',
      })
      .waitForElementVisible({
        selector: "//*[@data-id='branches-panel-content']//*[@data-id='local-branch-commits-testbranch']//*[@data-id='commit-change-added-test.txt']",
        locateStrategy: 'xpath',
      })
  },
  'switch back to master #group2': '' + function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible({
        selector: "//*[@data-id='branches-panel-content']//*[@data-id='branches-toggle-branch-master']",
        locateStrategy: 'xpath',
      })
      .click({
        selector: "//*[@data-id='branches-panel-content']//*[@data-id='branches-toggle-branch-master']",
        locateStrategy: 'xpath',
      })
      .pause(1000)
      .click({
        selector: "//*[@data-id='branches-panel-content']//*[@data-id='branches-toggle-branch-master']",
        locateStrategy: 'xpath',
        abortOnFailure: false,
        suppressNotFoundErrors: true
      })
      .waitForElementVisible({
        selector: "//*[@data-id='branches-panel-content']//*[@data-id='branches-toggle-current-branch-master']",
        locateStrategy: 'xpath',
        timeout: 60000
      })
  },
  'check if test file is gone #group2': '' + function (browser: NightwatchBrowser) {
    browser
      .pause(2000)
      .clickLaunchIcon('filePanel')
      .waitForElementNotPresent('*[data-id="treeViewLitreeViewItemtest.txt"]')
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
    browser.assert.fail(logs2.includes('testcommit'))
  },
  'switch to origin #group4': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remotes-panel"]')
      .pause(2000)
      .click('*[data-id="remotes-panel"]')
      .waitForElementVisible('*[data-id="fetch-repositories"]')
      .waitForElementVisible('*[data-id="set-as-default-origin"]')
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
      .waitForElementVisible('*[data-id="syncButton"]', 60000)
    // do not sync
      .click('*[data-id="commits-panel"]')
      .waitForElementPresent({
        selector: '//*[@data-id="commit-summary-testcommit-ahead"]',
        locateStrategy: 'xpath'
      })
  },
}

async function getBranches(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const git = spawn('git', ['branch'], { cwd: path })
    let branches = ''
    git.stdout.on('data', function (data) {
      console.log('stdout git branches', data.toString())
      branches += data.toString()
    })
    git.stderr.on('data', function (data) {
      console.log('stderr git branches', data.toString())
      reject(data.toString())
    })
    git.on('close', function () {
      resolve(branches)
    })
  })
}

async function getGitLog(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const git = spawn('git', ['log'], { cwd: path })
    let logs = ''
    git.stdout.on('data', function (data) {
      logs += data.toString()
    })
    git.stderr.on('err', function (data) {
      reject(data.toString())
    })
    git.on('close', function () {
      resolve(logs)
    })
  })
}

async function cloneOnServer(repo: string, path: string, name: string = 'bare') {
  console.log('cloning', repo, path)
  return new Promise((resolve, reject) => {
    const git = spawn(`rm -rf ${name} && git`, ['clone', repo], { cwd: path, shell: true, detached: true });

    git.stdout.on('data', function (data) {
      console.log('stdout data cloning', data.toString());
      if (data.toString().includes('done')) {
        resolve(git);
      }
    });

    git.stderr.on('data', function (data) {
      console.log('stderr data cloning', data.toString());
      if (data.toString().includes('into')) {
        setTimeout(() => {
          resolve(git);
        }, 5000)
      }
    });

    git.on('error', (error) => {
      reject(`Process error: ${error.message}`);
    });

    git.on('exit', (code, signal) => {
      if (code !== 0) {
        reject(`Process exited with code: ${code} and signal: ${signal}`);
      }
    });
  });
}

async function onLocalGitRepoAddFile(path: string, file: string) {
  console.log('adding file', file)
  return new Promise((resolve, reject) => {
    const git = spawn('touch', [file], { cwd: path });

    git.stdout.on('data', function (data) {
      console.log('stdout data adding file', data.toString());
      if (data.toString().includes('done')) {
        resolve(git);
      }
    });

    git.stderr.on('data', function (data) {
      console.error('stderr adding file', data.toString());
      reject(data.toString());
    });

    git.on('error', (error) => {
      reject(`Process error: ${error.message}`);
    });

    git.on('exit', (code, signal) => {
      if (code !== 0) {
        reject(`Process exited with code: ${code} and signal: ${signal}`);
      } else {
        resolve(git);
      }
    });
  });
}

async function onLocalGitRepoPush(path: string, branch: string = 'master') {
  console.log('pushing', path)
  return new Promise((resolve, reject) => {
    const git = spawn('git', ['push', 'origin', branch], { cwd: path, shell: true, detached: true });

    git.stdout.on('data', function (data) {
      console.log('stdout data pushing', data.toString());
      if (data.toString().includes('done')) {
        resolve(git);
      }
    });

    git.stderr.on('data', function (data) {
      console.error('stderr data pushing', data.toString());
      if (data.toString().includes(branch)) {
        resolve(git);
      }
    });

    git.on('error', (error) => {
      reject(`Process error: ${error.message}`);
    });

    git.on('exit', (code, signal) => {
      if (code !== 0) {
        reject(`Process exited with code: ${code} and signal: ${signal}`);
      } else {
        resolve(git);
      }
    });
  });
}

async function createCommitOnLocalServer(path: string, message: string) {
  console.log('committing', message, path)
  return new Promise((resolve, reject) => {
    const git = spawn('git add . && git', ['commit', '-m', message], { cwd: path, shell: true, detached: true });

    git.stdout.on('data', function (data) {
      console.log('data stdout committing', data.toString());
      if (data.toString().includes(message)) {
        setTimeout(() => {
          resolve(git);
        }, 1000)
      }
    });

    git.stderr.on('data', function (data) {
      console.error('data committing', data.toString());
      reject(data.toString());
    });

    git.on('error', (error) => {
      console.error('error', error);
      reject(`Process error: ${error.message}`);
    });

    git.on('exit', (code, signal) => {
      if (code !== 0) {
        console.error('exit', code, signal);
        reject(`Process exited with code: ${code} and signal: ${signal}`);
      } else {
        resolve(git);
      }
    });
  });
}

async function spawnGitServer(path: string): Promise<ChildProcess> {
  console.log(process.cwd())
  try {
    const server = spawn('yarn && sh setup.sh && yarn start:server', [`${path}`], { cwd: process.cwd() + '/apps/remix-ide-e2e/src/githttpbackend/', shell: true, detached: true })
    console.log('spawned', server.stdout.closed, server.stderr.closed)
    return new Promise((resolve, reject) => {
      server.stdout.on('data', function (data) {
        console.log(data.toString())
        if (
          data.toString().includes('is listening')
                    || data.toString().includes('address already in use')
        ) {
          console.log('resolving')
          resolve(server)
        }
      })
      server.stderr.on('err', function (data) {
        console.log(data.toString())
        reject(data.toString())
      })
    })
  } catch (e) {
    console.log(e)
  }
}
