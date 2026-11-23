// Hand-written minimal ABI for the EEZ cross-chain proxy primitives this plugin needs.
// eez-core-protocol/src/base/EEZBase.sol / src/interfaces/IEEZ.sol.
export const EEZ_ABI = [
  'function computeCrossChainProxyAddress(address originalAddress, uint64 originalRollupId) view returns (address)',
  'function createCrossChainProxy(address originalAddress, uint64 originalRollupId) returns (address)',
  'function authorizedProxies(address proxy) view returns (bool isProxy, address originalAddress, uint64 originalRollupId)',
  'event CrossChainProxyCreated(address indexed proxy, address indexed originalAddress, uint64 indexed originalRollupId)'
]

const EEZ_CALL_TUPLE = '(uint16 revertNextNCalls, bool isStatic, uint64 gas, address sourceAddress, uint64 sourceRollupId, address targetAddress, uint256 value, bytes data)'
export const EEZ_TRACE_ABI = [
  'event CrossChainCallExecuted(bytes32 indexed crossChainCallHash, address indexed proxy, address sourceAddress, bytes callData, uint256 value)',
  'event CrossChainCallExecuted(bytes32 indexed crossChainCallHash, address indexed proxy, address sourceAddress, bytes callData, uint256 value, uint64 callGas)',
  'event IncomingCrossChainCallExecuted(bytes32 indexed crossChainCallHash, bool isStatic, address sourceAddress, uint64 sourceRollup, address destination, uint256 value, uint64 callGas, bytes data)',
  'event ExecutionConsumed(bytes32 indexed crossChainCallHash, uint64 indexed rollupId, uint256 indexed entryQueueIndex)',
  'event ExecutionConsumed(bytes32 indexed crossChainCallHash, uint256 indexed entryIndex)',
  `event ExecutionTableLoaded((bytes32 proxyEntryHash, ${EEZ_CALL_TUPLE}[] incomingCalls, (bytes32 expectedOutgoingHash, ${EEZ_CALL_TUPLE}[] incomingCalls, bytes32 revertedOrStaticRollingHash, bool success, bytes returnData)[] expectedOutgoingCalls, bytes32 rollingHash, bool success, bytes returnData)[] entries, (uint256 expectedEntryIndex, bytes32 proxyEntryHash, ${EEZ_CALL_TUPLE}[] incomingCalls, bytes32 rollingHash, bool success, bytes returnData)[] staticEntries)`
]

export const EEZ_ROLLUP_ID_ABI = [
  'function ROLLUP_ID() view returns (uint64)',
  'function MAINNET_ROLLUP_ID() view returns (uint64)'
]

// `eth_call` to EEZ_COMPOSER_PROBE_ADDRESS; a plain RPC returns `0x`.
export const EEZ_COMPOSER_PROBE_ABI = [
  'function composerInfo(bytes32 nonce) view returns (bytes32, uint256, bytes32, uint256, bytes)'
]
