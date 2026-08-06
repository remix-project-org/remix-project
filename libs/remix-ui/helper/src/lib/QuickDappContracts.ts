const MAX_QUICK_DAPP_CONTRACTS = 8

export interface QuickDappContractInput {
  name: string
  address: string
  abi: any[]
  chainId: number | string
  networkName?: string
  sourceFilePath?: string
  alias?: string
}

export interface QuickDappContractBinding extends QuickDappContractInput {
  id: string
  alias: string
}

export interface QuickDappContractSelection {
  contracts: QuickDappContractBinding[]
  primaryContractId: string
  primary: QuickDappContractBinding
}

export type QuickDappContractConfigSource = 'multi' | 'legacy-single' | 'none'

export interface QuickDappContractConfigView {
  bindings: QuickDappContractBinding[]
  representativeBinding?: QuickDappContractBinding
  source: QuickDappContractConfigSource
}

export type QuickDappEnvironmentKind = 'remix-vm' | 'local-rpc' | 'network-rpc' | 'unknown'

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/
const JAVASCRIPT_RESERVED_WORDS = new Set([
  'arguments', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'debugger', 'default', 'delete', 'do', 'else', 'enum', 'eval', 'export',
  'extends', 'false', 'finally', 'for', 'function', 'if', 'implements', 'import',
  'in', 'instanceof', 'interface', 'let', 'new', 'null', 'package', 'private',
  'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield'
])

export const normalizeQuickDappEnvironment = (chainId: number | string): string => {
  const value = String(chainId).trim().toLowerCase()
  if (/^(?:0x[0-9a-f]+|[0-9]+)$/.test(value)) {
    try {
      return BigInt(value).toString()
    } catch {
      return value
    }
  }
  return value
}

export const isQuickDappRemixVMIdentifier = (value: number | string | null | undefined): boolean =>
  /^vm-/.test(String(value ?? '').trim().toLowerCase())

export const classifyQuickDappEnvironment = (
  providerName: string | null | undefined,
  chainId: number | string | null | undefined
): QuickDappEnvironmentKind => {
  if (isQuickDappRemixVMIdentifier(chainId)) {
    return 'remix-vm'
  }

  const normalizedProvider = String(providerName ?? '').trim().toLowerCase()
  const normalizedChainId = normalizeQuickDappEnvironment(chainId ?? '')
  if (
    normalizedProvider === 'hardhat-provider' ||
    normalizedProvider === 'ganache-provider' ||
    normalizedProvider === 'foundry-provider' ||
    normalizedChainId === '1337' ||
    normalizedChainId === '31337' ||
    normalizedChainId === '5777'
  ) {
    return 'local-rpc'
  }

  if (normalizedChainId === '0') return 'unknown'
  if (/^[0-9]+$/.test(normalizedChainId)) return 'network-rpc'
  if (isQuickDappRemixVMIdentifier(providerName)) return 'remix-vm'
  return 'unknown'
}

const getQuickDappContractId = (chainId: number | string, address: string): string =>
  `${normalizeQuickDappEnvironment(chainId)}:${address.toLowerCase()}`

const getBaseAlias = (name: string): string => {
  const alias = String(name || 'Contract')
    .trim()
    .replace(/[^a-zA-Z0-9_$]+/g, '_')
    .replace(/^([0-9])/, '_$1')

  return alias || 'Contract'
}

const getUniqueAlias = (name: string, usedAliases: Set<string>, avoidReservedWords = false): string => {
  const sanitizedAlias = getBaseAlias(name)
  const baseAlias = avoidReservedWords && JAVASCRIPT_RESERVED_WORDS.has(sanitizedAlias)
    ? `_${sanitizedAlias}`
    : sanitizedAlias
  let alias = baseAlias
  let suffix = 2

  while (usedAliases.has(alias)) {
    alias = `${baseAlias}_${suffix++}`
  }
  usedAliases.add(alias)
  return alias
}

export const createQuickDappContractSelection = (
  inputs: QuickDappContractInput[],
  requestedPrimaryContractId?: string
): QuickDappContractSelection => {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('At least one deployed contract is required')
  }
  if (inputs.length > MAX_QUICK_DAPP_CONTRACTS) {
    throw new Error(`A DApp can use at most ${MAX_QUICK_DAPP_CONTRACTS} contracts`)
  }

  const environment = normalizeQuickDappEnvironment(inputs[0].chainId)
  const seen = new Set<string>()
  const usedAliases = new Set<string>()

  const contracts = inputs.map((input) => {
    if (!ADDRESS_PATTERN.test(input.address || '')) {
      throw new Error(`Invalid contract address: ${input.address || '(empty)'}`)
    }
    if (!Array.isArray(input.abi) || input.abi.length === 0) {
      throw new Error(`ABI is required for contract ${input.name || input.address}`)
    }
    if (normalizeQuickDappEnvironment(input.chainId) !== environment) {
      throw new Error('All contracts must be deployed in the same environment')
    }

    const id = getQuickDappContractId(input.chainId, input.address)
    if (seen.has(id)) {
      throw new Error(`Duplicate contract: ${input.address}`)
    }
    seen.add(id)

    return {
      ...input,
      id,
      alias: getUniqueAlias(input.alias || input.name, usedAliases, true)
    }
  })

  const primary = requestedPrimaryContractId
    ? contracts.find((contract) => contract.id === requestedPrimaryContractId)
    : contracts[0]

  if (!primary) {
    throw new Error('The primary contract must be included in the contract selection')
  }

  return {
    contracts,
    primaryContractId: primary.id,
    primary
  }
}

/**
 * Reads both legacy single-contract configs and multi-contract configs.
 * This is intentionally tolerant so an older DApp cannot fail to load because
 * optional metadata is missing.
 */
export const getQuickDappContracts = (config: any): QuickDappContractBinding[] => {
  const rawContracts = Array.isArray(config?.contracts) && config.contracts.length > 0
    ? config.contracts
    : config?.contract
      ? [config.contract]
      : []
  const usedAliases = new Set<string>()

  return rawContracts
    .filter((contract: any) => typeof contract?.address === 'string')
    .map((contract: any) => ({
      ...contract,
      id: contract.id || getQuickDappContractId(contract.chainId ?? 'unknown', contract.address),
      alias: getUniqueAlias(contract.alias || contract.name || 'Contract', usedAliases),
      name: contract.name || 'Contract',
      abi: Array.isArray(contract.abi) ? contract.abi : [],
      chainId: contract.chainId ?? 'unknown',
      sourceFilePath: contract.sourceFilePath || (
        rawContracts.length === 1 ? config?.sourceWorkspace?.filePath : undefined
      )
    }))
}

export const readQuickDappContractConfig = (config: any): QuickDappContractConfigView => {
  const bindings = getQuickDappContracts(config)
  const source: QuickDappContractConfigSource = Array.isArray(config?.contracts) && config.contracts.length > 0
    ? 'multi'
    : config?.contract
      ? 'legacy-single'
      : 'none'

  return {
    bindings,
    representativeBinding: bindings.find((binding) => binding.id === config?.primaryContractId) || bindings[0],
    source
  }
}

export const getPrimaryQuickDappContract = (config: any): QuickDappContractBinding | undefined =>
  readQuickDappContractConfig(config).representativeBinding

const toLegacyQuickDappContract = (contract: QuickDappContractBinding) => ({
  address: contract.address,
  name: contract.name,
  abi: contract.abi,
  chainId: contract.chainId,
  networkName: contract.networkName || 'Unknown Network'
})

export const buildQuickDappContractConfigFields = (selection: QuickDappContractSelection) => ({
  contracts: selection.contracts,
  primaryContractId: selection.primaryContractId,
  contract: toLegacyQuickDappContract(selection.primary)
})
