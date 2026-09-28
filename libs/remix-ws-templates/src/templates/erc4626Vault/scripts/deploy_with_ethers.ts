import { deploy } from './ethers-lib'

// To use this script:
// 1. First deploy a mock ERC-20 asset token (or use an existing one)
// 2. Update the assetAddress below
// 3. Compile all contracts (Ctrl+S or the compile button)
// 4. Run this script

(async () => {
  try {
    // Step 1: Deploy a simple ERC-20 to use as the vault's underlying asset
    // In production, replace with a real asset address (USDC, DAI, WETH, etc.)
    const MockToken = await deploy('ERC20', [])
    console.log(`MockToken deployed at: ${MockToken.address}`)

    // Step 2: Deploy the ERC-4626 vault
    const vault = await deploy('ERC4626Vault', [
      MockToken.address, // underlying asset
      'My Yield Vault',  // vault share token name
      'mvUSDC'           // vault share token symbol
    ])
    console.log(`ERC4626Vault deployed at: ${vault.address}`)
    console.log(`Share token: mvUSDC`)
    console.log(`\nNext steps:`)
    console.log(`  1. Approve vault to spend your asset tokens`)
    console.log(`  2. Call deposit(amount, receiver) to mint shares`)
    console.log(`  3. Owner calls depositYield(amount) to simulate yield accrual`)
    console.log(`  4. Call redeem(shares, receiver, owner) to exit`)
  } catch (e) {
    console.log(e.message)
  }
})()
