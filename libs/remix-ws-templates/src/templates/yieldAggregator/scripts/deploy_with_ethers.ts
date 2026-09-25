import { deploy } from './ethers-lib'

(async () => {
  try {
    const [deployer] = await (new (require('ethers').providers.Web3Provider)(web3Provider)).listAccounts()

    // 1. Deploy a mock underlying asset (e.g., USDC)
    const asset = await deploy('ERC20', [])
    console.log(`Asset token deployed at: ${asset.address}`)

    // 2. Deploy the YieldVault
    const vault = await deploy('YieldVault', [
      asset.address, // underlying asset
      deployer,      // treasury (receives performance fees)
      deployer       // keeper (authorized to call harvest)
    ])
    console.log(`YieldVault deployed at: ${vault.address}`)

    console.log(`\nYield Vault setup:`)
    console.log(`  Asset: ${asset.address}`)
    console.log(`  Vault: ${vault.address}`)
    console.log(`  Share token: yvSHARE`)
    console.log(`  APY: 10% (simulated)`)
    console.log(`  Performance fee: 10% of yield → treasury`)
    console.log(`\nUser flow:`)
    console.log(`  1. asset.approve(vault.address, amount)`)
    console.log(`  2. vault.deposit(amount, yourAddress) → receive yvSHARE tokens`)
    console.log(`  3. vault.deployToStrategy(amount) [owner only] → deploy to earn yield`)
    console.log(`  4. vault.harvest() [keeper] → compound yield`)
    console.log(`  5. vault.redeem(shares, yourAddress, yourAddress) → exit`)
    console.log(`\nShare price grows over time as yield is compounded.`)
  } catch (e) {
    console.log(e.message)
  }
})()
