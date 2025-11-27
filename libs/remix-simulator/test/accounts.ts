/* global describe, before, it */
import { Provider } from '../src/index'
import * as assert from 'assert'
import { ethers, BrowserProvider } from "ethers"

describe('Accounts', () => {
  let ethersProvider: BrowserProvider
  before(async function () {
    const provider = new Provider()
    await provider.init()
    ethersProvider = new ethers.BrowserProvider(provider as any)
  })

  describe('eth_getAccounts', () => {
    it('should get a list of accounts', async function () {
      const accounts: string[] = await ethersProvider.send("eth_requestAccounts", [])
      assert.notEqual(accounts.length, 0)
    })
  })

  describe('eth_getBalance', () => {
    it('should get an account balance', async () => {
      const accounts: string[] = await ethersProvider.send("eth_requestAccounts", [])
      const balance0: bigint = await ethersProvider.getBalance(accounts[0])
      const balance1: bigint = await ethersProvider.getBalance(accounts[1])
      const balance2: bigint = await ethersProvider.getBalance(accounts[2])

      assert.deepEqual(balance0.toString(), '100000000000000000000')
      assert.deepEqual(balance1.toString(), '100000000000000000000')
      assert.deepEqual(balance2.toString(), '100000000000000000000')
    })
  })

  describe('eth_sign', () => {
    it('should sign payloads', async () => {
      const signer = await ethersProvider.getSigner()
      const signature: any = await signer._legacySignMessage('Hello world') // _legacySignMessage uses 'eth_sign' internally
      assert.deepEqual(typeof signature === 'string' ? signature.length : signature.signature.length, 132)
      assert.deepEqual(signature, "0x4bb5c87f889dcef489ce5965930a33cd4a5a4e20b5c44f9abb948a10f8b5cc5176398e92d9faf9168af3fbf3cb4ab12b99f9c88d34ab91242cc9490f71ca3f751c")
    })
  })

  describe('personal_sign', () => {
    it('should sign payloads', async () => {
      const signer = await ethersProvider.getSigner()
      const signature: any = await signer.signMessage('Hello world') // signMessage uses 'personal_sign' internally
      assert.deepEqual(typeof signature === 'string' ? signature.length : signature.signature.length, 132)
      assert.deepEqual(signature, "0x4bb5c87f889dcef489ce5965930a33cd4a5a4e20b5c44f9abb948a10f8b5cc5176398e92d9faf9168af3fbf3cb4ab12b99f9c88d34ab91242cc9490f71ca3f751c")
    })
  })

  describe('eth_signTypedData', () => {
    it('should sign typed data', async () => {
      const accounts: string[] = await ethersProvider.send("eth_requestAccounts", [])
      const typedData = {
        domain: {
          chainId: 1,
          name: "Example App",
          verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
          version: "1",
        },
        message: {
          prompt: "Welcome! In order to authenticate to this website, sign this request and your public address will be sent to the server in a verifiable way.",
          createdAt: 1718570375196,
        },
        primaryType: 'AuthRequest',
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          AuthRequest: [
            { name: 'prompt', type: 'string' },
            { name: 'createdAt', type: 'uint256' },
          ],
        },
      };
      const result = await ethersProvider.send('eth_signTypedData', [accounts[0], typedData])
      assert.equal(result, '0x248d23de0e23231370db8aa21ad5908ca90c33ae2b8c611b906674bda6b1a8b85813f945c2ea896316e240089029619ab3d801a1b098c199bd462dd8026349da1c')
    })
  })
})
