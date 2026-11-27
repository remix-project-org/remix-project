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

const delegatedAccountContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DelegatedChild {}

contract DelegatedAccount {
    uint256 public value;
    event Stored(address account, uint256 value);
    error Rejected();

    receive() external payable {}

    function self() external view returns (address) {
        return address(this);
    }

    function store(uint256 newValue) external {
        value = newValue;
        emit Stored(address(this), value);
    }

    function reject() external {
        value = 99;
        emit Stored(address(this), value);
        revert Rejected();
    }

    function transfer(address payable recipient, uint256 amount) external {
        (bool success,) = recipient.call{value: amount}("");
        require(success);
    }

    function createChild() external returns (address) {
        return address(new DelegatedChild());
    }

    function createChild2() external returns (address) {
        return address(new DelegatedChild{salt: bytes32(0)}());
    }
}
`

const accessListContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AccessListTest {
    uint256 public value1;
    uint256 public value2;
    uint256 public value3;

    constructor() {
        value1 = 100;
        value2 = 200;
        value3 = 300;
    }

    function store(uint256 newValue) external {
        value1 = newValue;
    }

    function readMultiple() external view returns (uint256, uint256, uint256) {
        return (value1, value2, value3);
    }
}
`

const accessListScript = `
/* global remix, web3Provider */
import { ethers } from 'ethers'

// Get metadata - try artifacts first, fallback to compiler API
let metadata
try {
  metadata = JSON.parse(await remix.call('fileManager', 'readFile', 'artifacts/AccessListTest.json'))
} catch (e) {
  const compilationResult = await remix.call('compilerArtefacts', 'getArtefactsByContractName', 'AccessListTest')
  const artifact = compilationResult.artefact
  metadata = { abi: artifact.abi, data: { bytecode: artifact.evm.bytecode } }
}

const provider = new ethers.BrowserProvider(web3Provider, undefined, { cacheTimeout: -1 })
const [account] = await provider.send('eth_accounts', [])
const signer = await provider.getSigner(account)
const wallet = new ethers.Wallet(ethers.hexlify(await provider.send('eth_getPKey', [account])))

// Deploy contract
const factory = new ethers.ContractFactory(metadata.abi, metadata.data.bytecode.object, signer)
const contract = await factory.deploy()
await contract.waitForDeployment()
const address = await contract.getAddress()
console.log(\`Contract deployed at: \${address}\`)

// Store initial value
const storeTx = await contract.store(42)
await storeTx.wait()
console.log(\`Stored value 42: \${storeTx.hash}\`)

const chainId = (await provider.getNetwork()).chainId
const nonce = await provider.getTransactionCount(account)

// Estimate gas for transaction WITHOUT access list (Type-2)
const gasEstimate1 = await provider.estimateGas({
  type: 2,
  to: address,
  data: contract.interface.encodeFunctionData('store', [100])
})

// Transaction WITHOUT access list (Type-2)
const tx1 = await wallet.signTransaction({
  type: 2,
  chainId,
  nonce,
  to: address,
  data: contract.interface.encodeFunctionData('store', [100]),
  gasLimit: gasEstimate1,
  maxFeePerGas: 2_000_000_000,
  maxPriorityFeePerGas: 1_000_000_000
})
const hash1 = await provider.send('eth_sendRawTransaction', [tx1])
const receipt1 = await provider.getTransactionReceipt(hash1)
console.log(\`Type-2 (no access list) gas used: \${receipt1.gasUsed.toString()}\`)

// Transaction WITH access list (Type-1) - includes storage slot 0
const accessList = [{
  address: address,
  storageKeys: [ethers.ZeroHash] // Slot 0 (value1)
}]

// Estimate gas for transaction WITH access list
const gasEstimate2 = await provider.estimateGas({
  type: 1,
  to: address,
  data: contract.interface.encodeFunctionData('store', [200]),
  accessList
})

const tx2 = await wallet.signTransaction({
  type: 1,
  chainId,
  nonce: nonce + 1,
  to: address,
  data: contract.interface.encodeFunctionData('store', [200]),
  gasLimit: gasEstimate2,
  gasPrice: 1_000_000_000,
  accessList
})
const hash2 = await provider.send('eth_sendRawTransaction', [tx2])
const receipt2 = await provider.getTransactionReceipt(hash2)
console.log(\`Type-1 (with access list) gas used: \${receipt2.gasUsed.toString()}\`)

// Get traces to show SSTORE gas costs
const trace1 = await provider.send('debug_traceTransaction', [hash1])
const trace2 = await provider.send('debug_traceTransaction', [hash2])

const sstoreStep1 = trace1.structLogs.find(step => step.op === 'SSTORE')
const sstoreStep2 = trace2.structLogs.find(step => step.op === 'SSTORE')

console.log(\`\\nType-2 SSTORE gas cost: \${sstoreStep1.gasCost}\`)
console.log(\`Type-1 SSTORE gas cost: \${sstoreStep2.gasCost}\`)
console.log(\`Gas savings from access list: \${sstoreStep1.gasCost - sstoreStep2.gasCost}\`)

// Demonstrate SLOAD gas savings with eth_call
await provider.send('eth_registerCallId', ['access-list-read-no-list'])
await provider.call({ to: address, data: contract.interface.encodeFunctionData('value1') })
const callHash1 = await provider.send('eth_getHashFromTagBySimulator', ['access-list-read-no-list'])
const callTrace1 = await provider.send('debug_traceTransaction', [callHash1])
const sloadCost1 = callTrace1.structLogs.find(step => step.op === 'SLOAD')?.gasCost || 0

await provider.send('eth_registerCallId', ['access-list-read-with-list'])
await provider.call({ to: address, type: 1, data: contract.interface.encodeFunctionData('value1'), accessList })
const callHash2 = await provider.send('eth_getHashFromTagBySimulator', ['access-list-read-with-list'])
const callTrace2 = await provider.send('debug_traceTransaction', [callHash2])
const sloadCost2 = callTrace2.structLogs.find(step => step.op === 'SLOAD')?.gasCost || 0

console.log(\`\\nSLOAD without access list (cold): \${sloadCost1} gas\`)
console.log(\`SLOAD with access list (warm): \${sloadCost2} gas\`)
console.log(\`SLOAD gas savings: \${sloadCost1 - sloadCost2} gas\`)

await remix.call('fileManager', 'writeFile', 'AccessListResults.json', JSON.stringify({
  contractAddress: address,
  type2Transaction: { hash: hash1, gasUsed: receipt1.gasUsed.toString(), sstoreGasCost: sstoreStep1.gasCost },
  type1Transaction: { hash: hash2, gasUsed: receipt2.gasUsed.toString(), sstoreGasCost: sstoreStep2.gasCost },
  sloadCosts: { cold: sloadCost1, warm: sloadCost2, savings: sloadCost1 - sloadCost2 }
}, null, 2))
`

const delegationScript = `
/* global remix, web3Provider */
import { ethers } from 'ethers'

// Get metadata - try artifacts first, fallback to compiler API
let metadata
try {
  metadata = JSON.parse(await remix.call('fileManager', 'readFile', 'artifacts/DelegatedAccount.json'))
} catch (e) {
  const compilationResult = await remix.call('compilerArtefacts', 'getArtefactsByContractName', 'DelegatedAccount')
  const artifact = compilationResult.artefact
  metadata = { abi: artifact.abi, data: { bytecode: artifact.evm.bytecode } }
}

const provider = new ethers.BrowserProvider(web3Provider, undefined, { cacheTimeout: -1 })
const [payer, authority] = await provider.send('eth_accounts', [])
const signer = await provider.getSigner(payer)
const payerWallet = new ethers.Wallet(ethers.hexlify(await provider.send('eth_getPKey', [payer])))
const authorityWallet = new ethers.Wallet(ethers.hexlify(await provider.send('eth_getPKey', [authority])))
const implementation = await new ethers.ContractFactory(metadata.abi, metadata.data.bytecode.object, signer).deploy()
await implementation.waitForDeployment()
const target = await implementation.getAddress()
const chainId = (await provider.getNetwork()).chainId
const authorize = async address => authorityWallet.authorize({ address, chainId, nonce: await provider.getTransactionCount(authority) })

const delegation = await signer.sendTransaction({
  type: 4, to: authority, authorizationList: [await authorize(target)],
  data: implementation.interface.encodeFunctionData('store', [42]), gasLimit: 3_000_000
})
await delegation.wait()
if (await provider.getCode(authority) !== '0xef0100' + target.slice(2).toLowerCase()) throw new Error('Delegation was not installed')

const raw = await payerWallet.signTransaction({
  type: 1, chainId, nonce: await provider.getTransactionCount(payer), to: authority,
  data: implementation.interface.encodeFunctionData('store', [77]), gasLimit: 3_000_000, gasPrice: 1_000_000_000,
  accessList: [{ address: authority, storageKeys: [ethers.ZeroHash] }]
})
const accessHash = await provider.send('eth_sendRawTransaction', [raw])
if ((await provider.getTransactionReceipt(accessHash)).status !== 1) throw new Error('Access-list transaction failed')
if (BigInt(await provider.getStorage(authority, 0)) !== 77n) throw new Error('Unexpected delegated storage')
if (BigInt(await provider.getStorage(target, 0)) !== 0n) throw new Error('Implementation storage was modified')

const revocation = await signer.sendTransaction({
  type: 4, to: authority, authorizationList: [await authorize(ethers.ZeroAddress)], gasLimit: 3_000_000
})
await revocation.wait()
if (await provider.getCode(authority) !== '0x') throw new Error('Delegation was not removed')

await remix.call('fileManager', 'writeFile', 'MonadDelegation.json', JSON.stringify({
  authority, implementation: target, delegation: delegation.hash, access: accessHash, revocation: revocation.hash
}, null, 2))
console.log(\`Delegation installed: \${delegation.hash}\`)
console.log(\`Access-list transaction: \${accessHash}\`)
console.log(\`Delegation revoked: \${revocation.hash}\`)
`

const sources = [
  { 'Untitled.sol': { content: examples.ballot.content } },
  { 'PayableTest.sol': { content: payableContract } },
  { 'MonadSigning.sol': { content: monadSigningContract } },
  { 'sign-and-execute.ts': { content: signAndExecuteScript } },
  { 'DelegatedAccount.sol': { content: delegatedAccountContract } },
  { 'delegation-script.ts': { content: delegationScript } },
  { 'AccessListTest.sol': { content: accessListContract } },
  { 'access-list-script.ts': { content: accessListScript } }
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
      .addFile('Untitled.sol', sources[0]['Untitled.sol']!)
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

  'Test EIP-7702 delegation workflow - compile, deploy, delegate, execute, and revoke #group1': function (browser: NightwatchBrowser) {
    browser
      // Add and compile DelegatedAccount contract
      .addFile('contracts/DelegatedAccount.sol', { content: delegatedAccountContract })
      .clickLaunchIcon('solidity')
      .testContracts('contracts/DelegatedAccount.sol', { content: delegatedAccountContract }, ['DelegatedAccount'])

      // Switch to Monad VM and prepare for delegation script
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-monad-ten', 'Monad_VM')
      .waitForElementVisible('[data-id="deploy-widget-header"]')

      // Add and run delegation script
      .addFile('scripts/delegation-script.ts', { content: delegationScript })
      .pause(2000)
      .openFile('scripts/delegation-script.ts')
      .pause(1000)
      .waitForElementVisible('[data-id="run-script-dropdown-trigger"]', 5000)
      .click('[data-id="run-script-dropdown-trigger"]')
      .waitForElementVisible('[data-id="run-script-dropdown-panel"]', 5000)
      .pause(500)
      .waitForElementVisible('[data-id="run-with-ethers6-menu-item"]', 5000)
      .click('[data-id="run-with-ethers6-menu-item"]')
      .pause(3000)

      // Verify delegation output in terminal
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Delegation installed:', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Access-list transaction:', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Delegation revoked:', 60000)

      // Verify MonadDelegation.json was created with correct data
      .openFile('MonadDelegation.json')
      .pause(1000)
      .getEditorValue((content) => {
        const delegationData = JSON.parse(content)
        browser.assert.ok(delegationData.authority, 'Authority address exists')
        browser.assert.ok(delegationData.implementation, 'Implementation address exists')
        browser.assert.ok(delegationData.delegation, 'Delegation transaction hash exists')
        browser.assert.ok(delegationData.access, 'Access-list transaction hash exists')
        browser.assert.ok(delegationData.revocation, 'Revocation transaction hash exists')

        // Verify addresses are valid Ethereum addresses
        browser.assert.ok(delegationData.authority.startsWith('0x') && delegationData.authority.length === 42, 'Authority is valid address')
        browser.assert.ok(delegationData.implementation.startsWith('0x') && delegationData.implementation.length === 42, 'Implementation is valid address')
      })
  },

  'Test EIP-2930 Access List transactions - verify gas savings (8100 → 100 gas) #group1': function (browser: NightwatchBrowser) {
    browser
      // Add and compile AccessListTest contract
      .addFile('contracts/AccessListTest.sol', { content: accessListContract })
      .clickLaunchIcon('solidity')
      .testContracts('contracts/AccessListTest.sol', { content: accessListContract }, ['AccessListTest'])

      // Switch to Monad VM
      .clickLaunchIcon('udapp')
      .waitForElementVisible('[data-id="settingsSelectEnvOptions"]')
      .switchEnvironment('vm-monad-ten', 'Monad_VM')
      .waitForElementVisible('[data-id="selected-provider-vm-monad-ten"]', 15000)
      .pause(500)

      // Add and run access list script
      .addFile('scripts/access-list-script.ts', { content: accessListScript })
      .pause(2000)
      .openFile('scripts/access-list-script.ts')
      .pause(1000)
      .waitForElementVisible('[data-id="run-script-dropdown-trigger"]', 5000)
      .click('[data-id="run-script-dropdown-trigger"]')
      .waitForElementVisible('[data-id="run-script-dropdown-panel"]', 5000)
      .pause(500)
      .waitForElementVisible('[data-id="run-with-ethers6-menu-item"]', 5000)
      .click('[data-id="run-with-ethers6-menu-item"]')
      .pause(3000)

      // Verify output in terminal - contract deployment
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Contract deployed at:', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Stored value 42:', 60000)

      // Verify Type-2 and Type-1 transaction outputs
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Type-2 (no access list) gas used:', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Type-1 (with access list) gas used:', 60000)

      // Verify gas cost information for SSTORE
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Type-2 SSTORE gas cost:', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Type-1 SSTORE gas cost:', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'Gas savings from access list:', 60000)

      // Verify SLOAD gas savings (8100 cold → 100 warm)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'SLOAD without access list (cold): 8100 gas', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'SLOAD with access list (warm): 100 gas', 60000)
      .waitForElementContainsText('*[data-id="terminalJournal"]', 'SLOAD gas savings: 8000 gas', 60000)

      // Verify AccessListResults.json was created with correct data
      .openFile('AccessListResults.json')
      .pause(1000)
      .getEditorValue((content) => {
        const results = JSON.parse(content)

        // Verify contract address
        browser.assert.ok(results.contractAddress, 'Contract address exists')
        browser.assert.ok(results.contractAddress.startsWith('0x') && results.contractAddress.length === 42, 'Contract address is valid')

        // Verify Type-2 transaction data
        browser.assert.ok(results.type2Transaction, 'Type-2 transaction data exists')
        browser.assert.ok(results.type2Transaction.hash, 'Type-2 transaction hash exists')
        browser.assert.ok(results.type2Transaction.gasUsed, 'Type-2 gas used exists')
        browser.assert.ok(results.type2Transaction.sstoreGasCost, 'Type-2 SSTORE gas cost exists')

        // Verify Type-1 transaction data
        browser.assert.ok(results.type1Transaction, 'Type-1 transaction data exists')
        browser.assert.ok(results.type1Transaction.hash, 'Type-1 transaction hash exists')
        browser.assert.ok(results.type1Transaction.gasUsed, 'Type-1 gas used exists')
        browser.assert.ok(results.type1Transaction.sstoreGasCost, 'Type-1 SSTORE gas cost exists')

        // Verify SLOAD costs match Monad specifications (8100 cold, 100 warm)
        browser.assert.ok(results.sloadCosts, 'SLOAD costs data exists')
        browser.assert.equal(results.sloadCosts.cold, 8100, 'Cold SLOAD cost is 8100 gas')
        browser.assert.equal(results.sloadCosts.warm, 100, 'Warm SLOAD cost is 100 gas')
        browser.assert.equal(results.sloadCosts.savings, 8000, 'SLOAD gas savings is 8000 gas')

        // Verify Type-1 uses less gas than Type-2 (access list optimization)
        const type2Gas = parseInt(results.type2Transaction.gasUsed)
        const type1Gas = parseInt(results.type1Transaction.gasUsed)
        browser.assert.ok(type1Gas < type2Gas, `Type-1 (${type1Gas}) uses less gas than Type-2 (${type2Gas})`)
      })
  },

  'Test Monad VM state fork and restore - verify MON currency preservation #group1': function (browser: NightwatchBrowser) {
    browser
      // Deploy a simple storage contract
      .addFile('contracts/StateTest.sol', { content: payableContract })
      .clickLaunchIcon('solidity')
      .testContracts('contracts/StateTest.sol', { content: payableContract }, ['PayableTest'])

      // Switch to Monad VM Ten
      .clickLaunchIcon('udapp')
      .switchEnvironment('vm-monad-ten', 'Monad_VM')
      .waitForElementVisible('[data-id="selected-provider-vm-monad-ten"]')

      // Deploy contract
      .createContract('')
      .waitForElementVisible('[data-id="deployedContractItem-0"]', 80000)
      .clickInstance(0)

      // Send 1 MON to the contract via receivePayment function
      .waitForElementVisible('[data-id="deployedContractItem-0-function-0"]') // receivePayment
      .waitForElementVisible('[data-id="contractItem-sendValue-0"]')
      .clearValue('[data-id="contractItem-sendValue-0"]')
      .setValue('[data-id="contractItem-sendValue-0"]', '1')
      .click('#contractItem-valueUnit-0')
      .waitForElementVisible('[data-id="contractItem-valueUnit-0-ether"]')
      .click('[data-id="contractItem-valueUnit-0-ether"]')
      .clickFunction(0, 0) // Click receivePayment button (instance 0, function 0)
      .testFunction('last', {
        status: '1 Transaction mined and execution completed',
        value: '1.0 MON'
      })

      // Wait for balance to update and verify (1.0 MON)
      .waitForElementContainsText('[data-id="deployedContractBal"]', '1.0 MON', 10000)

      // Fork the state
      .click('*[data-id="fork-state-icon"]')
      .waitForElementVisible('[data-id="forkInput"]')
      .click('[data-id="forkInput"]')
      .setValue('[data-id="forkInput"]', 'monad_forked_state')
      .click('[data-id="btnForkState"]')

      // Verify fork creation toaster
      .waitForElementVisible('*[data-shared="tooltipPopup"]', 10000)
      .waitForElementContainsText('*[data-shared="tooltipPopup"]', `New environment 'monad_forked_state' created with forked state.`)

      // Verify forked state is selected
      .assert.elementPresent('*[data-id="selected-provider-vm-fs-monad_forked_state"]')

      // Verify forked state file contains MON currency info
      .openFile('.states/forked_states/monad_forked_state.json')
      .getEditorValue((content) => {
        browser.assert.ok(content.indexOf(`"stateName": "monad_forked_state"`) !== -1, 'State name is correct')
        browser.assert.ok(content.indexOf(`"forkName": "monad-ten"`) !== -1, 'Fork name is Monad Ten')
        browser.assert.ok(content.indexOf(`"db":`) !== -1, 'State DB exists')
        browser.assert.ok(content.indexOf(`"blocks":`) !== -1, 'Blocks data exists')
        browser.assert.ok(content.indexOf(`"backend": "monad-evm2"`) !== -1, 'Backend is monad-evm2')
      })

      // Load the contract at address in forked state
      // Note: The original contract at instance 0 should still exist in the forked state
      // So we don't need to add it again, just click it
      .clickLaunchIcon('udapp')
      .clickInstance(0)

      // Verify balance was restored correctly (should still be 1.0 MON)
      .waitForElementVisible('[data-id="deployedContractBal"]')
      .pause(1000)
      .getText('[data-id="deployedContractBal"]', (result) => {
        const restoredBalance = typeof result.value === 'string' ? result.value : ''
        browser.assert.ok(restoredBalance.includes('MON'), 'Restored balance shows MON currency')
        browser.assert.ok(restoredBalance.includes('1.0'), 'Restored balance is 1.0 MON (state correctly restored)')
      })

      // Send more MON in forked state to modify it
      .waitForElementVisible('[data-id="deployedContractItem-0-function-0"]')
      .clearValue('[data-id="contractItem-sendValue-0"]')
      .setValue('[data-id="contractItem-sendValue-0"]', '2')
      .click('#contractItem-valueUnit-0')
      .waitForElementVisible('[data-id="contractItem-valueUnit-0-ether"]')
      .click('[data-id="contractItem-valueUnit-0-ether"]')
      .clickFunction(0, 0) // Click receivePayment button (instance 0, function 0)
      .testFunction('last', {
        status: '1 Transaction mined and execution completed',
        value: '2.0 MON'
      })

      // Wait for balance to update and verify (3.0 MON now)
      .waitForElementContainsText('[data-id="deployedContractBal"]', '3.0 MON', 10000)

      // Switch back to original Monad VM Ten
      .switchEnvironment('vm-monad-ten', 'Monad_VM')
      .waitForElementVisible('[data-id="selected-provider-vm-monad-ten"]')

      // Load contract again in original state
      // Note: The original contract should still be at instance 0
      .clickLaunchIcon('udapp')
      .clickInstance(0)

      // Verify original state is UNCHANGED (still 1.0 MON, not 3.0 MON)
      .waitForElementContainsText('[data-id="deployedContractBal"]', '1.0 MON', 10000)
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
