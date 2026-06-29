'use strict'

/**
 * Import Patterns & Constants
 *
 * Centralized definitions for path prefixes, URL schemes, and regex patterns
 * used throughout the import resolver. This eliminates magic strings and
 * provides a single source of truth for pattern matching.
 */

// =============================================================================
// PATH PREFIXES
// =============================================================================

/** Base directory for all resolved dependencies */
export const DEPS_DIR = '.deps/'

/** Directory for npm packages */
export const DEPS_NPM_DIR = '.deps/npm/'

/** Directory for GitHub imports */
export const DEPS_GITHUB_DIR = '.deps/github/'

/** Directory for HTTP imports */
export const DEPS_HTTP_DIR = '.deps/http/'

/** Prefix for npm alias resolution results */
export const ALIAS_PREFIX = 'alias:'

/** Prefix for npm: protocol imports */
export const NPM_PROTOCOL = 'npm:'

// =============================================================================
// URL SCHEMES
// =============================================================================

/** HTTP scheme prefix */
export const HTTP_SCHEME = 'http://'

/** HTTPS scheme prefix */
export const HTTPS_SCHEME = 'https://'

/** IPFS scheme prefix */
export const IPFS_SCHEME = 'ipfs://'

/** Swarm scheme prefix */
export const SWARM_SCHEME = 'bzz://'

/** Swarm raw scheme prefix */
export const SWARM_RAW_SCHEME = 'bzz-raw://'

/** GitHub normalized path prefix */
export const GITHUB_PREFIX = 'github/'

/** IPFS normalized path prefix */
export const IPFS_PREFIX = 'ipfs/'

/** Swarm normalized path prefix */
export const SWARM_PREFIX = 'swarm/'

// =============================================================================
// PATH DETECTION FUNCTIONS
// =============================================================================

/** Check if a path is an HTTP(S) URL */
export function isHttpUrl(url: string): boolean {
  return url.startsWith(HTTP_SCHEME) || url.startsWith(HTTPS_SCHEME)
}

/** Check if a path starts with the deps directory */
export function isDepsPath(path: string): boolean {
  return path.startsWith(DEPS_DIR)
}

/** Check if a path is in the npm deps directory */
export function isNpmDepsPath(path: string): boolean {
  return path.startsWith(DEPS_NPM_DIR)
}

/** Check if a path is in the GitHub deps directory */
export function isGithubDepsPath(path: string): boolean {
  return path.startsWith(DEPS_GITHUB_DIR)
}

/** Check if a path is in the HTTP deps directory */
export function isHttpDepsPath(path: string): boolean {
  return path.startsWith(DEPS_HTTP_DIR)
}

/** Check if a path is a relative import (./ or ../) */
export function isRelativeImport(path: string): boolean {
  return path.startsWith('./') || path.startsWith('../')
}

/** Check if a path uses IPFS scheme */
export function isIpfsUrl(url: string): boolean {
  return url.startsWith(IPFS_SCHEME)
}

/** Check if a path uses Swarm scheme */
export function isSwarmUrl(url: string): boolean {
  return url.startsWith(SWARM_SCHEME) || url.startsWith(SWARM_RAW_SCHEME)
}

/** Check if a path uses npm: protocol */
export function isNpmProtocol(path: string): boolean {
  return path.startsWith(NPM_PROTOCOL)
}

/** Check if a path is a scoped package (@scope/name) */
export function isScopedPackage(path: string): boolean {
  return path.startsWith('@')
}

/** Check if a path is a normalized external path (github/, ipfs/, swarm/) */
export function isNormalizedExternalPath(path: string): boolean {
  return path.startsWith(GITHUB_PREFIX) ||
         path.startsWith(IPFS_PREFIX) ||
         path.startsWith(SWARM_PREFIX)
}

// =============================================================================
// REGEX PATTERNS
// =============================================================================

/**
 * Regex patterns for parsing import paths.
 * Named patterns provide clarity and enable reuse.
 */
export const ImportPatterns = {
  /**
   * Match a scoped npm package name: @scope/name
   * Groups: [1] = full scoped name (e.g., "@openzeppelin/contracts")
   */
  SCOPED_PACKAGE: /^(@[^/]+\/[^/@]+)/,

  /**
   * Match a regular (non-scoped) package name
   * Groups: [1] = package name (e.g., "lodash")
   */
  REGULAR_PACKAGE: /^([^/@]+)/,

  /**
   * Match a version string in a versioned import: @1.2.3 or @1.2 or @1
   * Groups: [1] = version string (e.g., "1.2.3", "5.4.0-beta.1")
   */
  VERSION_SUFFIX: /@(\d+(?:\.\d+)?(?:\.\d+)?[^\s/]*)/,

  /**
   * Match a versioned package: @scope/name@version or name@version
   * Groups: [1] = package name, [2] = version
   */
  VERSIONED_PACKAGE: /^(@?[^@]+)@(.+)$/,

  /**
   * Match a versioned path with full semver: @scope/name@X.Y.Z/path
   * Used to detect already-resolved versioned imports
   */
  VERSIONED_PATH_SEMVER: /@[^@]+@\d+\.\d+\.\d+\//,

  /**
   * Match a versioned scoped package path with capture groups
   * Groups: [1] = package base (@scope/name), [2] = version, [3] = path
   * Example: @openzeppelin/contracts@5.4.0/token/ERC20.sol
   */
  VERSIONED_SCOPED_PATH: /^(@[^@/]+\/[^@/]+)@(\d+\.\d+\.\d+)\/(.+)$/,

  /**
   * Match npm package pattern (scoped or regular with optional version)
   * Groups: [1] = package name with optional scope
   */
  NPM_PACKAGE: /^@?[a-zA-Z0-9-~][a-zA-Z0-9._-]*[@/]/,

  /**
   * Match exact semver version: X.Y.Z
   */
  EXACT_SEMVER: /^\d+\.\d+\.\d+$/,

  /**
   * Match semver with caret range: ^X.Y.Z
   * Groups: [1] = major, [2] = minor, [3] = patch
   */
  CARET_RANGE: /^\^(\d+)\.(\d+)\.(\d+)/,

  /**
   * Match semver with tilde range: ~X.Y.Z
   * Groups: [1] = major, [2] = minor, [3] = patch
   */
  TILDE_RANGE: /^~(\d+)\.(\d+)\.(\d+)/,

  /**
   * Match semver with >= range: >=X.Y.Z
   * Groups: [1] = major, [2] = minor, [3] = patch
   */
  GTE_RANGE: /^>=(\d+)\.(\d+)\.(\d+)/,

  /**
   * Match resolved semver: X.Y.Z at start
   * Groups: [1] = major, [2] = minor, [3] = patch
   */
  RESOLVED_SEMVER: /^(\d+)\.(\d+)\.(\d+)/,

  /**
   * Match major version only
   * Groups: [1] = major version
   */
  MAJOR_VERSION: /^(\d+)/,

  /**
   * Match any first digit sequence (for version extraction)
   * Groups: [1] = version number
   */
  FIRST_DIGIT: /(\d+)/,

  /**
   * Match trailing version from versioned package name: @X.Y.Z at end
   * Groups: [1] = version
   */
  TRAILING_VERSION: /@([^@]+)$/,

  /**
   * Match SPDX license identifier in Solidity
   * Groups: [1] = license identifier
   */
  SPDX_LICENSE: /^\s*\/\/\s*SPDX-License-Identifier:\s*(.+)$/,

  /**
   * Match pragma solidity statement
   */
  PRAGMA_SOLIDITY: /^\s*pragma\s+solidity\s+[^;]+;/,

  /**
   * Match Solidity import statement
   * Groups capture varies by import style
   */
  SOLIDITY_IMPORT: /import\s+(?:(?:{[^}]*}\s+from\s+)?["']([^"']+)["']|["']([^"']+)["']\s+as\s+\w+|["']([^"']+)["'])/g,

  /**
   * Match URL protocol prefix (any scheme)
   * Used to strip protocol from URLs
   */
  URL_PROTOCOL: /^[a-zA-Z]+:\/\//,

  /**
   * Match non-safe URL characters (for path sanitization)
   */
  UNSAFE_PATH_CHARS: /[^-a-zA-Z0-9._/]/g,

  /**
   * Match hardhat imports: hardhat/...
   */
  HARDHAT_IMPORT: /^hardhat\//,

  /**
   * Match IPFS URL: ipfs://[ipfs/]<hash>[/path]
   * Groups: [1] = hash, [2] = optional path
   */
  IPFS_URL: /^ipfs:\/\/(?:ipfs\/)?([^/]+)(?:\/(.*))?$/,

  /**
   * Match remix test libraries: remix_tests.sol or remix_accounts.sol
   */
  REMIX_TEST_LIBS: /^remix_(tests|accounts)\.sol$/,

  /**
   * Match alias resolution format: alias:original→target
   * Groups: [1] = target after arrow
   */
  ALIAS_RESOLUTION: /^alias:[^→]+→(.+)$/,

  /**
   * Match semver range prefixes to strip: ^, ~, >=, >, <, <=
   */
  SEMVER_RANGE_PREFIX: /^[\^~>=<]+/,

  /**
   * Match yarn.lock package entry line
   * Groups: [1] = package name
   */
  YARN_LOCK_PACKAGE: /^"?(@?[^"@]+(?:\/[^"@]+)?)@[^"]*"?:/,

  /**
   * Match yarn.lock version line
   * Groups: [1] = version
   */
  YARN_LOCK_VERSION: /^\s+version\s+"([^"]+)"/,

  /**
   * Match node_modules prefix in package-lock paths
   */
  NODE_MODULES_PREFIX: /^node_modules\//,

  /**
   * Match GitHub raw URL for package.json fetching
   * Pattern: https://raw.githubusercontent.com/owner/repo/ref/...
   */
  GITHUB_RAW_URL: /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//
} as const

// =============================================================================
// PATH MANIPULATION UTILITIES
// =============================================================================

/**
 * Strip the .deps/npm/ prefix from a path
 */
export function stripNpmDepsPrefix(path: string): string {
  if (path.startsWith(DEPS_NPM_DIR + '/')) {
    return path.substring(DEPS_NPM_DIR.length + 1)
  }
  return path
}

/**
 * Strip the .deps/github/ prefix from a path
 */
export function stripGithubDepsPrefix(path: string): string {
  if (path.startsWith(DEPS_GITHUB_DIR + '/')) {
    return path.substring(DEPS_GITHUB_DIR.length + 1)
  }
  return path
}

/**
 * Strip the .deps/ prefix from a path (any subdirectory)
 */
export function stripDepsPrefix(path: string): string {
  if (path.startsWith(DEPS_DIR + '/')) {
    return path.substring(DEPS_DIR.length + 1)
  }
  return path
}

/**
 * Add .deps/npm/ prefix to a path if not already present
 */
export function ensureNpmDepsPrefix(path: string): string {
  if (path.startsWith(DEPS_NPM_DIR)) {
    return path
  }
  return `${DEPS_NPM_DIR}${path}`
}

/**
 * Sanitize a URL for use as a filesystem path
 * Strips protocol and replaces unsafe characters
 */
export function sanitizeUrlToPath(url: string): string {
  return url
    .replace(ImportPatterns.URL_PROTOCOL, '')
    .replace(ImportPatterns.UNSAFE_PATH_CHARS, '_')
}

/**
 * Strip semver range prefix (^, ~, >=, etc.) from a version
 */
export function stripSemverPrefix(version: string): string {
  return version.replace(ImportPatterns.SEMVER_RANGE_PREFIX, '')
}
