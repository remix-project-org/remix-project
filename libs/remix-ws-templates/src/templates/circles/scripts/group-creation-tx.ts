import { ethers } from 'ethers'
import { Sdk } from '@circles-sdk/sdk'
import { BrowserProviderContractRunner } from "@circles-sdk/adapter-ethers"

const run = async () => {
    // Initialize the SDK
    const adapter = new BrowserProviderContractRunner();
    await adapter.init();
    const sdk = new Sdk(adapter)

    const txHash = '' // transaction which registered the group.

    const provider = new ethers.BrowserProvider(web3Provider)
    const receipt = await provider.getTransactionReceipt(txHash)
    const groupAddress = ethers.stripZerosLeft(receipt.logs[15].topics[1])

    console.log('group address', groupAddress)
    const baseGroupAvatar = await sdk.getAvatar(groupAddress.toLowerCase())
    
    console.log('group avatar', baseGroupAvatar)
    console.log('owner is', await baseGroupAvatar.owner())
    console.log('trust relations are', await baseGroupAvatar.getTrustRelations())
}

run().then(console.log).catch(console.error)