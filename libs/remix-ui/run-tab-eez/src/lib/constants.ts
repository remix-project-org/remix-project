// Live composer RPC endpoints.
// (`eez_composerInfo`, proxy lookups, debug_* tracing).
//  Chains not listed here fall back to the RPC configured in Settings > EEZ (e.g. a local devnet). Transactions are still signed and sent by the wallet.
export const EEZ_COMPOSER_RPC_URLS: Record<string, string> = {
  // EEZ L1
  '10200': 'https://eez.dev/composer/l1',
  // EEZ L2
  '696990': 'https://eez.dev/composer/l2'
}
