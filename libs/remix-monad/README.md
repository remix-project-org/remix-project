# Local Monad VM

Runs [monad-evm2js](https://github.com/category-labs/monad-alloy-evm2/tree/main/crates/monad-evm2js) in Remix's VM worker. The Rust/WASM engine owns execution and state; this provider adapts accounts, transactions and traces to Remix.

## Try it

Use the repository's Node version, run `yarn install --frozen-lockfile` and `yarn nx serve remix-ide`. No Rust tools are needed.

In **Deploy & Run → Environment → Monad VM**, select **Monad Eight**, **Monad Nine**, **Monad Ten** or **Monad Next (experimental)**. Deploy [MonadDemo.sol](examples/MonadDemo.sol), compiled for Cancun, and open its transaction in the debugger. The extension example requires Monad Next.

The package is pinned to a prebuilt distribution commit; its `build-info.json` records the source revision. Eight uses Prague opcode metadata; Nine, Ten and Next use Osaka. Execution and gas accounting always use the selected Monad rules.

Saved Monad VM sessions restore local accounts, contract state and debugging history for the same hardfork.

The initial RPC surface supports local accounts, legacy and EIP-1559 transactions, calls, gas estimation, saved state and debugging.

This is a local development VM with synthetic blocks and receipts. Remote RPC forking is unsupported. Each trace is limited to 100,000 steps or 32 MiB; incomplete traces report an error.
