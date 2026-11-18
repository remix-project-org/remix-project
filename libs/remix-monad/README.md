# Local Monad VM

Runs [monad-evm2js](https://github.com/category-labs/monad-alloy-evm2/tree/main/crates/monad-evm2js) in Remix's VM worker. The Rust/WASM engine owns execution and state; this provider adapts accounts, transactions and traces to Remix.

## Try it

Use the repository's Node version, run `yarn install --frozen-lockfile` and `yarn nx serve remix-ide`. No Rust tools are needed.

In **Deploy & Run → Environment → Monad VM**, select **Monad Eight**, **Monad Nine**, **Monad Ten** or **Monad Next (experimental)**. Deploy [MonadDemo.sol](examples/MonadDemo.sol), compiled for Cancun, and open its transaction in the debugger. The extension example requires Monad Next.

The package is pinned to a prebuilt distribution commit; its `build-info.json` records the source revision. Eight uses Prague opcode metadata; Nine, Ten and Next use Osaka. Execution and gas accounting always use the selected Monad rules.

All Monad forks use chain ID **143**, matching Monad mainnet, while executing locally. Saved Monad VM sessions restore local accounts, contract state and debugging history for the same hardfork and chain ID.

The initial RPC surface supports local accounts, legacy and EIP-1559 transactions, calls, gas estimation, saved state and debugging.

This is a local development VM with synthetic blocks and receipts. Remote RPC forking is unsupported. Each trace is limited to 100,000 steps or 32 MiB; incomplete traces report an error.

## Test

Run `yarn test:monad:ui` for chain ID consistency, signed transactions, save/restore, account-preference isolation and exact MON formatting. For browser regressions:

```sh
yarn nx build remix-ide --configuration=development
yarn playwright install chromium
yarn test:monad:browser
```

The browser tests cover fork-specific VM badges, chain IDs, account aliases, payable deployments and transaction currency on all four Monad forks and Ethereum Osaka, using the installed Solidity compiler. They also cover MON formatting in a named fork of a Monad VM.
