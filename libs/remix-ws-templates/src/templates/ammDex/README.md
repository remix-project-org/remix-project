# AMM / DEX — Constant Product Pool

A simplified **Uniswap V2-style Automated Market Maker** (AMM). Uses the constant-product formula `x * y = k` to price swaps between two ERC-20 tokens.

## Contracts

| Contract | Description |
|---|---|
| `ConstantProductAMM.sol` | AMM pool with liquidity provision and direct swapping |
| `Router.sol` | Entry-point with deadline protection, slippage guards, and multi-hop routing |

## Key Concepts

- **Constant product**: The product of reserves `x * y` stays constant after every swap
- **LP tokens**: Liquidity providers receive ERC-20 LP tokens representing their pool share
- **0.3% fee**: A small fee on every swap accrues to LPs (like Uniswap V2)
- **Price impact**: Larger swaps relative to pool size move the price more

## How It Works

```
Pool seeded with: 1000 TokenA + 1000 TokenB  (k = 1,000,000)
Price: 1 TokenA = 1 TokenB

Swap 100 TokenA in:
  amountOut = (100 * 997 * 1000) / (1000 * 1000 + 100 * 997) ≈ 90.6 TokenB
  New price: 1 TokenA ≈ 0.82 TokenB (price impact)
```

## Router

Users should interact through the **Router**, not the pool directly. The Router adds:
- **Deadline**: tx reverts if block.timestamp > deadline (prevents stale price execution)
- **Slippage guard**: `amountOutMin` parameter reverts if output is too low
- **Multi-hop**: chain pools to swap A→B→C in a single transaction

```solidity
// Single-hop swap via Router
router.swapExactTokensForTokens(pool, tokenA, 100e18, minOut, recipient, block.timestamp + 60)

// Multi-hop swap: A→B→C
router.swapExactTokensForTokensMultiHop([poolAB, poolBC], [A, B, C], amountIn, minOut, to, deadline)

// Price quote (view, no gas)
uint256[] memory amounts = router.getAmountsOut([pool], [tokenA, tokenB], amountIn)
```

## Getting Started

1. Compile the contracts (Ctrl+S)
2. Deploy two test ERC-20 tokens
3. Deploy `ConstantProductAMM(token0, token1)`
4. Deploy `Router`
5. Approve the pool for both tokens, call `pool.addLiquidity()` to seed it
6. Approve the Router for your input token, call `router.swapExactTokensForTokens()`

## Production Examples

- **Uniswap V2/V3** — the original constant-product AMM
- **Curve Finance** — stable-swap AMM optimized for pegged assets
- **Balancer** — weighted pools with multiple tokens
- **SushiSwap, PancakeSwap** — Uniswap V2 forks
