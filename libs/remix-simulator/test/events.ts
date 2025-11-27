/* global describe, before, it */
import { Provider } from '../src/index'
import * as assert from 'assert'
import { ethers, BrowserProvider } from "ethers"

describe('Events', () => {
  let ethersProvider: BrowserProvider
  before(async function () {
    const provider = new Provider()
    await provider.init()
    ethersProvider = new ethers.BrowserProvider(provider as any)
  })

  describe('eth_getLogs', () => {
    it('should deploy 2 contracts which emit events and retrieve these events using different block ranges', async function () {
      const accounts: string[] = await ethersProvider.send("eth_requestAccounts", [])
      const signer = await ethersProvider.getSigner(0)
      // deploy the contract "test".
      const testContractTx = await signer.sendTransaction({
        from: accounts[0],
        gasLimit: 1000000,
        data: '0x608060405234801561001057600080fd5b506101ea806100206000396000f3fe608060405234801561001057600080fd5b506004361061002b5760003560e01c80632801617e14610030575b600080fd5b61004a6004803603810190610045919061015d565b61004c565b005b8073ffffffffffffffffffffffffffffffffffffffff1663a6f9dae1306040518263ffffffff1660e01b81526004016100859190610199565b600060405180830381600087803b15801561009f57600080fd5b505af11580156100b3573d6000803e3d6000fd5b50505050607b7fdcd9c7fa0342f01013bd0bf2bec103a81936162dcebd1f0c38b1d4164c17e0fc60405160405180910390a250565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000610118826100ed565b9050919050565b600061012a8261010d565b9050919050565b61013a8161011f565b811461014557600080fd5b50565b60008135905061015781610131565b92915050565b600060208284031215610173576101726100e8565b5b600061018184828501610148565b91505092915050565b6101938161010d565b82525050565b60006020820190506101ae600083018461018a565b9291505056fea2646970667358221220cf5368dd204d44a75752e8ba7512b73d2f54b09f6ca6147e376dd3cf2942b96464736f6c63430008120033'
      })
      const receiptTest = await ethersProvider.getTransactionReceipt(testContractTx.hash)
      // deploy the contract "owner", this will trigger an event.
      const ownerContractTx = await signer.sendTransaction({
        from: accounts[0],
        gasLimit: 1000000,
        data: '0x608060405234801561001057600080fd5b5061005a6040518060400160405280601b81526020017f4f776e657220636f6e7472616374206465706c6f7965642062793a00000000008152503361011a60201b61015b1760201c565b336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555060008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16600073ffffffffffffffffffffffffffffffffffffffff167f342827c97908e5e2f71151c08502a66d44b6f758e3ac2f1de95f02eb95f0a73560405160405180910390a361034d565b6101b882826040516024016101309291906102ee565b6040516020818303038152906040527f319af333000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19166020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff83818316178352505050506101bc60201b60201c565b5050565b6101dd816101d86101e060201b6101f71761020160201b60201c565b60201c565b50565b60006a636f6e736f6c652e6c6f679050600080835160208501845afa505050565b61021360201b61023d17819050919050565b61021b61031e565b565b600081519050919050565b600082825260208201905092915050565b60005b8381101561025757808201518184015260208101905061023c565b60008484015250505050565b6000601f19601f8301169050919050565b600061027f8261021d565b6102898185610228565b9350610299818560208601610239565b6102a281610263565b840191505092915050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006102d8826102ad565b9050919050565b6102e8816102cd565b82525050565b600060408201905081810360008301526103088185610274565b905061031760208301846102df565b9392505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052605160045260246000fd5b6104268061035c6000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c8063893d20e81461003b578063a6f9dae114610059575b600080fd5b610043610075565b6040516100509190610288565b60405180910390f35b610073600480360381019061006e91906102d4565b61009e565b005b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b8073ffffffffffffffffffffffffffffffffffffffff1660008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff167f342827c97908e5e2f71151c08502a66d44b6f758e3ac2f1de95f02eb95f0a73560405160405180910390a3806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050565b6101f38282604051602401610171929190610391565b6040516020818303038152906040527f319af333000000000000000000000000000000000000000000000000000000007bffffffffffffffffffffffffffffffffffffffffffffffffffffffff19166020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff8381831617835250505050610218565b5050565b60006a636f6e736f6c652e6c6f679050600080835160208501845afa505050565b61022f816102276101f7610232565b63ffffffff16565b50565b61023d819050919050565b6102456103c1565b565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b600061027282610247565b9050919050565b61028281610267565b82525050565b600060208201905061029d6000830184610279565b92915050565b600080fd5b6102b181610267565b81146102bc57600080fd5b50565b6000813590506102ce816102a8565b92915050565b6000602082840312156102ea576102e96102a3565b5b60006102f8848285016102bf565b91505092915050565b600081519050919050565b600082825260208201905092915050565b60005b8381101561033b578082015181840152602081019050610320565b60008484015250505050565b6000601f19601f8301169050919050565b600061036382610301565b61036d818561030c565b935061037d81856020860161031d565b61038681610347565b840191505092915050565b600060408201905081810360008301526103ab8185610358565b90506103ba6020830184610279565b9392505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052605160045260246000fdfea2646970667358221220cb7beb012e0831cc632ed85a11a8652f72efc03360c81beb1fcd842a7782c3cb64736f6c63430008120033'
      })
      const receiptOwner = await ethersProvider.getTransactionReceipt(ownerContractTx.hash)

      // call function set(Owner p) from "test", this will trigger 2 events, one from each contract.
      await signer.sendTransaction({
        from: accounts[0],
        to: receiptTest.contractAddress,
        gasLimit: 1000000,
        data: '0x2801617e' + ethers.zeroPadValue(receiptOwner.contractAddress, 32).replace('0x', '')
      })

      const testLogs = await ethersProvider.getLogs({
        address: receiptTest.contractAddress,
        fromBlock: 3,
        toBlock: 'latest',
        topics: ['0xdcd9c7fa0342f01013bd0bf2bec103a81936162dcebd1f0c38b1d4164c17e0fc']
      })
      assert.equal(testLogs.length, 1, '1) testLogs length should be equal to 1')

      let ownerLogs = await ethersProvider.getLogs({
        address: receiptOwner.contractAddress,
        fromBlock: 3,
        toBlock: 'latest',
        topics: ['0x342827c97908e5e2f71151c08502a66d44b6f758e3ac2f1de95f02eb95f0a735']
      })

      // this should include the event triggered by the "set" transaction call.
      assert.equal(ownerLogs.length, 1, '2) ownerLogs length should be equal to 1')

      ownerLogs = await ethersProvider.getLogs({
        address: receiptOwner.contractAddress,
        fromBlock: 2,
        toBlock: 'latest',
        topics: ['0x342827c97908e5e2f71151c08502a66d44b6f758e3ac2f1de95f02eb95f0a735']
      })
      // this should include the event triggered from the ctor.
      assert.equal(ownerLogs.length, 2, '3) ownerLogs length should be equal to 2')

      ownerLogs = await ethersProvider.getLogs({
        address: receiptOwner.contractAddress,
        fromBlock: 1,
        toBlock: 2,
        topics: ['0x342827c97908e5e2f71151c08502a66d44b6f758e3ac2f1de95f02eb95f0a735']
      })
      // this should only include the event triggered from the ctor.
      assert.equal(ownerLogs.length, 1, '4) ownerLogs length should be equal to 1')

      ownerLogs = await ethersProvider.getLogs({
        address: receiptOwner.contractAddress,
        fromBlock: 1,
        toBlock: 2,
        topics: [['0x342827c97908e5e2f71151c08502a66d44b6f758e3ac2f1de95f02eb95f0a735', '0xdcd9c7fa0342f01013bd0bf2bec103a81936162dcebd1f0c38b1d4164c17e0fc']]
      })
      // 0xdcd9c7fa0342f01013b is a topic from an event emitted by the other contract and should not be take into account.
      assert.equal(ownerLogs.length, 1, '5) ownerLogs length should be equal to 1')
    })
  })
})

/*
// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;

import "hardhat/console.sol";

contract test {
    event testEvent(uint indexed value);
    function set(Owner p) public  {
        p.changeOwner(address(this));
        emit testEvent(123);
    }
}
contract Owner {

    address private owner;

    // event for EVM logging
    event OwnerSet(address indexed oldOwner, address indexed newOwner);

    // modifier to check if caller is owner
    modifier isOwner() {
        // If the first argument of 'require' evaluates to 'false', execution terminates and all
        // changes to the state and to Ether balances are reverted.
        // This used to consume all gas in old EVM versions, but not anymore.
        // It is often a good idea to use 'require' to check if functions are called correctly.
        // As a second argument, you can also provide an explanation about what went wrong.
        require(msg.sender == owner, "Caller is not owner");
        _;
    }

    constructor() {
        console.log("Owner contract deployed by:", msg.sender);
        owner = msg.sender; // 'msg.sender' is sender of current call, contract deployer for a constructor
        emit OwnerSet(address(0), owner);
    }

    function changeOwner(address newOwner) public {
        emit OwnerSet(owner, newOwner);
        owner = newOwner;
    }

    function getOwner() external view returns (address) {
        return owner;
    }
}
*/
