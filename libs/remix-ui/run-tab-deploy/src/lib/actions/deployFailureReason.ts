// Turns a deploy error into a short, fixed reason for the udapp:deployFailed
// Matomo event. Only the reason is sent, never the error text: messages can
// hold addresses, argument values or RPC URLs.
//
// The checks run in order, first match wins. Library deploys and Remix's
// own error rewriting (txExecution.checkError) wrap the original message,
// so a wallet rejection or a lack of funds is checked before the rest.
export type DeployFailureReason =
  | 'cancelled-gas-estimation' // "Gas estimation failed" dialog → Cancel Transaction
  | 'cancelled-confirmation' // mainnet "Confirm transaction" dialog → Cancel
  | 'rejected-in-wallet' // MetaMask, WalletConnect… rejected
  | 'cancelled-other' // another Remix prompt cancelled (passphrase…)
  | 'insufficient-funds'
  | 'bad-arguments' // constructor arguments could not be encoded
  | 'no-account'
  | 'reverted' // the constructor reverted, or the tx failed on chain
  | 'out-of-gas'
  | 'gas-estimation-error'
  | 'nonce'
  | 'fee'
  | 'libraries'
  | 'network' // RPC, connection, timeout, rate limit
  | 'other'

const RULES: [DeployFailureReason, RegExp][] = [
  ['cancelled-gas-estimation', /canceled by user \(gas estimation failed\)/i],
  ['cancelled-confirmation', /canceled by user \(confirmation dialog\)/i],
  ['rejected-in-wallet', /user denied|user rejected|ACTION_REJECTED|rejected the request|request rejected|rejected by user|user cancel|\b4001\b/i],
  ['cancelled-other', /cancell?ed by user/i],
  ['insufficient-funds', /insufficient funds|exceeds balance|not enough (funds|balance)/i],
  ['bad-arguments', /error encoding arguments|invalid (tuple )?params|is not a valid address/i],
  ['no-account', /"from" is not defined|no accounts available|invalid account selected|unknown account/i],
  ['reverted', /revert|transaction execution failed|invalid opcode|execution failed/i],
  ['out-of-gas', /out of gas|gas required exceeds|intrinsic gas|exceeds block gas limit/i],
  ['gas-estimation-error', /gas estimation failed/i],
  ['nonce', /nonce/i],
  ['fee', /underpriced|max fee|priority fee|gas price|transaction fee/i],
  ['libraries', /librar(y|ies)/i],
  ['network', /network|timeout|timed out|failed to fetch|json[- ]?rpc|rpc error|could not coalesce|disconnected|connection|rate limit|\b429\b/i]
]

export function deployFailureReason (error: unknown): DeployFailureReason {
  const message = typeof error === 'string' ? error : (error as any)?.message ?? String(error ?? '')
  for (const [reason, pattern] of RULES) {
    if (pattern.test(message)) return reason
  }
  return 'other'
}
