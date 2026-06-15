import { NightwatchBrowser } from 'nightwatch'
import { ChildProcess, spawn, execSync } from 'child_process'
import { homedir } from 'os'
import path from 'path'
import os from 'os'

const dir = path.join('remix-desktop-test-' + Date.now().toString())

const tests = {
    before: function (browser: NightwatchBrowser, done: VoidFunction) {
        browser.hideToolTips()
        done()
    },
    setuphardhat: function (browser: NightwatchBrowser) {
        browser.perform(async (done) => {
            await setupHardhatProject()
            done()
        })
    },
    addScript: function (browser: NightwatchBrowser) {
        // run script in console
        browser.executeAsync(function (dir, done) {
            (window as any).electronAPI.openFolderInSameWindow('/tmp/' + dir).then(done)
        }, [dir], () => {
            console.log('done window opened')
        })
            .waitForElementVisible('*[data-id="treeViewDivDraggableItemhardhat.config.js"]', 10000)
    },
    compile: function (browser: NightwatchBrowser) {
        browser.perform(async (done) => {
            console.log('generating compilation result')
            await compileHardhatProject()
            done()
        })
            .expect.element('*[data-id="terminalJournal"]').text.to.contain('receiving compilation result from Hardhat').before(60000)
        let addressRef
        browser.clickLaunchIcon('filePanel')
            .openFile('contracts')
            .openFile('contracts/Token.sol')
            .clickLaunchIcon('udapp')
            .selectAccount('0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c')
            .selectContract('Token')
            .createContract('')
            .clickInstance(0)
            .clickFunction(0, 0, ['0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c'])
            .getAddressAtPosition(0, (address) => {
                addressRef = address
            })
            .perform((done) => {
                browser.verifyCallReturnValue(addressRef, ['0:uint256: 1000000'])
                    .perform(() => done())
            })
    }
}

async function compileHardhatProject(): Promise<void> {
    console.log(process.cwd())
    try {
        const server = spawn('npx hardhat compile', [], { cwd: '/tmp/' + dir, shell: true, detached: true })
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

async function setupHardhatProject(): Promise<void> {
    console.log('setup hardhat project', dir)
    try {
        const server = spawn(`git clone https://github.com/NomicFoundation/hardhat-boilerplate ${dir} && cd ${dir} && yarn install && yarn add "@typechain/ethers-v5@^10.1.0" && yarn add "@typechain/hardhat@^6.1.2" && yarn add "typechain@^8.1.0" && echo "END"`, [], { cwd: '/tmp/', shell: true, detached: true, stdio: 'inherit' })
        server.on('error', function (err) {
            console.error('Failed to start process:', err);
        });
        server.on('close', function (code) {
            console.log(`Process closed with code ${code}`);
        });
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

// because error micro-eth-signer@0.16.0: The engine "node" is incompatible with this module. Expected version ">= 20.19.0". Got "20.16.0"
// we need to disable the test

module.exports = {}

/*
module.exports = {
    ...process.platform.startsWith('win')?{}:tests
}
*/
