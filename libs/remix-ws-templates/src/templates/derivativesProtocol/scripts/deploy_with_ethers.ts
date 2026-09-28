import { deploy } from './ethers-lib'

(async () => {
  try {
    // 1. Deploy a mock USDC token (collateral for both contracts)
    const usdc = await deploy('ERC20', [])
    console.log(`Mock USDC deployed at: ${usdc.address}`)

    // 2. Deploy the Perpetual Market (ETH/USD perp, starting price $2000)
    const initialPrice = (2000n * 10n ** 18n).toString()
    const perp = await deploy('PerpetualMarket', [usdc.address, initialPrice])
    console.log(`PerpetualMarket deployed at: ${perp.address}`)

    // 3. Deploy the Options Vault
    const options = await deploy('OptionsVault', [usdc.address])
    console.log(`OptionsVault deployed at: ${options.address}`)

    console.log(`\n=== Perpetual Market ===`)
    console.log(`  Collateral: USDC`)
    console.log(`  Initial index price: $2000`)
    console.log(`  Max leverage: 10x`)
    console.log(`  Maintenance margin: 5%`)
    console.log(`\nTo trade perps:`)
    console.log(`  1. usdc.approve(perp.address, collateralAmount)`)
    console.log(`  2. perp.openPosition(0 = Long | 1 = Short, collateral, leverage)`)
    console.log(`  3. perp.settleFunding()  ← call periodically`)
    console.log(`  4. perp.closePosition()`)

    console.log(`\n=== Options Vault ===`)
    console.log(`  Settlement token: USDC`)
    console.log(`  Option styles: European (cash-settled at expiry)`)
    console.log(`\nTo write a call option (e.g. ETH $2500 call, 7-day expiry):`)
    console.log(`  1. usdc.approve(options.address, collateral)`)
    console.log(`  2. options.writeOption(0=Call, strikePrice, expiryTimestamp, size, premium)`)
    console.log(`\nTo buy the option:`)
    console.log(`  3. usdc.approve(options.address, premium)`)
    console.log(`  4. options.buyOption(optionId)`)
    console.log(`\nAt expiry:`)
    console.log(`  5. options.settle(optionId, settlementPrice)`)
  } catch (e) {
    console.log(e.message)
  }
})()
