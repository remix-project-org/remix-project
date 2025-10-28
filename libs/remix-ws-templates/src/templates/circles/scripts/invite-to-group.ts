import { ethers } from 'ethers'
import { Sdk } from '@circles-sdk/sdk'
import { BrowserProviderContractRunner } from "@circles-sdk/adapter-ethers"

(window as any).ethereum = web3Provider

const run = async () => {
    // Initialize the SDK
    const adapter = new BrowserProviderContractRunner();
    await adapter.init();
    const sdk = new Sdk(adapter)

    const user = ''
    const txHash = '' // transaction which registered the group.
    
    const provider = new ethers.BrowserProvider(web3Provider)
    const receipt = await provider.getTransactionReceipt(txHash)
    const groupAddress = ethers.stripZerosLeft(receipt.logs[15].topics[1])

    console.log('group address', groupAddress)
    const baseGroupAvatar = await sdk.getAvatar(groupAddress.toLowerCase())
    
    console.log('group avatar', baseGroupAvatar)

    console.log('owner', await baseGroupAvatar.owner())
    console.log('service', await baseGroupAvatar.service())
    
    console.log(await baseGroupAvatar.isTrustedBy(user))

    console.log(await baseGroupAvatar.trust(user))
}

run().then(console.log).catch(console.error)