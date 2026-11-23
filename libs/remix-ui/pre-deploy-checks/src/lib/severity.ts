import { FindingSource, Severity } from './types'

export const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 }

export const SEVERITIES: Severity[] = ['high', 'medium', 'low', 'info']

export function maxSeverity (a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b
}

/**
 * Remix analyzer modules, keyed by the module's display name (`name` on the module instance,
 * which is what the analyzer puts in its report). Category ids from
 * libs/remix-analyzer/src/solidity-analyzer/modules/categories.ts
 */
export const REMIX_MODULES: Record<string, { key: string, category: 'SEC' | 'GAS' | 'MISC' | 'ERC' }> = {
  'Transaction origin: ': { key: 'txOrigin', category: 'SEC' },
  'Gas costs: ': { key: 'gasCosts', category: 'GAS' },
  'This on local calls: ': { key: 'thisLocal', category: 'GAS' },
  'Check-effects-interaction: ': { key: 'checksEffectsInteraction', category: 'SEC' },
  'Constant/View/Pure functions: ': { key: 'constantFunctions', category: 'MISC' },
  'Similar variable names: ': { key: 'similarVariableNames', category: 'MISC' },
  'Inline assembly: ': { key: 'inlineAssembly', category: 'SEC' },
  'Block timestamp: ': { key: 'blockTimestamp', category: 'SEC' },
  'Low level calls: ': { key: 'lowLevelCalls', category: 'SEC' },
  'Block hash: ': { key: 'blockBlockhash', category: 'SEC' },
  'No return: ': { key: 'noReturn', category: 'MISC' },
  'Selfdestruct: ': { key: 'selfdestruct', category: 'SEC' },
  'Guard conditions: ': { key: 'guardConditions', category: 'MISC' },
  'Delete dynamic array: ': { key: 'deleteDynamicArrays', category: 'GAS' },
  'Result not used: ': { key: 'assignAndCompare', category: 'MISC' },
  'ERC20: ': { key: 'erc20Decimals', category: 'ERC' },
  'String length: ': { key: 'stringBytesLength', category: 'MISC' },
  'Delete from dynamic array: ': { key: 'deleteFromDynamicArray', category: 'MISC' },
  'For loop over dynamic array: ': { key: 'forLoopIteratesOverDynamicArray', category: 'GAS' },
  'Ether transfer in loop: ': { key: 'etherTransferInLoop', category: 'GAS' },
  'Data truncated: ': { key: 'intDivisionTruncate', category: 'MISC' }
}

const REMIX_HIGH = ['txOrigin', 'checksEffectsInteraction', 'selfdestruct']

export function remixModuleKey (moduleName: string): string {
  return REMIX_MODULES[moduleName]?.key ?? moduleName.replace(/:\s*$/, '').trim()
}

export function remixSeverity (moduleName: string): Severity {
  const module = REMIX_MODULES[moduleName]
  if (!module) return 'low'
  if (module.category === 'SEC') return REMIX_HIGH.includes(module.key) ? 'high' : 'medium'
  return 'low'
}

/** Slither `severity` is the detector's impact. */
export function slitherSeverity (impact: string): Severity {
  switch ((impact || '').toLowerCase()) {
  case 'high': return 'high'
  case 'medium': return 'medium'
  case 'low': return 'low'
  default: return 'info' // Informational, Optimization
  }
}

export function slitherNativeSeverity (impact: string, confidence: string): string {
  return confidence ? `${impact} · ${confidence} confidence` : impact
}

/** Solhint hint `type` is 'error' or 'warning'. */
export function solhintSeverity (type: string): Severity {
  return type === 'error' ? 'medium' : 'low'
}

/** AI review: Answer "Yes" means the code has major vulnerabilities. */
export function aiIsVulnerable (answer: string): boolean {
  return /^\s*yes\b/i.test(answer || '')
}

/**
 * Equivalent rules across tools, used to merge duplicates. Each entry is a canonical key and,
 * per tool, a matcher on that tool's rule id.
 */
const EQUIVALENT_RULES: { key: string, remix?: string, slither?: (rule: string) => boolean, solhint?: string }[] = [
  { key: 'tx-origin', remix: 'txOrigin', slither: (r) => r === 'tx-origin', solhint: 'avoid-tx-origin' },
  { key: 'selfdestruct', remix: 'selfdestruct', slither: (r) => r === 'suicidal' },
  { key: 'reentrancy', remix: 'checksEffectsInteraction', slither: (r) => r.startsWith('reentrancy-') },
  { key: 'low-level-calls', remix: 'lowLevelCalls', slither: (r) => r === 'low-level-calls', solhint: 'avoid-low-level-calls' },
  { key: 'timestamp', remix: 'blockTimestamp', slither: (r) => r === 'timestamp', solhint: 'not-rely-on-time' },
  { key: 'assembly', remix: 'inlineAssembly', slither: (r) => r === 'assembly', solhint: 'no-inline-assembly' }
]

export function canonicalRule (source: FindingSource, rule?: string): string | undefined {
  if (!rule) return undefined
  for (const entry of EQUIVALENT_RULES) {
    if (source === 'remix' && entry.remix === rule) return entry.key
    if (source === 'slither' && entry.slither && entry.slither(rule)) return entry.key
    if (source === 'solhint' && entry.solhint === rule) return entry.key
  }
  return undefined
}
