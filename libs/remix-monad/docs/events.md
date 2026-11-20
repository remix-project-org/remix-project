# Event queries and listeners

1. Copy [EventQueries.sol](../examples/EventQueries.sol) into Remix and compile it for Cancun with Solidity 0.8.24 or newer. Confirm that `artifacts/EventQueries.json` was generated.
2. Select any fork under **Deploy & Run → Environment → Monad VM**.
3. Copy [event-listeners.js](../examples/event-listeners.js) into a script file and choose **Run with Ethers v6**.

The script deploys the contract using the selected account, receives events with `on` and `once`, removes its listener with `off`, and queries indexed events with `queryFilter`. It also polls log and block filters. The terminal prints the contract address and successful/reverted transaction hashes; open either hash in the debugger to inspect the event emission. Reverted events remain in the instruction trace but are excluded from receipts and queries.

The provider supports `eth_getLogs`, `eth_newFilter`, `eth_newBlockFilter`, `eth_getFilterChanges`, `eth_getFilterLogs` and `eth_uninstallFilter`. Queries accept inclusive block ranges or a block hash, an address or address array, and positional topics with OR alternatives and wildcards. Omitted ranges select the latest block; use `fromBlock: 'earliest'` for all retained history.

Polling returns changes since filter creation or its previous poll. Historical `eth_getFilterLogs` queries do not advance that cursor. Calls, gas estimates and reverted logs produce no events; reverted transactions still create blocks. The local VM mines immediately, so the example waits for ethers to initialize and resume polling before emitting the next event.

Saved sessions retain committed event history. Filters belong to the current provider and are not saved: recreate listeners after restoring, resetting or switching VMs. The example uninstalls its filters before finishing. WebSocket subscriptions and pending-transaction filters are not supported.
