# Lending Protocol

A simplified **Compound/Aave-style lending and borrowing pool**. Lenders earn interest by supplying assets; borrowers unlock liquidity by posting collateral.

## Contracts

| Contract | Description |
|---|---|
| `LendingPool.sol` | Single-asset lending pool with interest accrual, collateral, and liquidations |

## Key Concepts

- **cToken model**: Lenders receive pool shares (lpSHARE) whose exchange rate grows with interest
- **Utilization-based rates**: Higher utilization → higher borrow APR
- **Liquidation**: Under-collateralized positions can be liquidated for a 10% bonus
- **Interest accrual**: Compound interest accrues continuously via `accrueInterest()`

## Interest Rate Model

```
Utilization = totalBorrows / totalAssets
BorrowRate  = BASE_RATE + SLOPE * Utilization
            = 2% + 20% * utilization  (per year)
```

## Collateral Rules

| Ratio | Threshold |
|---|---|
| > 75% LTV | Can borrow |
| < 75% LTV | Position liquidatable |
| Liquidation bonus | 10% discount on collateral |

## Getting Started

1. Compile the contract (Ctrl+S)
2. Deploy an ERC-20 asset token
3. Deploy `LendingPool(assetAddress)`
4. Supply: `approve()` + `supply(amount)` → receive lpSHARE tokens
5. Borrow: `depositCollateral()` + `borrow()` (must stay < 75% LTV)

## Production Examples

- **Compound V2/V3** — the original cToken model
- **Aave V2/V3** — aToken model with variable/stable rates
- **Euler Finance** — reactive interest rate model
