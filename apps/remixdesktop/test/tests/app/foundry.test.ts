import { NightwatchBrowser } from 'nightwatch'
import { ChildProcess, spawn, execSync } from 'child_process'
import { homedir } from 'os'
import path from 'path'
import os from 'os'

const projectDir = path.join('remix-desktop-test-' + Date.now().toString())
const dir = '/tmp/' + projectDir

const tests = {
    before: function (browser: NightwatchBrowser, done: VoidFunction) {
        browser.hideToolTips()
        done()
    },
    installFoundry: function (browser: NightwatchBrowser) {
        browser.hideToolTips().perform(async (done) => {
            await downloadFoundry()
            await installFoundry()
            await initFoundryProject()
            done()
        })
    },
    addScript: function (browser: NightwatchBrowser) {
        // run script in console
        browser.executeAsync(function (dir, done) {
            (window as any).electronAPI.openFolderInSameWindow(dir + '/hello_foundry/').then(done)
        }, [dir], () => {
            console.log('done window opened')
        })
            .waitForElementVisible('*[data-id="treeViewDivDraggableItemfoundry.toml"]', 10000)
    },
    compile: function (browser: NightwatchBrowser) {
        browser.perform(async (done) => {
            console.log('generating compilation result')
            await buildFoundryProject()
            done()
        })
            .expect.element('*[data-id="terminalJournal"]').text.to.contain('receiving compilation result from Foundry').before(60000)
        
        let contractAaddress
        browser.clickLaunchIcon('filePanel')
            .openFile('src')
            .openFile('src/Counter.sol')
            .clickLaunchIcon('udapp')
            .selectContract('Counter')
            .createContract('')
            .getAddressAtPosition(0, (address) => {
                console.log(contractAaddress)
                contractAaddress = address
            })
            .clickInstance(0)
            .clickFunction(0, 0)
            .perform((done) => {
                browser.testConstantFunction(0, 1, null, '0:\nuint256: 1').perform(() => {
                    done()
                })
            })
    }
}
async function downloadFoundry(): Promise<void> {
    console.log('downloadFoundry', process.cwd())
    try {
        const server = spawn('curl -L https://foundry.paradigm.xyz | bash', [], { cwd: process.cwd(), shell: true, detached: true })
        return new Promise((resolve, reject) => {
            server.stdout.on('data', function (data) {
                console.log(data.toString())
                if (
                    data.toString().includes("simply run 'foundryup' to install Foundry")
                    || data.toString().includes("foundryup: could not detect shell, manually add")
                ) {
                    console.log('resolving')
                    resolve()
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

async function installFoundry(): Promise<void> {
    console.log('installFoundry', process.cwd())
    try {
        const server = spawn('export PATH="' + homedir() + '/.foundry/bin:$PATH" && foundryup', [], { cwd: process.cwd(), shell: true, detached: true })
        return new Promise((resolve, reject) => {
            server.stdout.on('data', function (data) {
                console.log(data.toString())
                if (
                    data.toString().includes("foundryup: use - chisel 1.0.0-stable")
                ) {
                    console.log('resolving')
                    resolve()
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

async function initFoundryProject(): Promise<void> {
    console.log('initFoundryProject', homedir())
    try {
        // Check if running in any CI environment
        const isCI = process.env.CIRCLECI || process.env.GITHUB_ACTIONS;
        if (isCI) {
            spawn('git config --global user.email \"you@example.com\"', [], { cwd: homedir(), shell: true, detached: true })
            spawn('git config --global user.name \"Your Name\"', [], { cwd: homedir(), shell: true, detached: true })
        }
        spawn('mkdir ' + projectDir, [], { cwd: '/tmp/', shell: true, detached: true })
        const server = spawn('export PATH="' + homedir() + '/.foundry/bin:$PATH" && forge init hello_foundry', [], { cwd: dir, shell: true, detached: true })
        server.stdout.pipe(process.stdout)
        return new Promise((resolve, reject) => {
            server.on('exit', function (exitCode) {
                console.log("Child exited with code: " + exitCode);
                console.log('end')
                resolve()
            })
            server.stderr.on('err', function (data) {
                console.log('err', data.toString())
            })
            server.stdout.on('data', function (data) {
                console.log('data', data.toString())
            })
        })
    } catch (e) {
        console.log(e)
    }
}

async function buildFoundryProject(): Promise<void> {
    console.log('buildFoundryProject', homedir())
    try {
        const server = spawn('export PATH="' + homedir() + '/.foundry/bin:$PATH" && forge build', [], { cwd: dir + '/hello_foundry', shell: true, detached: true })
        server.stdout.pipe(process.stdout)
        return new Promise((resolve, reject) => {
            server.on('exit', function (exitCode) {
                console.log("Child exited with code: " + exitCode);
                console.log('end')
                resolve()
            })
        })
    } catch (e) {
        console.log(e)
    }
}



module.exports = {
    ...{}//...process.platform.startsWith('linux') ? tests : {}
}