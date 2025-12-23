/* global describe, before, it */
import { createFeeMarket1559Tx, createLegacyTx } from '@ethereumjs/tx'
import { Provider } from '../src/index'
import * as assert from 'assert'
import type { AddressLike } from '@ethereumjs/util'
import { ethers, BrowserProvider, getBytes, hexlify } from "ethers"

describe('Transactions', () => {
  let ethersProvider: BrowserProvider
  before(async function () {
    const provider = new Provider({ fork: 'shanghai' })
    await provider.init()
    ethersProvider = new ethers.BrowserProvider(provider as any)
  })

  describe('eth_sendTransaction', () => {
    it('should deploy Storage contract, save a number and retrieve it', async function () {
      const accounts: string[] = await ethersProvider.send("eth_requestAccounts", [])
      const signer = await ethersProvider.getSigner(0)
      let receipt = await signer.sendTransaction({
        from: accounts[0],
        gasLimit: 1000000,
        data: '0x608060405234801561000f575f80fd5b506101438061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c80632e64cec1146100385780636057361d14610056575b5f80fd5b610040610072565b60405161004d919061009b565b60405180910390f35b610070600480360381019061006b91906100e2565b61007a565b005b5f8054905090565b805f8190555050565b5f819050919050565b61009581610083565b82525050565b5f6020820190506100ae5f83018461008c565b92915050565b5f80fd5b6100c181610083565b81146100cb575f80fd5b50565b5f813590506100dc816100b8565b92915050565b5f602082840312156100f7576100f66100b4565b5b5f610104848285016100ce565b9150509291505056fea2646970667358221220bfa7ddc6d937b635c7a8ad020080923800f04f6b0a685c47330306fd5267626b64736f6c63430008150033'
      })
      const storageAddress = (await ethersProvider.getTransactionReceipt(receipt.hash)).contractAddress
      receipt = await signer.sendTransaction({
        from: accounts[0],
        to: storageAddress,
        gasLimit: 1000000,
        data: '0x6057361d000000000000000000000000000000000000000000000000000000000000000e'
      })
      const value = await ethersProvider.call({
        from: accounts[0],
        to: storageAddress,
        data: '0x2e64cec1'
      })
      assert.notEqual(value, 15)
      assert.equal(value, 14)
    })
  })

  describe('eth_sendRawTransaction', () => {
    it('should accept and process legacy transaction (type 0)', async function () {
      const accounts: string[] = await ethersProvider.send("eth_requestAccounts", [])

      // Deploy Storage contract using legacy transaction
      const storageDeploymentData = '0x608060405234801561000f575f80fd5b506101438061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c80632e64cec1146100385780636057361d14610056575b5f80fd5b610040610072565b60405161004d919061009b565b60405180910390f35b610070600480360381019061006b91906100e2565b61007a565b005b5f8054905090565b805f8190555050565b5f819050919050565b61009581610083565b82525050565b5f6020820190506100ae5f83018461008c565b92915050565b5f80fd5b6100c181610083565b81146100cb575f80fd5b50565b5f813590506100dc816100b8565b92915050565b5f602082840312156100f7576100f66100b4565b5b5f610104848285016100ce565b9150509291505056fea2646970667358221220bfa7ddc6d937b635c7a8ad020080923800f04f6b0a685c47330306fd5267626b64736f6c63430008150033'

      // Create a legacy transaction (type 0), includes gasPrice
      const legacyTx = createLegacyTx({
        nonce: 0,
        gasPrice: '0x09184e72a000', // 10000000000000
        gasLimit: 1000000,
        to: undefined, // Contract deployment
        value: 0,
        data: getBytes(storageDeploymentData)
      }).sign(getBytes('0x503f38a9c967ed597e47fe25643985f032b072db8075426a92110f82df48dfcb'))

      // Send the serialized legacy transaction
      const receipt = await ethersProvider.broadcastTransaction(hexlify(legacyTx.serialize()))
      const storageAddress = (await ethersProvider.getTransactionReceipt(receipt.hash)).contractAddress

      assert.ok(storageAddress, 'Contract should be deployed')

      // Call store function with value 42 using legacy transaction
      const storeData = '0x6057361d000000000000000000000000000000000000000000000000000000000000002a' // store(42)
      const storeTx = createLegacyTx({
        nonce: 1,
        gasPrice: '0x09184e72a000',
        gasLimit: 1000000,
        to: (getBytes(storageAddress) as AddressLike),
        value: 0,
        data: getBytes(storeData)
      }).sign(getBytes('0x503f38a9c967ed597e47fe25643985f032b072db8075426a92110f82df48dfcb'))

      await ethersProvider.broadcastTransaction(hexlify(storeTx.serialize()))

      // Retrieve the stored value
      const value = await ethersProvider.call({
        from: accounts[0],
        to: storageAddress,
        data: '0x2e64cec1' // retrieve()
      })

      assert.equal(value, '0x000000000000000000000000000000000000000000000000000000000000002a', 'Stored value should be 42')
    })

    it('should accept and process EIP-1559 transaction (type 2)', async function () {
      const accounts: string[] = await ethersProvider.send("eth_requestAccounts", [])

      // Deploy Storage contract using EIP-1559 transaction
      const storageDeploymentData = '0x608060405234801561000f575f80fd5b506101438061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610034575f3560e01c80632e64cec1146100385780636057361d14610056575b5f80fd5b610040610072565b60405161004d919061009b565b60405180910390f35b610070600480360381019061006b91906100e2565b61007a565b005b5f8054905090565b805f8190555050565b5f819050919050565b61009581610083565b82525050565b5f6020820190506100ae5f83018461008c565b92915050565b5f80fd5b6100c181610083565b81146100cb575f80fd5b50565b5f813590506100dc816100b8565b92915050565b5f602082840312156100f7576100f66100b4565b5b5f610104848285016100ce565b9150509291505056fea2646970667358221220bfa7ddc6d937b635c7a8ad020080923800f04f6b0a685c47330306fd5267626b64736f6c63430008150033'

      // Create an EIP-1559 transaction (type 2),includes maxPriorityFeePerGas & maxFeePerGas
      const eip1559Tx = createFeeMarket1559Tx({
        nonce: 2,
        maxPriorityFeePerGas: '0x01',
        maxFeePerGas: '0x09184e72a000',
        gasLimit: 1000000,
        to: undefined, // Contract deployment
        value: 0,
        data: getBytes(storageDeploymentData)
      }).sign(getBytes('0x503f38a9c967ed597e47fe25643985f032b072db8075426a92110f82df48dfcb'))

      // Send the serialized EIP-1559 transaction
      const receipt = await ethersProvider.broadcastTransaction(hexlify(eip1559Tx.serialize()))
      const storageAddress = (await ethersProvider.getTransactionReceipt(receipt.hash)).contractAddress

      assert.ok(storageAddress, 'Contract should be deployed')

      // Call store function with value 99 using EIP-1559 transaction
      const storeData = '0x6057361d0000000000000000000000000000000000000000000000000000000000000063' // store(99)
      const storeTx = createFeeMarket1559Tx({
        nonce: 3,
        maxPriorityFeePerGas: '0x01',
        maxFeePerGas: '0x09184e72a000',
        gasLimit: 1000000,
        to: (getBytes(storageAddress) as AddressLike),
        value: 0,
        data: getBytes(storeData)
      }).sign(getBytes('0x503f38a9c967ed597e47fe25643985f032b072db8075426a92110f82df48dfcb'))

      await ethersProvider.broadcastTransaction(hexlify(storeTx.serialize()))

      // Retrieve the stored value
      const value = await ethersProvider.call({
        from: accounts[0],
        to: storageAddress,
        data: '0x2e64cec1' // retrieve()
      })

      assert.equal(value, '0x0000000000000000000000000000000000000000000000000000000000000063', 'Stored value should be 99')
    })
  })
})
