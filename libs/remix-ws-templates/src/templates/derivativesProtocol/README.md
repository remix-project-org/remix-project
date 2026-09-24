# Derivatives / Synthetics Protocol

Two core derivative contract types: **perpetual futures** with funding rates, and **European options** with cash settlement.

## Contracts

| Contract | Description |
|---|---|
| `PerpetualMarket.sol` | Leveraged long/short perpetuals with funding rate mechanism |
| `OptionsVault.sol` | Cash-settled European call and put options with collateral locking |

---

## Perpetual Market

Perpetuals are futures contracts with no expiry. Traders post collateral and open leveraged positions. A periodic **funding rate** keeps the perpetual price anchored to the spot/index price.

### Mechanics

```
Funding rate = (markPrice - indexPrice) / indexPrice
If fundingRate > 0: longs pay shorts  (perp trading above spot)
If fundingRate < 0: shorts pay longs  (perp trading below spot)
```

### Position Example

```
Collateral: 100 USDC
Leverage:   5x
Size:       500 USD notional
Entry price: $2000

Price moves to $2200 (+10%):
  Long PnL = size × (2200 - 2000) / 2000 = $50
  Margin ratio = (100 + 50) / 500 = 30%  ← above 5% maintenance ✓

Price drops to $1900 (-5%):
  Long PnL = -$25
  Margin ratio = (100 - 25) / 500 = 15%  ← above 5% ✓

Price drops to $1800 (-10%):
  Long PnL = -$50
  Margin ratio = (100 - 50) / 500 = 10%  ← above 5% ✓

Price drops to $1740 (-13%):
  Margin ratio ≈ 4.6%  ← BELOW 5% → liquidatable
```

---

## Options Vault

European options that settle in cash (USDC) at expiry. Writers lock collateral; buyers pay a premium upfront.

### Payoffs at Settlement

| Type | In the Money | Payout |
|---|---|---|
| Call | spot > strike | `(spot - strike) × size` |
| Put | spot < strike | `(strike - spot) × size` |

### Lifecycle

```
1. Writer locks collateral → writeOption(Call, strike=$2500, expiry=7days, size, premium)
2. Buyer pays premium    → buyOption(optionId)
3. At expiry             → settle(optionId, settlementPrice)
   → If ITM: buyer receives payout, writer gets remainder
   → If OTM: writer gets full collateral back
```

### Collateral Requirements

| Option Type | Required Collateral |
|---|---|
| Call | `size` (full notional) |
| Put | `strike × size / 1e18` |

---

## Production Examples

**Perpetuals**: dYdX, GMX, Perpetual Protocol, Drift Protocol, Gains Network
**Options**: Opyn (oTokens), Lyra Finance, Hegic, Dopex, Premia Finance
**Synthetics**: Synthetix (synthetic assets tracking any price), Mirror Protocol
