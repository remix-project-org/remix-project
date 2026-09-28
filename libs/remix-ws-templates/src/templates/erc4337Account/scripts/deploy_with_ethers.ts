import { deploy } from './ethers-lib'

(async () => {
  try {
    // 1. Deploy the Account Factory (which also deploys the implementation)
    const factory = await deploy('SimpleAccountFactory', [])
    console.log(`SimpleAccountFactory deployed at: ${factory.address}`)

    // 2. Deploy a Verifying Paymaster (owner acts as verifier initially)
    const [signer] = await (new (require('ethers').providers.Web3Provider)(web3Provider)).listAccounts()
    const paymaster = await deploy('VerifyingPaymaster', [signer])
    console.log(`VerifyingPaymaster deployed at: ${paymaster.address}`)

    console.log(`\nERC-4337 Account Abstraction setup:`)
    console.log(`  Factory: ${factory.address}`)
    console.log(`  Paymaster: ${paymaster.address}`)
    console.log(`\nTo create a smart wallet:`)
    console.log(`  const wallet = await factory.createAccount(ownerAddress, salt)`)
    console.log(`  // Or just predict the address before deploying:`)
    console.log(`  const addr = await factory.getAddress(ownerAddress, salt)`)
    console.log(`\nNote: For real ERC-4337 usage, you need:`)
    console.log(`  - A deployed EntryPoint (0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789)`)
    console.log(`  - A Bundler node to submit UserOperations`)
    console.log(`  - Fund the account or paymaster for gas`)
  } catch (e) {
    console.log(e.message)
  }
})()
