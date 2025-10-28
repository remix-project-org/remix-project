import { Sdk } from '@circles-sdk/sdk'
import { BrowserProviderContractRunner } from "@circles-sdk/adapter-ethers"
import { cidV0ToUint8Array } from '@circles-sdk/utils'
import { ethers } from 'ethers'

(window as any).ethereum = web3Provider

const run = async () => {
    // Initialize the SDK
    const adapter = new BrowserProviderContractRunner();
    await adapter.init();
    const sdk = new Sdk(adapter)
    const sender = await (new ethers.BrowserProvider(web3Provider)).getSigner()

    // Define the group profile (symbol is required)
    const groupProfile = {
        name: '',
        symbol: '',
        description: '',
        imageUrl: '', // optional, can be uploaded via SDK
        previewImageUrl: '', // optional, used for previews
    }

    // Define base group setup options    
    const circlesGroupOwner = ''
    const groupOwner = circlesGroupOwner
    const serviceAddress = sender.address // Replace with actual service address
    const feeCollection = circlesGroupOwner // Replace with actual treasury address
    const initialConditions = []

    // Step 1: Create the group profile (CID will be returned)
    const profileCID = await sdk.profiles.create(groupProfile)
    if (!profileCID) throw new Error('Failed to create profile CID')

    // Step 2: Create the base group using the factory
    console.log('group owner will be', sender)
    const tx = await sdk.baseGroupFactory.createBaseGroup(
        groupOwner, // Usually wallet address of the sender
        serviceAddress,
        feeCollection,
        initialConditions,
        groupProfile.name,
        groupProfile.symbol,
        cidV0ToUint8Array(profileCID), // Convert CID to bytes
    )

    // Wait for transaction confirmation
    const receipt = await tx.wait()

    console.log('receipt', receipt)

    // Step 3: Extract the group address from emitted events
    const groupAddress = ethers.stripZerosLeft(receipt.logs[15].topics[1])

    // Step 4: Get the avatar for the created group
    const baseGroupAvatar = await sdk.getAvatar(groupAddress.toLowerCase())

    console.log('Base group created at:', groupAddress)
    console.log('Group avatar:', baseGroupAvatar)
}

run().catch(console.error).then(console.log)