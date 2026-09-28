# DAO Governance

An **OpenZeppelin Governor-style on-chain DAO** with a governance token, timelock, and full proposal lifecycle.

## Contracts

| Contract | Description |
|---|---|
| `GovernanceToken.sol` | ERC-20 voting token with delegation (ERC20Votes) |
| `DAOGovernor.sol` | On-chain governor with proposal/vote/execute lifecycle |
| `DAOTimelock.sol` | Mandatory delay between approval and execution |

## Governance Lifecycle

```
1. Delegate  → token holders activate voting power via delegate()
2. Propose   → create an on-chain proposal with targets/calldata
3. Vote      → For / Against / Abstain during the voting period (~1 week)
4. Queue     → if quorum (4%) + majority met, queue in timelock
5. Execute   → after timelock delay (2 days), anyone can execute
```

## Parameters (configurable)

| Parameter | Default |
|---|---|
| Voting delay | 1 block |
| Voting period | ~1 week (50,400 blocks) |
| Quorum | 4% of total supply |
| Timelock delay | 2 days |

## Post-Deployment Setup

```solidity
// Grant Governor the PROPOSER_ROLE on the Timelock
timelock.grantRole(PROPOSER_ROLE, address(governor));

// Allow anyone to execute (open execution)
timelock.grantRole(EXECUTOR_ROLE, address(0));

// Renounce deployer's admin role for full decentralization
timelock.renounceRole(DEFAULT_ADMIN_ROLE, deployer);
```

## Production Examples

- **Uniswap Governance** — UNI token + GovernorBravo
- **Compound Governance** — COMP token + GovernorBravo
- **ENS DAO** — ENS token + OZ Governor
- **Gitcoin / Hop Protocol** — OZ Governor pattern
