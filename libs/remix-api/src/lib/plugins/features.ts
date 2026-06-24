/**
 * Centralized feature flag constants for the Remix Project.
 *
 * All feature strings used for permission/feature detection should be defined here.
 * Import from `@remix-api` and use the constants instead of raw strings:
 *
 * ```ts
 * import { Features } from '@remix-api'
 * features[Features.AI_AUDITOR]?.is_enabled
 * hasFeature(Features.MCP_THEGRAPH)
 * ```
 */

// ─── AI Features ────────────────────────────────────────────────────────────────

/** Gates the entire AI assistant. */
export const AI_SOLCODER = 'ai:solcoder' as const

/** AI auditor / security scanning permission. */
export const AI_AUDITOR = 'ai:auditor' as const

/** AI skills access. */
export const AI_SKILLS = 'ai:skills' as const

/** Auto-completion feature. */
export const AI_AUTO = 'ai:auto' as const

/** Inline completion capability. */
export const AI_COMPLETION = 'ai:completion' as const

/** Ollama local model integration. */
export const AI_OLLAMA = 'ai:ollama' as const

/** Contextual editor (inline AI suggestions). */
export const AI_CONTEXTUAL_EDITOR = 'ai:contextual-editor' as const

/** Verified-accounts gate (email verification required). */
export const AI_VERIFIED_ACCOUNTS = 'ai:verified_accounts' as const

/** Soft-launch gate: hides upgrade/buy-credits CTAs in favour of "coming soon" badges. */
export const AI_MODES_COMING_SOON = 'ai:modes_coming_soon' as const

/** Upgrade CTA visible — user can reach a higher plan tier. */
export const AI_UPGRADE_AVAILABLE = 'ai:upgrade_available' as const

/** Buy-credits CTA visible — user can top up their quota. */
export const AI_BUY_CREDITS = 'ai:buy_credits' as const

// ─── AI Model Features ──────────────────────────────────────────────────────────

/** Mistral Small model access. */
export const AI_MISTRAL_SMALL = 'ai:mistral-small' as const

/** Mistral Medium model access. */
export const AI_MISTRAL_MEDIUM = 'ai:mistral-medium' as const

/** Codestral model access. */
export const AI_CODESTRAL = 'ai:codestral' as const

/** Sonnet 4.6 model access. */
export const AI_SONNET_4_6 = 'ai:sonnet-4.6' as const

/** Opus 4.6 model access. */
export const AI_OPUS_4_6 = 'ai:opus-4.6' as const

// ─── AI Provider Features ───────────────────────────────────────────────────────

/** Mistral provider access. */
export const AI_PROVIDER_MISTRAL = 'ai:Mistral' as const

/** Anthropic provider access. */
export const AI_PROVIDER_ANTHROPIC = 'ai:Anthropic' as const

/** OpenAI provider access. */
export const AI_PROVIDER_OPENAI = 'ai:OpenAI' as const

// ─── MCP Features ───────────────────────────────────────────────────────────────

/** Basic external MCP integrations. */
export const MCP_BASIC_EXTERNAL = 'mcp:basicExternal' as const

/** The Graph integration. */
export const MCP_THEGRAPH = 'mcp:thegraph' as const

/** Etherscan integration. */
export const MCP_ETHERSCAN = 'mcp:etherscan' as const

/** Alchemy integration. */
export const MCP_ALCHEMY = 'mcp:alchemy' as const

/** Web search integration. */
export const MCP_WEB_SEARCH = 'mcp:web-search' as const

/** Circle integration. */
export const MCP_CIRCLE = 'mcp:circle' as const

/** OpenZeppelin integration. */
export const MCP_OPENZEPPELIN = 'mcp:openzeppelin' as const

// ─── DApp Features ──────────────────────────────────────────────────────────────

/** QuickDapp generation access. */
export const DAPP_QUICKDAPP = 'dapp:quickdapp' as const

// ─── Contract Features ──────────────────────────────────────────────────────────

/** ENS contract naming access. */
export const REGISTER_ENS = 'ens:register-contract' as const

// ─── Skills Features ────────────────────────────────────────────────────────────

/** Basic skills access. */
export const SKILLS_BASIC = 'skills:basic' as const

/** Advanced skills access. */
export const SKILLS_ADVANCED = 'skills:advanced' as const

// ─── Storage Features ───────────────────────────────────────────────────────────

/** S3 cloud storage access. */
export const STORAGE_S3 = 'storage:s3' as const

// ─── UI Features ────────────────────────────────────────────────────────────────

/** Show credits in plan manager. */
export const UI_SHOW_CREDITS = 'ui:show-credits' as const

/** Show plans in plan manager. */
export const UI_SHOW_PLANS = 'ui:show-plans' as const

/** Show quotas in plan manager. */
export const UI_SHOW_QUOTAS = 'ui:show-quotas' as const

/** Show top-ups in plan manager. */
export const UI_SHOW_TOP_UPS = 'ui:show-top-ups' as const

/** Show usage in plan manager. */
export const UI_SHOW_USAGE = 'ui:show-usage' as const

// ─── Namespace object for convenient grouped access ─────────────────────────────

export const Features = {
  // AI
  AI_SOLCODER,
  AI_AUDITOR,
  AI_SKILLS,
  AI_AUTO,
  AI_COMPLETION,
  AI_OLLAMA,
  AI_CONTEXTUAL_EDITOR,
  AI_VERIFIED_ACCOUNTS,
  AI_MODES_COMING_SOON,
  AI_UPGRADE_AVAILABLE,
  AI_BUY_CREDITS,

  // AI Models
  AI_MISTRAL_SMALL,
  AI_MISTRAL_MEDIUM,
  AI_CODESTRAL,
  AI_SONNET_4_6,
  AI_OPUS_4_6,

  // AI Providers
  AI_PROVIDER_MISTRAL,
  AI_PROVIDER_ANTHROPIC,
  AI_PROVIDER_OPENAI,

  // MCP
  MCP_BASIC_EXTERNAL,
  MCP_THEGRAPH,
  MCP_ETHERSCAN,
  MCP_ALCHEMY,
  MCP_WEB_SEARCH,
  MCP_CIRCLE,
  MCP_OPENZEPPELIN,

  // DApp
  DAPP_QUICKDAPP,

  // Contract
  REGISTER_ENS,

  // Skills
  SKILLS_BASIC,
  SKILLS_ADVANCED,

  // Storage
  STORAGE_S3,

  // UI
  UI_SHOW_CREDITS,
  UI_SHOW_PLANS,
  UI_SHOW_QUOTAS,
  UI_SHOW_TOP_UPS,
  UI_SHOW_USAGE,
} as const

/** Union type of all valid feature keys. */
export type FeatureKey = typeof Features[keyof typeof Features]

/**
 * Human-readable display labels for feature keys.
 * Used in UI copy ("Your plan doesn't include …") to avoid showing raw
 * `ai:auditor`-style strings to users.
 */
export const FEATURE_LABELS: Partial<Record<FeatureKey, string>> = {
  // AI
  [AI_SOLCODER]:            'AI Coding Assistant',
  [AI_AUDITOR]:             'AI Security Auditor',
  [AI_SKILLS]:              'AI Skills',
  [AI_AUTO]:                'AI Auto-complete',
  [AI_COMPLETION]:          'AI Inline Completion',
  [AI_OLLAMA]:              'Local AI (Ollama)',
  [AI_CONTEXTUAL_EDITOR]:  'AI Contextual Editor',
  // AI Models
  [AI_MISTRAL_SMALL]:       'Mistral Small',
  [AI_MISTRAL_MEDIUM]:      'Mistral Medium',
  [AI_CODESTRAL]:           'Codestral',
  [AI_SONNET_4_6]:          'Claude Sonnet',
  [AI_OPUS_4_6]:            'Claude Opus',
  // AI Providers
  [AI_PROVIDER_MISTRAL]:    'Mistral',
  [AI_PROVIDER_ANTHROPIC]:  'Anthropic',
  [AI_PROVIDER_OPENAI]:     'OpenAI',
  // MCP
  [MCP_BASIC_EXTERNAL]:     'External MCP Integrations',
  [MCP_THEGRAPH]:           'The Graph',
  [MCP_ETHERSCAN]:          'Etherscan',
  [MCP_ALCHEMY]:            'Alchemy',
  [MCP_WEB_SEARCH]:         'Web Search',
  [MCP_CIRCLE]:             'Circle',
  [MCP_OPENZEPPELIN]:       'OpenZeppelin',
  // DApp
  [DAPP_QUICKDAPP]:         'QuickDapp Generator',
  // Contract
  [REGISTER_ENS]:           'ENS Contract Naming',
  // Skills
  [SKILLS_BASIC]:           'Basic Skills',
  [SKILLS_ADVANCED]:        'Advanced Skills',
  // Storage
  [STORAGE_S3]:             'S3 Cloud Storage',
}
