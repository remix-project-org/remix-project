import { Sdk } from '@circles-sdk/sdk';
import { BrowserProviderContractRunner } from "@circles-sdk/adapter-ethers"

(window as any).ethereum = web3Provider

const run = async () => {
    try {
        const adapter = new BrowserProviderContractRunner();
        await adapter.init();

        const avatarAddress = ''

        const sdk = new Sdk (adapter); 
        const avatar = await sdk.getAvatar(avatarAddress)
        console.log(await avatar.getMintableAmount())

        const avatarInfo = await sdk.data.getAvatarInfo(avatarAddress);
        console.log(avatarInfo)
    } catch (e) {
        console.error(e)
    }    
}

run().catch(console.error).then(console.log)