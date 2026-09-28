# Cross-Chain Bridge (Lock-and-Mint)

A **lock-and-mint cross-chain token bridge** connecting L1 and L2 networks. Tokens are locked on L1 and equivalent wrapped tokens are minted on L2.

## Contracts

| Contract | Chain | Description |
|---|---|---|
| `L1Bridge.sol` | Layer 1 | Locks ERC-20 tokens; releases after L2 burn |
| `L2Bridge.sol` | Layer 2 | Mints/burns wrapped tokens based on L1 events |

## Bridge Architecture

```
L1 → L2 (deposit):
  User calls L1Bridge.deposit(amount, l2Recipient)
    ↓ (tokens locked in L1Bridge)
  DepositInitiated event emitted
    ↓ (off-chain relayer detects event)
  Relayer calls L2Bridge.mint(recipient, amount, depositId)
    ↓ (wrapped tokens minted on L2)
  User has wrapped tokens on L2

L2 → L1 (withdrawal):
  User calls L2Bridge.withdraw(amount, l1Recipient)
    ↓ (wrapped tokens burned)
  WithdrawalInitiated event emitted
    ↓ (off-chain relayer detects event)
  Relayer calls L1Bridge.release(recipient, amount, withdrawalId)
    ↓ (original tokens released on L1)
  User has original tokens on L1
```

## Security Features

- **Replay protection**: `processedWithdrawals` / `processedDeposits` mappings prevent double-spending
- **Pause mechanism**: Owner can pause both bridges in case of exploit
- **Relayer authorization**: Only the trusted relayer can mint/release
- **Emergency withdrawal**: Owner can recover funds if needed

## Production Extensions

In production bridges, replace the trusted relayer with:
- **Optimistic verification** (Arbitrum, Optimism) — challenge period + fraud proofs
- **ZK proofs** (zkSync, StarkNet, Polygon zkEVM) — cryptographic validity proofs
- **Multisig relayers** (Hop Protocol, Across) — multiple validators must agree

## Examples

- **Arbitrum Bridge** — optimistic rollup canonical bridge
- **Optimism Standard Bridge** — OP Stack bridge
- **Hop Protocol** — fast bridging with AMM liquidity
- **Across Protocol** — intent-based bridging
