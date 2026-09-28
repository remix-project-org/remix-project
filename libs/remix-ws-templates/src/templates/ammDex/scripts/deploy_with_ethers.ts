import { deploy } from './ethers-lib'

// To use this script:
// 1. Deploy two ERC-20 tokens (or provide existing addresses)
// 2. Compile all contracts
// 3. Run this script

(async () => {
  try {
    // Deploy two mock tokens to use as the trading pair
    const tokenA = await deploy('ERC20', [])
    const tokenB = await deploy('ERC20', [])
    console.log(`TokenA deployed at: ${tokenA.address}`)
    console.log(`TokenB deployed at: ${tokenB.address}`)

    // Deploy the AMM pool for TokenA/TokenB
    const amm = await deploy('ConstantProductAMM', [tokenA.address, tokenB.address])
    console.log(`ConstantProductAMM deployed at: ${amm.address}`)

    // Deploy the Router (entry point for swaps with deadline + multi-hop support)
    const router = await deploy('Router', [])
    console.log(`Router deployed at: ${router.address}`)

    console.log(`\nPool: TokenA / TokenB`)
    console.log(`LP Token: AMM-LP`)
    console.log(`\nDirect pool usage:`)
    console.log(`  1. Approve AMM to spend both tokens`)
    console.log(`  2. pool.addLiquidity(amount0, amount1) to seed the pool`)
    console.log(`  3. pool.swap(tokenIn, amountIn, minAmountOut) to trade`)
    console.log(`\nRouter usage (recommended for production):`)
    console.log(`  1. Approve Router to spend your input token`)
    console.log(`  2. router.swapExactTokensForTokens(pool, tokenIn, amountIn, minOut, to, deadline)`)
    console.log(`  3. Multi-hop: router.swapExactTokensForTokensMultiHop([poolAB,poolBC], [A,B,C], ...)`)
    console.log(`  4. router.getAmountsOut([pool], [tokenA, tokenB], amountIn) for price quotes`)
  } catch (e) {
    console.log(e.message)
  }
})()
