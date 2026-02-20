/**
 * Workspace ID Generator
 * Generates memorable, unique identifiers for workspaces
 * Similar to GitHub Codespaces naming (e.g., "fluffy-potato-x7k2")
 */

// Adjectives - positive, memorable words
const adjectives = [
  'agile', 'azure', 'bold', 'bright', 'calm', 'clever', 'cosmic', 'crystal',
  'daring', 'deep', 'eager', 'elegant', 'epic', 'fair', 'fancy', 'fast',
  'fierce', 'fluffy', 'gentle', 'gleaming', 'golden', 'graceful', 'happy',
  'humble', 'ideal', 'jade', 'jolly', 'keen', 'kind', 'lively', 'lucky',
  'magic', 'mellow', 'mighty', 'misty', 'noble', 'odd', 'optimal', 'peaceful',
  'polite', 'proud', 'pure', 'quick', 'quiet', 'rapid', 'rare', 'refined',
  'regal', 'robust', 'royal', 'rustic', 'sage', 'serene', 'sharp', 'shiny',
  'silent', 'silver', 'sleek', 'smart', 'smooth', 'snappy', 'solar', 'solid',
  'sonic', 'steady', 'stellar', 'still', 'strong', 'subtle', 'super', 'swift',
  'tender', 'tidy', 'tiny', 'tranquil', 'ultra', 'unique', 'urban', 'vast',
  'vivid', 'warm', 'wild', 'wise', 'witty', 'young', 'zappy', 'zen', 'zesty'
]

// Nouns - things, animals, nature elements
const nouns = [
  'acorn', 'anchor', 'arrow', 'atom', 'aurora', 'beacon', 'bird', 'bloom',
  'bolt', 'branch', 'breeze', 'bridge', 'brook', 'canyon', 'cedar', 'cloud',
  'comet', 'coral', 'cosmos', 'creek', 'crystal', 'dawn', 'delta', 'dew',
  'dolphin', 'dove', 'dream', 'dune', 'eagle', 'ember', 'falcon', 'fern',
  'field', 'flame', 'flare', 'flash', 'flower', 'forest', 'fountain', 'frost',
  'galaxy', 'garden', 'glade', 'glacier', 'grove', 'harbor', 'hawk', 'hill',
  'horizon', 'island', 'jade', 'jasper', 'lake', 'leaf', 'light', 'lotus',
  'maple', 'meadow', 'meteor', 'mist', 'moon', 'mountain', 'nebula', 'nova',
  'oak', 'ocean', 'orbit', 'otter', 'owl', 'panda', 'path', 'peak', 'pearl',
  'pebble', 'phoenix', 'pine', 'planet', 'pond', 'prism', 'pulse', 'quartz',
  'rain', 'rainbow', 'raven', 'reef', 'ridge', 'ripple', 'river', 'rock',
  'sage', 'sea', 'shadow', 'shore', 'sky', 'snow', 'spark', 'spring', 'star',
  'stone', 'storm', 'stream', 'summit', 'sun', 'thunder', 'tide', 'trail',
  'tree', 'valley', 'wave', 'willow', 'wind', 'wolf', 'wood', 'zen'
]

/**
 * Generate a random alphanumeric suffix
 */
function generateSuffix(length: number = 4): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789' // removed confusing chars: l,o,0,1
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Pick a random element from an array
 */
function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Generate a memorable workspace ID
 * Format: adjective-noun-suffix (e.g., "fluffy-ocean-x7k2")
 */
export function generateWorkspaceId(): string {
  const adjective = randomPick(adjectives)
  const noun = randomPick(nouns)
  const suffix = generateSuffix(4)

  return `${adjective}-${noun}-${suffix}`
}

/**
 * Validate a workspace ID format
 */
export function isValidWorkspaceId(id: string): boolean {
  // Format: word-word-xxxx
  const pattern = /^[a-z]+-[a-z]+-[a-z0-9]{4}$/
  return pattern.test(id)
}

/**
 * Remote workspace configuration stored in remix.config.json
 */
export interface RemoteWorkspaceConfig {
  /** Unique identifier for remote sync (e.g., "fluffy-ocean-x7k2") */
  remoteId: string
  /** User ID who linked this workspace (from auth plugin user.sub) */
  userId?: string
  /** When the remote ID was created */
  createdAt: string
  /** Last sync timestamp */
  lastSyncAt?: string
  /** Last save to cloud timestamp */
  lastSaveAt?: string
  /** Last backup timestamp */
  lastBackupAt?: string
}

/**
 * Full remix.config.json structure
 */
export interface RemixConfig {
  'script-runner'?: unknown
  'remote-workspace'?: RemoteWorkspaceConfig
  [key: string]: unknown
}
