// Live composer RPC endpoints.
//  Chains not listed here fall back to the RPC configured in Settings > EEZ (e.g. a local devnet). Transactions are still signed and sent by the wallet.
export const EEZ_COMPOSER_PROBE_ADDRESS = '0x7Ae2c80116976915a0Ee9b7994e7Bb12026087f8'

export const EEZ_COMPOSER_RPC_URLS: Record<string, { label: string, rpcUrl: string, nativeCurrency?: { name: string, symbol: string, decimals: number } }> = {
  '10200': { label: 'Chiado', rpcUrl: 'https://eez.dev/composer/l1', nativeCurrency: { name: 'xDAI', symbol: 'XDAI', decimals: 18 } },
  '699069': { label: 'EEZ-X', rpcUrl: 'https://eez.dev/composer/l2', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }
}
