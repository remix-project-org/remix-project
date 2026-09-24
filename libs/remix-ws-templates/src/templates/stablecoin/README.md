# Collateralized Stablecoin System

A **MakerDAO-style CDP (Collateralized Debt Position)** system. Users lock ETH as collateral to mint a USD-pegged stablecoin (USDX).

## Contracts

| Contract | Description |
|---|---|
| `Stablecoin.sol` | The ERC-20 stablecoin (USDX) with role-based mint/burn |
| `CDPVaultManager.sol` | CDP engine — collateral, debt, stability fees, liquidations |

## Key Concepts

- **CDP / Vault**: A user's collateral and debt position
- **Over-collateralization**: Must maintain > 150% collateral ratio
- **Stability fee**: 2% annual fee on outstanding debt (accrues as extra debt)
- **Liquidation**: Vaults below 130% collateral ratio can be liquidated

## Collateral Ratio Examples

```
ETH Price: $2000
Deposit: 1 ETH ($2000 value)
Max mint: $2000 * (100/150) = $1333 USDX  (150% ratio)

If ETH falls to $1500:
  Collateral value = $1500
  Debt = $1333
  Ratio = 1500/1333 = 112%  ← BELOW 130% → liquidatable!
```

## Getting Started

1. Compile both contracts (Ctrl+S)
2. Deploy `Stablecoin`
3. Deploy `CDPVaultManager(stablecoin, ethPrice)`
4. Grant `MINTER_ROLE` to VaultManager: `stablecoin.grantRole(MINTER_ROLE, vaultManager)`
5. Send ETH to `depositCollateral()` (payable)
6. Call `mintDebt(amount)` to receive USDX

## Production Examples

- **MakerDAO / DAI** — ETH and multi-collateral CDPs
- **Liquity / LUSD** — ETH-only, 110% minimum ratio, no stability fees
- **Reflexer / RAI** — non-pegged floating stablecoin using CDPs
