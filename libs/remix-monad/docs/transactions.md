# Access lists and delegation

Monad Eight, Nine, Ten and Next support transaction types 0, 1, 2 and 4 through `eth_sendTransaction`, `eth_sendRawTransaction`, `eth_call` and `eth_estimateGas`. Access lists and signed authorization lists are retained in transaction responses and saved sessions. Calls and estimates do not change committed state.

1. Copy [DelegatedAccount.sol](../examples/DelegatedAccount.sol) into Remix, compile it for Cancun, and confirm that `artifacts/DelegatedAccount.json` was generated.
2. Select a **Monad VM** environment and run [delegated-transactions.js](../examples/delegated-transactions.js) with **Ethers v6**.
3. The script deploys an implementation, delegates the second local account to it, writes through a signed access-list transaction and revokes delegation. It saves addresses and transaction hashes in `MonadDelegation.json` and prints hashes for debugging.

The implementation is an unrestricted local testing fixture. Storage and events belong to the delegated account, while the implementation supplies its code. Earlier transactions remain debuggable after revocation and save/restore because Monad traces retain the executed code.

To use the existing interface, deploy the implementation and choose **Authorize Delegation** from the account menu. Enter its address, interact with the added delegated contract instance, and remove delegation using the delegation badge.

Authorization processing precedes execution: applied delegations and authority nonce increments survive a revert; contract writes and events roll back. Invalid signatures, wrong-chain authorizations and stale nonces follow the engine's skip rules. The Monad debugger preserves these authorization lists even when ethers cannot format them.

Type-4 encoding uses Remix's existing EthereumJS transaction utility with Prague envelope rules, avoiding Ethereum Osaka's transaction gas cap. Execution, authorization processing and gas accounting remain in `monad-evm2js`. Saved sender/authority history preserves Monad reserve checks across revocation and restoration.
