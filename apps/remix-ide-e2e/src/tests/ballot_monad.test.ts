'use strict'

import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
import examples from '../examples/example-contracts'

const payableContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PayableTest {
    event Received(address sender, uint amount);

    function receivePayment() public payable {
        emit Received(msg.sender, msg.value);
    }

    function getBalance() public view returns (uint) {
        return address(this).balance;
    }
}
`

const monadSigningContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "hardhat/console.sol";

contract MonadSigning {
    uint256 public value;
    uint256 public nonce;

    function storeSigned(uint256 newValue, uint8 v, bytes32 r, bytes32 s) external {
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("Monad signing"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
        bytes32 messageHash = keccak256(abi.encode(
            keccak256("Store(uint256 value,uint256 nonce)"), newValue, nonce
        ));
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", domainSeparator, messageHash));
        address signer = ecrecover(digest, v, r, s);
        require(signer == msg.sender, "Invalid signature");

        nonce++;
        value = newValue;
        console.log("Stored value", newValue);
        console.log("Signer", signer);
    }
}
`

const signAndExecuteScript = `
import { ethers } from 'ethers'

// Get metadata - try artifacts first, fallback to compiler API
let metadata
try {
  metadata = JSON.parse(await remix.call('fileManager', 'readFile', 'artifacts/MonadSigning.json'))
} catch (e) {
  const compilationResult = await remix.call('compilerArtefacts', 'getArtefactsByContractName', 'MonadSigning')
  const artifact = compilationResult.artefact
  metadata = { abi: artifact.abi, data: { bytecode: artifact.evm.bytecode } }
}

const provider = new ethers.BrowserProvider(web3Provider)
const account: string = ethers.getAddress(await remix.call('udappEnv', 'getSelectedAccount'))
const signer = await provider.getSigner(account)
const factory = new ethers.ContractFactory(metadata.abi, metadata.data.bytecode.object, signer)
const contract = await factory.deploy()
await contract.waitForDeployment()
const address: string = await contract.getAddress()
const instance = new ethers.Contract(address, metadata.abi, signer)

const domain = { name: 'Monad signing', version: '1', chainId: (await provider.getNetwork()).chainId, verifyingContract: address }
const types = { Store: [{ name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }]}
const message = { value: 42, nonce: await instance.nonce() }
const signature: string = await signer.signTypedData(domain, types, message)
if (ethers.verifyTypedData(domain, types, message, signature) !== account) throw new Error('Typed signature recovery failed')

const typedData = ethers.TypedDataEncoder.getPayload(domain, types, message)
await remix.call('fileManager', 'writeFile', 'MonadTypedData.json', JSON.stringify(typedData, null, 2))
const parts = ethers.Signature.from(signature)
const transaction = await instance.storeSigned(message.value, parts.v, parts.r, parts.s)
await transaction.wait()
if (await instance.value() !== 42n) throw new Error('Signed storage write failed')
const logs = await provider.send('eth_getHHLogsForTx', [transaction.hash])
for (const args of logs) console.log(...args)
console.log(\`Stored 42 at \${address}. Debug transaction: \${transaction.hash}\`)

`

const sources = [
  { 'Untitled.sol': { content: examples.ballot.content } },
  { 'PayableTest.sol': { content: payableContract } },
  { 'MonadSigning.sol': { content: monadSigningContract } },
  { 'sign-and-execute.ts': { content: signAndExecuteScript } }
]

module.exports = {
  "@disabled": true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) {
    init(browser, done)
  },
  '@sources': function () {
    return sources
  },
  'Add Ballot for Monad VM #group1': function (browser: NightwatchBrowser) {
    browser
      .addFile('Untitled.sol', sources[0]['Untitled.sol'])
  },
  'Verify Monad VM (Ten) badge displays correctly #group1': function (browser: NightwatchBrowser) {
    browser
      .waitForElementVisible('*[data-id="remixIdeIconPanel"]', 10000)
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-monad-ten', 'Monad_VM')
      .waitForElementVisible('[data-id="deploy-widget-header"]')
      .assert.textContains('[data-id="deploy-widget-header"] .badge', 'Monad VM (Ten)')
  },

  'Verify Monad VM (Nine) badge displays correctly #group1': function (browser: NightwatchBrowser) {
    browser
      .switchEnvironment('vm-monad-nine', 'Monad_VM')
      .waitForElementVisible('[data-id="deploy-widget-header"]')
      .assert.textContains('[data-id="deploy-widget-header"] .badge', 'Monad VM (Nine)')
  },

  'Verify Monad VM (Eight) badge displays correctly #group1': function (browser: NightwatchBrowser) {
    browser
      .switchEnvironment('vm-monad-eight', 'Monad_VM')
      .waitForElementVisible('[data-id="deploy-widget-header"]')
      .assert.textContains('[data-id="deploy-widget-header"] .badge', 'Monad VM (Eight)')
  },

  'Verify Monad VM (Next) badge displays correctly #group1': function (browser: NightwatchBrowser) {
    browser
      .switchEnvironment('vm-monad-next', 'Monad_VM')
      .waitForElementVisible('[data-id="deploy-widget-header"]')
      .assert.textContains('[data-id="deploy-widget-header"] .badge', 'Monad VM (Next)')
  },

  'Verify account balance displays in MON currency on Monad VM #group1': function (browser: NightwatchBrowser) {
    browser
      .switchEnvironment('vm-monad-ten', 'Monad_VM')
      .waitForElementVisible('[data-id="deploy-widget-header"]')
      .waitForElementVisible('[data-id="runTabSelectAccount"]')
      .click('[data-id="runTabSelectAccount"]')
      .waitForElementVisible('.custom-dropdown-items.show')
      .waitForElementVisible('[data-id="0x5B38Da6a701c568545dCfcB03FcB875f56beddC4"]')
      .assert.textContains('[data-id="0x5B38Da6a701c568545dCfcB03FcB875f56beddC4"] .account-balance-text', 'MON')
  },

  'Deploy Ballot on Monad VM #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('solidity')
      .testContracts('Untitled.sol', sources[0]['Untitled.sol']!, ['Ballot'])
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-monad-ten', 'Monad_VM')
      .createContract('["0x48656c6c6f20576f726c64210000000000000000000000000000000000000000"]')
      .waitForElementVisible('[data-id="deployedContractItem-0"]')
      .assert.textContains('[data-id="deployedContractItem-0"] .badge', 'Monad VM (Ten)')
      .clickInstance(0)
      .waitForElementVisible('[data-id="deployedContractBal"]')
      .assert.textContains('[data-id="deployedContractBal"]', 'MON')
      .clickFunction(0, 0, ['"0x4b0897b0513fdc7c541b6d9d7e929c4e5364d2db"'])
      .testFunction('last',
        {
          status: '1 Transaction mined and execution completed',
          'decoded input': { 'address to': '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB' }
        })
  },

  'Deploy PayableTest contract & Send 1 MON to verify MON unit in terminal #group1': function (browser: NightwatchBrowser) {
    let txHash: string
    browser
      .addFile('PayableTest.sol', { content: payableContract })
      .clickLaunchIcon('solidity')
      .testContracts('PayableTest.sol', { content: payableContract }, ['PayableTest'])
      .clickLaunchIcon('udapp')
      .createContract('')
      .clickInstance(1)
      .waitForElementVisible('[data-id="deployedContractItem-1-function-0"]')
      .waitForElementVisible('[data-id="contractItem-sendValue-1"]')
      .clearValue('[data-id="contractItem-sendValue-1"]')
      .setValue('[data-id="contractItem-sendValue-1"]', '1')
      .click('#contractItem-valueUnit-1')
      .waitForElementVisible('[data-id="contractItem-valueUnit-1-ether"]')
      .click('[data-id="contractItem-valueUnit-1-ether"]')
      .clickFunction(1, 0)
      .perform((done: VoidFunction) => {
        browser.getLastTransactionHash((hash) => {
          txHash = hash
          done()
        })
      })
      .testFunction('last', {
        status: '1 Transaction mined and execution completed'
      })
      .perform(() => {
        browser.assert.textContains(`[data-id="txLoggerTable${txHash}"]`, '1.0 MON')
      })
  },

  'Call method from Ballot to check return value on Monad VM #group1': function (browser: NightwatchBrowser) {
    browser
      .clickFunction(0, 6)
      // Test in terminal - check that it's calling Ballot.winnerName()
      .journalLastChildIncludes('Ballot.winnerName()')
      .testFunction('last',
        {
          'decoded output': { 0: 'bytes32: winnerName_ 0x48656c6c6f20576f726c64210000000000000000000000000000000000000000' }
        })
      // Test in Udapp UI , treeViewDiv0 shows returned value on method click
      .assert.textContains('*[data-id="treeViewDiv0"]', 'bytes32: winnerName_ 0x48656c6c6f20576f726c64210000000000000000000000000000000000000000')
  },

  'Access Ballot via at address on Monad VM #group1': function (browser: NightwatchBrowser) {
    let ballotAddress: string
    browser
      .perform((done: VoidFunction) => {
        browser.getAddressAtPosition(0, (address) => {
          ballotAddress = address
          done()
        })
      })
      .perform(() => {
        browser
          .addFile('ballot.abi', { content: ballotABI })
          .clearDeployedContracts()
          .clickLaunchIcon('filePanel')
          .addAtAddressInstance(ballotAddress, true, true)
          .waitForElementVisible({
            locateStrategy: 'xpath',
            selector: `//*[@id='instance${ballotAddress}']`
          })
          .clickInstance(0)
          .clickFunction(0, 1, ['"0x4b0897b0513fdc7c541b6d9d7e929c4e5364d2db"'])
          .testFunction('last',
            {
              status: '0 Transaction mined but execution failed',
              'decoded input': { 'address to': '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB' }
            })
      })
  },

  'Compile, deploy and test EIP-712 signing with sign-and-execute script #group2': function (browser: NightwatchBrowser) {
    browser
      .addFile('contracts/MonadSigning.sol', { content: monadSigningContract })
      .clickLaunchIcon('solidity')
      .openFile('contracts/MonadSigning.sol')
      .pause(1000)
      .click('[data-id="compile-action"]')
      .clickLaunchIcon('solidity')
      .waitForElementVisible('[data-id="compiledContracts"]', 60000)
      .testContracts('contracts/MonadSigning.sol', { content: monadSigningContract }, ['MonadSigning'])
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-monad-ten', 'Monad_VM')
      .waitForElementVisible('[data-id="deploy-widget-header"]')
      .selectContract('MonadSigning')
      .createContract('')
      .waitForElementVisible('[data-id="deployedContractItem-0"]')
      .addFile('scripts/sign-and-execute.ts', { content: signAndExecuteScript })
      .pause(2000)
      .openFile('scripts/sign-and-execute.ts')
      .pause(1000)
      .waitForElementVisible('[data-id="run-script-dropdown-trigger"]', 5000)
      .click('[data-id="run-script-dropdown-trigger"]')
      .waitForElementVisible('[data-id="run-script-dropdown-panel"]', 5000)
      .pause(500)
      .waitForElementVisible('[data-id="run-with-ethers6-menu-item"]', 5000)
      .click('[data-id="run-with-ethers6-menu-item"]')
      .pause(3000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Stored 42 at', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Stored value', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Signer', 60000)
      .openFile('MonadTypedData.json')
      .pause(1000)
      .getEditorValue((content) => {
        const typedData = JSON.parse(content)
        // Chain ID can be hex (0x8f) or decimal (143)
        const chainId = typeof typedData.domain.chainId === 'string' && typedData.domain.chainId.startsWith('0x')
          ? parseInt(typedData.domain.chainId, 16).toString()
          : typedData.domain.chainId.toString()
        browser.assert.equal(chainId, '143', 'Chain ID is 143 for Monad')
        browser.assert.equal(typedData.message.value, '42', 'Message value is 42')
      })
      // Note: The script already verifies signature verification and nonce increment internally
      // (checks value === 42 and would throw error if signature verification failed)
      .end()
  }
}

const ballotABI = `[
{
  "inputs": [
    {
      "internalType": "bytes32[]",
      "name": "proposalNames",
      "type": "bytes32[]"
    }
  ],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "constructor"
},
{
  "constant": true,
  "inputs": [],
  "name": "chairperson",
  "outputs": [
    {
      "internalType": "address",
      "name": "",
      "type": "address"
    }
  ],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
},
{
  "constant": false,
  "inputs": [
    {
      "internalType": "address",
      "name": "to",
      "type": "address"
    }
  ],
  "name": "delegate",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
},
{
  "constant": false,
  "inputs": [
    {
      "internalType": "address",
      "name": "voter",
      "type": "address"
    }
  ],
  "name": "giveRightToVote",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
},
{
  "constant": true,
  "inputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "name": "proposals",
  "outputs": [
    {
      "internalType": "bytes32",
      "name": "name",
      "type": "bytes32"
    },
    {
      "internalType": "uint256",
      "name": "voteCount",
      "type": "uint256"
    }
  ],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
},
{
  "constant": false,
  "inputs": [
    {
      "internalType": "uint256",
      "name": "proposal",
      "type": "uint256"
    }
  ],
  "name": "vote",
  "outputs": [],
  "payable": false,
  "stateMutability": "nonpayable",
  "type": "function"
},
{
  "constant": true,
  "inputs": [
    {
      "internalType": "address",
      "name": "",
      "type": "address"
    }
  ],
  "name": "voters",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "weight",
      "type": "uint256"
    },
    {
      "internalType": "bool",
      "name": "voted",
      "type": "bool"
    },
    {
      "internalType": "address",
      "name": "delegate",
      "type": "address"
    },
    {
      "internalType": "uint256",
      "name": "vote",
      "type": "uint256"
    }
  ],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
},
{
  "constant": true,
  "inputs": [],
  "name": "winnerName",
  "outputs": [
    {
      "internalType": "bytes32",
      "name": "winnerName_",
      "type": "bytes32"
    }
  ],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
},
{
  "constant": true,
  "inputs": [],
  "name": "winningProposal",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "winningProposal_",
      "type": "uint256"
    }
  ],
  "payable": false,
  "stateMutability": "view",
  "type": "function"
}
]`
