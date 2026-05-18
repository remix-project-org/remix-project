
/** Maximum tokens for DApp generation */
export const DAPP_MAX_TOKENS = 65536

/** Inactivity timeout in milliseconds before warning user */
export const INACTIVITY_TIMEOUT_MS = 10000

/** Default request timeout in milliseconds (5 minutes) */
export const DEFAULT_TIMEOUT_MS = 300000

/** Maximum tool executions per request */
export const MAX_TOOL_EXECUTIONS = 10


/** Default model provider */
export const DEFAULT_MODEL_PROVIDER = 'mistralai' as const

/** Default model ID */
export const DEFAULT_MODEL_ID = 'mistral-medium-latest'

/** Supported model providers */
export const SUPPORTED_PROVIDERS = ['anthropic', 'mistralai', 'ollama'] as const

/** Prefix for session thread IDs */
export const SESSION_THREAD_PREFIX = 'remix-session-'

/** Prefix for conversation thread IDs */
export const CONVERSATION_THREAD_PREFIX = 'remix-conv-'

/** Word count threshold for considering a prompt complex */
export const COMPLEXITY_WORD_COUNT_THRESHOLD = 100

/** Keywords indicating security-related prompts */
export const SECURITY_KEYWORDS = [
  'security', 'audit', 'vulnerability', 'exploit', 'attack', 'malicious',
  'reentrancy', 'overflow', 'underflow', 'access control', 'authorization',
  'authentication', 'privilege', 'permission', 'dos', 'denial of service'
] as const

/** Keywords indicating complex prompts */
export const COMPLEXITY_INDICATORS = [
  'audit', 'security', 'vulnerability', 'exploit', 'attack', 'malicious',
  'comprehensive', 'detailed', 'analyze', 'review', 'optimize',
  'refactor', 'architecture', 'design pattern', 'best practice',
  'multi-step', 'complex', 'advanced', 'sophisticated'
] as const

/** Available memory backend types */
export const MEMORY_BACKEND_TYPES = ['state', 'store'] as const

/** Default memory backend */
export const DEFAULT_MEMORY_BACKEND = 'store' as const

/** IndexedDB database name for DeepAgent memory */
export const DEEPAGENT_MEMORY_DB_NAME = 'remix-deepagent-memory'

/** Safe tools that don't require approval */
export const SAFE_TOOL_CATEGORIES = ['read', 'list', 'get', 'info'] as const

/** Risky tools that require approval */
export const RISKY_TOOL_CATEGORIES = ['write', 'create', 'delete', 'deploy', 'execute'] as const

/** Maximum findings per file for security auditor */
export const MAX_SECURITY_FINDINGS_PER_FILE = 10

/** Maximum optimizations per file for gas optimizer */
export const MAX_GAS_OPTIMIZATIONS_PER_FILE = 8

/** Maximum improvements per file for code reviewer */
export const MAX_CODE_IMPROVEMENTS_PER_FILE = 8

/** Minimum confidence threshold for findings */
export const MIN_CONFIDENCE_THRESHOLD = 60


export const LOCAL_STORAGE_KEYS = {
  DEEPAGENT_ENABLED: 'deepagent_enabled',
  DEEPAGENT_AUTO_MODE: 'deepagent_auto_mode',
  DEEPAGENT_MEMORY_BACKEND: 'deepagent_memory_backend',
  REMIX_ACCESS_TOKEN: 'remix_access_token'
} as const

export type SupportedProvider = typeof SUPPORTED_PROVIDERS[number]
export type MemoryBackendType = typeof MEMORY_BACKEND_TYPES[number]
