# ERC-4626 Tokenized Vault

ERC-4626 is the **standard interface for yield-bearing vaults** (EIP-4626). It standardizes how tokens are deposited, withdrawn, and accounted for in DeFi yield strategies.

## Contracts

| Contract | Description |
|---|---|
| `ERC4626Vault.sol` | A yield-bearing vault where deposits earn a growing share price |

## Key Concepts

- **Deposit → Shares**: Users deposit an underlying ERC-20 asset and receive vault shares
- **Share price**: As yield accrues, each share becomes worth more underlying asset
- **Withdraw/Redeem**: Burn shares to receive proportional underlying assets
- **`totalAssets()`**: The total underlying assets managed by the vault

## How It Works

```
User deposits 100 USDC → receives 100 shares (initial price: 1 USDC/share)
Owner injects 10 USDC yield → total assets = 110 USDC, 100 shares outstanding
Share price = 110/100 = 1.10 USDC/share
User redeems 100 shares → receives 110 USDC
```

## Getting Started

1. Compile the contract (Ctrl+S)
2. Deploy a test ERC-20 asset token (or use an existing one)
3. Deploy `ERC4626Vault` with the asset address, name, and symbol
4. Approve the vault to spend your asset, then call `deposit()`
5. Check `sharePrice()` before and after `depositYield()` to see compounding

## Production Examples

- **Yearn V3 vaults** — auto-compounding yield strategies
- **Aave V3 aTokens** — interest-bearing wrappers
- **Compound V3** — supply positions as ERC-4626
- **ERC-4626 aggregators** — MetaMorpho (Morpho Blue)
