/* global describe, before, it */
import { Provider } from '../src/index'
import * as assert from 'assert'
import { ethers, BrowserProvider } from "ethers"

describe('blocks', () => {
  let ethersProvider: BrowserProvider

  before(async () => {
    const provider = new Provider({
      coinbase: '0x0000000000000000000000000000000000000001'
    })
    await provider.init()
    ethersProvider = new ethers.BrowserProvider(provider as any)
  })

  describe('eth_getBlockByNumber', () => {
    it('should get block given its number', async () => {
      const block = await ethersProvider.send( 'eth_getBlockByNumber', [0])
      const expectedBlock = {
        baseFeePerGas: '0x01',
        number: '0x0',
        hash: block.hash.toString(),
        parentHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        nonce: '0x0000000000000000',
        sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
        logsBloom: '0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99d05921026d1527331',
        transactionsRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
        stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
        miner: '0x0000000000000000000000000000000000000001',
        difficulty: '0x0',
        totalDifficulty: '0x0',
        extraData: '0x00',
        size: '0x027f07',
        gasLimit: '0x7a1200',
        gasUsed: '0x0',
        timestamp: block.timestamp,
        transactions: [],
        uncles: []
      }

      assert.deepEqual(block, expectedBlock)
    })
  })

  describe('eth_getGasPrice', () => {
    it('should get gas price', async () => {
      const { gasPrice } = await ethersProvider.getFeeData()
      assert.equal(gasPrice, 1)
    })
  })

  describe('eth_coinbase', () => {
    it('should get coinbase', async () => {
      const coinbase = await ethersProvider.send("eth_coinbase", [])
      assert.equal(coinbase, '0x0000000000000000000000000000000000000001')
    })
  })

  describe('eth_blockNumber', () => {
    it('should get current block number', async () => {
      const number = await ethersProvider.getBlockNumber()
      assert.equal(number, 0)
    })
  })

  describe('evm_mine', () => {
    it('should mine empty block using evm_mine', async function () {
      await ethersProvider.send( 'evm_mine', [{ blocks: 3 }])
      const number = await ethersProvider.send( 'eth_blockNumber', [])
      assert.equal(number, 3)
    })
  })

  describe('eth_getBlockByHash', () => {
    it('should get block given its hash', async () => {
      const correctBlock = await ethersProvider.getBlock(0)
      const block = await ethersProvider.getBlock(correctBlock.hash)

      assert.deepEqual(block, correctBlock)
    })
  })

  describe('eth_getBlockTransactionCountByHash', () => {
    it('should get block transactions count given block hash', async () => {
      const correctBlock = await ethersProvider.getBlock(0)
      const numberTransactions = await ethersProvider.send( 'eth_getBlockTransactionCountByHash', [correctBlock.hash])

      assert.deepEqual(numberTransactions, 0)
    })
  })

  describe('eth_getBlockTransactionCountByNumber', () => {
    it('should get block transactions count given block number', async () => {
      const numberTransactions = await ethersProvider.send( 'eth_getBlockTransactionCountByNumber', ['0x0'])

      assert.deepEqual(numberTransactions, 0)
    })
  })

  describe('eth_getUncleCountByBlockHash', () => {
    it('should get block uncles count given its hash', async () => {
      const correctBlock = await ethersProvider.send( 'eth_getBlockByNumber', [0])
      const numberTransactions = await ethersProvider.send('eth_getUncleCountByBlockHash', [correctBlock.hash])

      assert.deepEqual(numberTransactions, correctBlock.uncles.length)
    })
  })

  describe('eth_getUncleCountByBlockNumber', () => {
    it('should get block uncles count given its number', async () => {
      const correctBlock = await ethersProvider.send( 'eth_getBlockByNumber', [0])
      const numberTransactions = await ethersProvider.send('eth_getUncleCountByBlockNumber', [0])

      assert.deepEqual(numberTransactions, correctBlock.uncles.length)
    })
  })
  describe('eth_getStorageAt', () => {
    it('should get storage at position at given address', async () => {
      const abi = [
        {
          'constant': false,
          'inputs': [
            {
              'name': 'x',
              'type': 'uint256'
            }
          ],
          'name': 'set',
          'outputs': [],
          'payable': false,
          'stateMutability': 'nonpayable',
          'type': 'function'
        },
        {
          'constant': false,
          'inputs': [
            {
              'name': 'x',
              'type': 'uint256'
            }
          ],
          'name': 'set2',
          'outputs': [],
          'payable': false,
          'stateMutability': 'nonpayable',
          'type': 'function'
        },
        {
          'inputs': [
            {
              'name': 'initialValue',
              'type': 'uint256'
            }
          ],
          'payable': false,
          'stateMutability': 'nonpayable',
          'type': 'constructor'
        },
        {
          'anonymous': false,
          'inputs': [
            {
              'indexed': true,
              'name': 'value',
              'type': 'uint256'
            }
          ],
          'name': 'Test',
          'type': 'event'
        },
        {
          'constant': true,
          'inputs': [],
          'name': 'get',
          'outputs': [
            {
              'name': 'retVal',
              'type': 'uint256'
            }
          ],
          'payable': false,
          'stateMutability': 'view',
          'type': 'function'
        },
        {
          'constant': true,
          'inputs': [],
          'name': 'storedData',
          'outputs': [
            {
              'name': '',
              'type': 'uint256'
            }
          ],
          'payable': false,
          'stateMutability': 'view',
          'type': 'function'
        }
      ] as const

      const code = '0x608060405234801561001057600080fd5b506040516020806102018339810180604052602081101561003057600080fd5b810190808051906020019092919050505080600081905550506101a9806100586000396000f3fe60806040526004361061005c576000357c0100000000000000000000000000000000000000000000000000000000900480632a1afcd91461006157806360fe47b11461008c5780636d4ce63c146100c7578063ce01e1ec146100f2575b600080fd5b34801561006d57600080fd5b5061007661012d565b6040518082815260200191505060405180910390f35b34801561009857600080fd5b506100c5600480360360208110156100af57600080fd5b8101908080359060200190929190505050610133565b005b3480156100d357600080fd5b506100dc61013d565b6040518082815260200191505060405180910390f35b3480156100fe57600080fd5b5061012b6004803603602081101561011557600080fd5b8101908080359060200190929190505050610146565b005b60005481565b8060008190555050565b60008054905090565b80600081905550807f63a242a632efe33c0e210e04e4173612a17efa4f16aa4890bc7e46caece80de060405160405180910390a25056fea165627a7a7230582063160eb16dc361092a85ced1a773eed0b63738b83bea1e1c51cf066fa90e135d0029'
      const signer = await ethersProvider.getSigner();
      const contract = new ethers.ContractFactory(abi, code, signer)

      const contractInstance = await contract.deploy(100)
      const contractAddress = await contractInstance.getAddress()
      const contractInteract = new ethers.Contract(contractAddress, abi, signer)

      let tx = await contractInteract.set(100)
      await tx.wait()
      let storage = await ethersProvider.getStorage(contractAddress, "0x0")
      assert.deepEqual(storage, '0x64')

      tx = await contractInteract.set(200)
      await tx.wait()
      storage = await ethersProvider.getStorage(contractAddress, "0x0")
      assert.deepEqual(storage, '0xc8')

      tx = await contractInteract.set(1)
      await tx.wait()
      storage = await ethersProvider.getStorage(contractAddress, "0x0")
      assert.deepEqual(storage, '0x01')
    }).timeout(15000)
  })
  describe('eth_call', () => {
    it('should get a value', async () => {
      const abi = [
        {
          'constant': false,
          'inputs': [
            {
              'name': 'x',
              'type': 'uint256'
            }
          ],
          'name': 'set',
          'outputs': [],
          'payable': false,
          'stateMutability': 'nonpayable',
          'type': 'function'
        },
        {
          'constant': false,
          'inputs': [
            {
              'name': 'x',
              'type': 'uint256'
            }
          ],
          'name': 'set2',
          'outputs': [],
          'payable': false,
          'stateMutability': 'nonpayable',
          'type': 'function'
        },
        {
          'inputs': [
            {
              'name': 'initialValue',
              'type': 'uint256'
            }
          ],
          'payable': false,
          'stateMutability': 'nonpayable',
          'type': 'constructor'
        },
        {
          'anonymous': false,
          'inputs': [
            {
              'indexed': true,
              'name': 'value',
              'type': 'uint256'
            }
          ],
          'name': 'Test',
          'type': 'event'
        },
        {
          'constant': true,
          'inputs': [],
          'name': 'get',
          'outputs': [
            {
              'name': 'retVal',
              'type': 'uint256'
            }
          ],
          'payable': false,
          'stateMutability': 'view',
          'type': 'function'
        },
        {
          'constant': true,
          'inputs': [],
          'name': 'storedData',
          'outputs': [
            {
              'name': '',
              'type': 'uint256'
            }
          ],
          'payable': false,
          'stateMutability': 'view',
          'type': 'function'
        }
      ] as const

      const code = '0x608060405234801561001057600080fd5b506040516020806102018339810180604052602081101561003057600080fd5b810190808051906020019092919050505080600081905550506101a9806100586000396000f3fe60806040526004361061005c576000357c0100000000000000000000000000000000000000000000000000000000900480632a1afcd91461006157806360fe47b11461008c5780636d4ce63c146100c7578063ce01e1ec146100f2575b600080fd5b34801561006d57600080fd5b5061007661012d565b6040518082815260200191505060405180910390f35b34801561009857600080fd5b506100c5600480360360208110156100af57600080fd5b8101908080359060200190929190505050610133565b005b3480156100d357600080fd5b506100dc61013d565b6040518082815260200191505060405180910390f35b3480156100fe57600080fd5b5061012b6004803603602081101561011557600080fd5b8101908080359060200190929190505050610146565b005b60005481565b8060008190555050565b60008054905090565b80600081905550807f63a242a632efe33c0e210e04e4173612a17efa4f16aa4890bc7e46caece80de060405160405180910390a25056fea165627a7a7230582063160eb16dc361092a85ced1a773eed0b63738b83bea1e1c51cf066fa90e135d0029'

      const signer = await ethersProvider.getSigner();
      const contract = new ethers.ContractFactory(abi, code, signer)

      const contractInstance = await contract.deploy(100)

      const contractAddress = await contractInstance.getAddress()
      const contractInteract = new ethers.Contract(contractAddress, abi, signer)

      const value = await contractInteract.get()

      assert.deepEqual(value, 100)
    })
  })
})
