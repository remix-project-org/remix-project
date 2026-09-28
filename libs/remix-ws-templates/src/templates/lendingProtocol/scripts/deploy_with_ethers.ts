import { deploy } from './ethers-lib'

(async () => {
  try {
    // Deploy a mock asset token first (e.g., USDC)
    const asset = await deploy('ERC20', [])
    console.log(`Asset token deployed at: ${asset.address}`)

    // Deploy the lending pool
    const pool = await deploy('LendingPool', [asset.address])
    console.log(`LendingPool deployed at: ${pool.address}`)

    console.log(`\nLending Pool: lpSHARE token represents your deposit`)
    console.log(`\nNext steps:`)
    console.log(`  Supply:`)
    console.log(`    1. Approve pool to spend your asset`)
    console.log(`    2. Call supply(amount) to deposit and receive lpSHARE tokens`)
    console.log(`  Borrow:`)
    console.log(`    1. Call depositCollateral(amount) to add collateral`)
    console.log(`    2. Call borrow(amount) — must stay above 75% LTV`)
    console.log(`  Repay:`)
    console.log(`    1. Approve pool to spend your asset`)
    console.log(`    2. Call repay(amount) to repay debt`)
    console.log(`  Withdraw:`)
    console.log(`    1. Call withdraw(shares) to redeem your supply`)
  } catch (e) {
    console.log(e.message)
  }
})()
