import { deploy } from './ethers-lib'

(async () => {
  try {
    // 1. Deploy the stablecoin token
    const stablecoin = await deploy('Stablecoin', [])
    console.log(`Stablecoin (USDX) deployed at: ${stablecoin.address}`)

    // 2. Deploy the CDP Vault Manager with ETH price = $2000
    const ethPrice = (2000n * 10n ** 18n).toString() // $2000 with 18 decimals
    const vaultManager = await deploy('CDPVaultManager', [stablecoin.address, ethPrice])
    console.log(`CDPVaultManager deployed at: ${vaultManager.address}`)

    console.log(`\nNext steps:`)
    console.log(`  1. Grant MINTER_ROLE on Stablecoin to the VaultManager:`)
    console.log(`     stablecoin.grantRole(MINTER_ROLE, vaultManager.address)`)
    console.log(`  2. Send ETH to depositCollateral() to open a vault`)
    console.log(`  3. Call mintDebt(amount) to mint USDX against your collateral`)
    console.log(`     (must maintain >150% collateral ratio)`)
    console.log(`  4. Call repayDebt(amount) + withdrawCollateral() to close vault`)
    console.log(`  5. Vault health: getCollateralRatio(address) >= 15000 (150%)`)
  } catch (e) {
    console.log(e.message)
  }
})()
