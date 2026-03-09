/**
 * Shared utility: chainId → human-readable network name.
 *
 * Consolidates the two separate copies that previously lived in
 * quick-dapp-v2.tsx and remix-client.ts into a single source of truth.
 */

const NETWORK_NAMES: Record<number, string> = {
  // ── Mainnets ──
  1: 'Ethereum Mainnet',
  137: 'Polygon',
  42161: 'Arbitrum One',
  10: 'Optimism',
  8453: 'Base',
  43114: 'Avalanche',
  56: 'BSC',
  324: 'zkSync Era',
  100: 'Gnosis',
  42220: 'Celo',
  7777777: 'Zora',
  59144: 'Linea',
  534352: 'Scroll',
  81457: 'Blast',

  // ── Testnets ──
  11155111: 'Sepolia',
  17000: 'Holesky',
  80002: 'Polygon Amoy',
  84532: 'Base Sepolia',
  421614: 'Arbitrum Sepolia',
  11155420: 'Optimism Sepolia',
  59141: 'Linea Sepolia',
  534351: 'Scroll Sepolia',
  168587773: 'Blast Sepolia',

  5: 'Goerli (deprecated)',
  80001: 'Polygon Mumbai (deprecated)',
  84531: 'Base Goerli (deprecated)',
};

export function getNetworkName(chainId: string | number): string {
  const chainIdStr = String(chainId);

  // Handle Remix VM chain IDs (e.g. "vm-cancun", "vm-paris", "vm-shanghai")
  if (chainIdStr.startsWith('vm')) {
    return 'Remix VM';
  }

  const id = Number(chainIdStr);
  if (!isNaN(id) && NETWORK_NAMES[id]) {
    return NETWORK_NAMES[id];
  }

  return isNaN(id) ? 'Unknown Chain' : `Chain ${id}`;
}
