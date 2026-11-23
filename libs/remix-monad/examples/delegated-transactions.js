/* global remix, web3Provider */
import { ethers } from 'ethers'

const metadata = JSON.parse(await remix.call('fileManager', 'readFile', 'artifacts/DelegatedAccount.json'))
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
console.log(`Debug delegation: ${delegation.hash}`)
console.log(`Debug access-list transaction: ${accessHash}`)
