# Signing and console output

1. Copy [MonadSigning.sol](../examples/MonadSigning.sol) into `contracts/MonadSigning.sol` in Remix and compile it for Cancun with Solidity 0.8.24 or newer. Confirm that `artifacts/MonadSigning.json` was generated.
2. Select any fork under **Deploy & Run → Environment → Monad VM**.
3. Copy [sign-and-execute.ts](../examples/sign-and-execute.ts) into a script file and choose **Run with Ethers v6** from the editor's run menu.

The script deploys the contract, signs an EIP-712 message using the selected account and chain ID 143, and submits it for Solidity signature verification. The contract stores `42`, consumes a nonce and logs the value and signer through `hardhat/console.sol`. The script reads that output with `eth_getHHLogsForTx` and prints it in the terminal. Open the printed transaction hash in the debugger to inspect the signature verification and storage write.

The script also writes `MonadTypedData.json`. Right-click that file and choose **Sign Typed Data** to sign its contents through Remix's file explorer.

`eth_signTypedData_v4` accepts an object or JSON string; `eth_signTypedData` uses the same v4 format. Signing preserves the supplied domain and does not change VM state. Unknown accounts and malformed payloads return invalid-parameter errors.

Deploy & Run displays console output automatically; scripts can retrieve it by transaction hash as the example does. Console output is diagnostic data, separate from receipt events. It remains available for reverted executions and saved/restored transactions. Unknown or malformed console payloads are ignored.
