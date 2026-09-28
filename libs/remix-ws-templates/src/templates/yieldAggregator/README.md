# Yield Aggregator / Auto-Compounding Vault

A **Yearn-style yield aggregator vault** built on ERC-4626. Users deposit assets and a keeper periodically harvests yield and compounds it back into the vault, growing the share price automatically.

## Contracts

| Contract | Description |
|---|---|
| `YieldVault.sol` | Auto-compounding vault with keeper-based harvesting and performance fees |

## Key Concepts

- **ERC-4626 base**: Standard vault interface for deposit/withdraw/redeem
- **Strategy**: Owner deploys assets to earn yield (simulated here, real protocols in production)
- **Keeper**: Trusted address that calls `harvest()` to compound yield
- **Performance fee**: 10% of harvested yield goes to the treasury
- **Share price growth**: Each harvest increases `totalAssets` → share price rises

## Compounding Example

```
Day 0:
  Total assets: 1000 USDC, 1000 shares
  Share price: 1.00 USDC

Day 365 (10% APY, after harvest):
  Gross yield: 100 USDC
  Performance fee: 10 USDC → treasury
  Net compounded: 90 USDC
  Total assets: 1090 USDC, 1000 shares
  Share price: 1.09 USDC ← user profit without any action
```

## Getting Started

1. Deploy with `asset`, `treasury`, and `keeper` addresses
2. Users: `approve()` + `deposit(amount, receiver)` → receive yvSHARE
3. Owner: `deployToStrategy(amount)` to put capital to work
4. Keeper: `harvest()` periodically to compound yield
5. Users: `redeem(shares, receiver, owner)` to exit with profit

## Production Examples

- **Yearn Finance V3** — multi-strategy vault allocator
- **Beefy Finance** — auto-compounding yield optimizer
- **Convex Finance** — Curve LP reward compounder
- **Harvest Finance** — multi-protocol yield aggregator
