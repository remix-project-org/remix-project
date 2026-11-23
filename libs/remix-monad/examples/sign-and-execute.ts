import { ethers } from 'ethers'

// Compile contracts/MonadSigning.sol, then run this script with Ethers v6.
const metadata = JSON.parse(await remix.call('fileManager', 'readFile', 'artifacts/MonadSigning.json'))
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
console.log(`Stored 42 at ${address}. Debug transaction: ${transaction.hash}`)
