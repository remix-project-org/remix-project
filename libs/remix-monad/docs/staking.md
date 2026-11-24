# Local staking

Copy [StakingDemo.sol](../examples/StakingDemo.sol) and
[staking-workflow.js](../examples/staking-workflow.js) to the workspace root.
Select **Monad VM** and any of its four forks, compile `StakingDemo.sol` for Cancun,
then run the script with the **Ethers v6** runner in a fresh VM.
The script funds the selected account, registers a validator,
delegates, advances epochs, claims rewards and withdraws. Its final terminal line
includes transaction hashes to paste into the debugger, including a caught early
withdrawal and a reverted caller.

## Development controls

```js
await provider.send('monad_setBalance', [account, ethers.toQuantity(ethers.parseEther('30000000'))])
await provider.send('monad_stakingTransition', [{ kind: 'snapshot' }])
await provider.send('monad_stakingTransition', [{ kind: 'epochChange', epoch: '0x1' }])
await provider.send('monad_stakingTransition', [{ kind: 'reward', author, amount: '0xde0b6b3a7640000' }])
```

Balance setup accepts an existing local account before the first execution or
staking transition. Default accounts still start with 100 MON; reset the VM to
repeat setup. Balances and reward amounts are unsigned 256-bit hex quantities;
epochs are hex quantities below `0xffffffffffffffff` and must advance the current
epoch. A snapshot opens the epoch delay period; an epoch change closes it. The
script advances epochs explicitly to activate delegations and unlock withdrawals.
The provider initializes the staking system account with nonce 1 on its first
successful transition, preserving its storage even when its balance is zero.

Each successful transition creates an empty local block and returns `blockHash`,
`blockNumber`, `success`, `error`, `returnValue`, `gasSpent` and `logs`. It has no
user transaction, fee, nonce increment or EVM instruction trace. System logs are
available in the result and saved transition history. Failed requests leave
engine state and local history unchanged. Rewards mint the backing staking
balance; transition timing is controlled by the script.

## Debugging and saved state

All staking precompile methods at `0x1000`, including getters, require `CALL`.
Use `eth_call` or Ethers `contract.epoch.staticCall()` to simulate the Solidity
caller without committing state; the Solidity implementation still uses `CALL`.

Instruction traces show the caller before and after the precompile call, including
source locations, return data and storage. Precompile internals have no EVM bytecode
to step through. The early withdrawal in the example is a successful transaction
that catches a failed call; `rejectAfterStake` reverts the transaction and its
staking changes.

Remix's existing state-fork and reset controls preserve staking storage, epochs,
transition records and transaction traces. Historical reads support transition
blocks by number or hash. Restored sessions can continue staking and advancing
epochs; version 1 sessions saved before staking controls remain supported.

The local engine skips validator-registration signature verification and uses
`authAddress` for reward-author lookup. The example uses placeholder signatures
and local funds; it is intended for local VM testing.
