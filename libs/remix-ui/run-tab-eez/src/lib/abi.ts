// Hand-written minimal ABI for the EEZ cross-chain proxy primitives this plugin needs.
// eez-core-protocol/src/base/EEZBase.sol / src/interfaces/IEEZ.sol.
export const EEZ_ABI = [
  'function computeCrossChainProxyAddress(address originalAddress, uint64 originalRollupId) view returns (address)',
  'function createCrossChainProxy(address originalAddress, uint64 originalRollupId) returns (address)',
  'function authorizedProxies(address proxy) view returns (bool isProxy, address originalAddress, uint64 originalRollupId)',
  'event CrossChainProxyCreated(address indexed proxy, address indexed originalAddress, uint64 indexed originalRollupId)'
]

export const EEZ_ROLLUP_ID_ABI = [
  'function ROLLUP_ID() view returns (uint64)',
  'function MAINNET_ROLLUP_ID() view returns (uint64)'
]
