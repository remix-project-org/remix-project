# ERC-4337 Account Abstraction

**Smart contract wallets** following the ERC-4337 Account Abstraction standard. Users sign `UserOperations` instead of transactions, enabling gasless UX, batch calls, and custom validation logic.

## Contracts

| Contract | Description |
|---|---|
| `SimpleAccount.sol` | UUPS-upgradeable smart wallet with owner validation |
| `SimpleAccountFactory.sol` | CREATE2 factory for deterministic wallet addresses |
| `VerifyingPaymaster.sol` | Gas sponsor that validates off-chain authorization |

## Key Concepts

- **UserOperation**: Pseudo-transaction signed by the user (not a regular tx)
- **EntryPoint**: Singleton contract that orchestrates all AA calls
- **Bundler**: Off-chain node that batches UserOperations into real transactions
- **Paymaster**: Optional sponsor that pays gas fees on behalf of users
- **Counterfactual addresses**: Wallet address is known before deployment

## ERC-4337 Flow

```
1. User signs UserOperation (not an Ethereum transaction)
2. Bundler submits UserOp to EntryPoint
3. EntryPoint calls account.validateUserOp() → signature check
4. EntryPoint calls paymaster.validatePaymasterUserOp() (if applicable)
5. EntryPoint calls account.execute() → the actual call happens
6. EntryPoint calls paymaster.postOp() → charge user in ERC-20 (optional)
```

## Capabilities vs. EOA

| Feature | EOA | ERC-4337 Account |
|---|---|---|
| Batch transactions | ❌ | ✅ |
| Gasless UX (paymaster) | ❌ | ✅ |
| Social recovery | ❌ | ✅ |
| Custom validation | ❌ | ✅ |
| Upgradeable | ❌ | ✅ |

## Production Examples

- **Safe (Gnosis Safe)** — multi-sig smart wallet
- **Biconomy** — AA infrastructure and paymasters
- **ZeroDev** — ERC-4337 kernel wallets
- **Coinbase Smart Wallet** — consumer-facing AA wallets
