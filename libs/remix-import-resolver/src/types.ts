'use strict'

/**
 * Type-safe path types for the import resolver.
 *
 * Uses branded types (nominal typing) to distinguish between different path contexts
 * at compile time, preventing accidental mixing of path types.
 */

// =============================================================================
// BRANDED PATH TYPES
// =============================================================================

/**
 * Brand symbol for creating nominal types from structural types.
 * This pattern prevents accidental mixing of semantically different string types.
 */
declare const __brand: unique symbol
type Brand<T, B> = T & { readonly [__brand]: B }

/**
 * An import path as written in a Solidity import statement.
 * Examples:
 * - "@openzeppelin/contracts/token/ERC20/ERC20.sol"
 * - "./utils/Math.sol"
 * - "https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol"
 */
export type ImportPath = Brand<string, 'ImportPath'>

/**
 * A local filesystem path relative to the workspace root.
 * Examples:
 * - ".deps/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol"
 * - "contracts/MyToken.sol"
 */
export type LocalPath = Brand<string, 'LocalPath'>

/**
 * A resolved/normalized path after version resolution and package mapping.
 * Examples:
 * - "@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol"
 * - "github/OpenZeppelin/openzeppelin-contracts/v5.0.2/contracts/token/ERC20/ERC20.sol"
 */
export type ResolvedPath = Brand<string, 'ResolvedPath'>

/**
 * A versioned package identifier (e.g., "@openzeppelin/contracts@5.0.2")
 */
export type VersionedPackage = Brand<string, 'VersionedPackage'>

/**
 * A package name without version (e.g., "@openzeppelin/contracts")
 */
export type PackageName = Brand<string, 'PackageName'>

/**
 * A semantic version string (e.g., "5.0.2", "^4.9.0")
 */
export type SemVerString = Brand<string, 'SemVerString'>

// =============================================================================
// PATH TYPE CONSTRUCTORS & GUARDS
// =============================================================================

/**
 * Create an ImportPath from an untyped string.
 * Use at system boundaries where paths enter the resolver.
 */
export function asImportPath(path: string): ImportPath {
  return path as ImportPath
}

/**
 * Create a LocalPath from an untyped string.
 */
export function asLocalPath(path: string): LocalPath {
  return path as LocalPath
}

/**
 * Create a ResolvedPath from an untyped string.
 */
export function asResolvedPath(path: string): ResolvedPath {
  return path as ResolvedPath
}

/**
 * Create a VersionedPackage from an untyped string.
 */
export function asVersionedPackage(pkg: string): VersionedPackage {
  return pkg as VersionedPackage
}

/**
 * Create a PackageName from an untyped string.
 */
export function asPackageName(name: string): PackageName {
  return name as PackageName
}

/**
 * Create a SemVerString from an untyped string.
 */
export function asSemVer(version: string): SemVerString {
  return version as SemVerString
}

/**
 * Extract the raw string value from any branded path type.
 * Use when interfacing with external APIs that expect plain strings.
 */
export function toRawPath<T extends string>(path: T): string {
  return path as string
}

// =============================================================================
// PACKAGE.JSON TYPES
// =============================================================================

/**
 * Strongly-typed npm package.json structure.
 * Replaces `any` type usage throughout the resolver.
 */
export interface PackageJson {
  readonly name: string
  readonly version: string
  readonly description?: string
  readonly main?: string
  readonly types?: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
  readonly resolutions?: Readonly<Record<string, string>>
  readonly overrides?: Readonly<Record<string, string>>
  /** Additional fields not explicitly typed */
  readonly [key: string]: unknown
}

/**
 * Partial package.json for when only some fields are needed.
 */
export type PartialPackageJson = Partial<PackageJson>

// =============================================================================
// RESOLUTION RESULT TYPES
// =============================================================================

/**
 * Result of resolving a file's content.
 * Uses readonly to prevent accidental mutation.
 */
export interface FileResolutionResult {
  /** The file content */
  readonly content: string
  /** Where we actually read from (might be localhost/...) */
  readonly actualPath: LocalPath
  /** The canonical versioned path */
  readonly resolvedPath: ResolvedPath
}

/**
 * Result from the version resolver.
 */
export interface VersionResolutionResult {
  /** The resolved version, or null if not found */
  readonly version: SemVerString | null
  /** Source of the resolution (workspace-resolution, lock-file, npm, etc.) */
  readonly source: string
}

/**
 * A mapping from original import to resolved path.
 */
export interface ResolutionMapping {
  readonly original: ImportPath
  readonly resolved: ResolvedPath
  readonly local: LocalPath
}

// =============================================================================
// LOGGER TYPE
// =============================================================================

/**
 * Type-safe logging function signature.
 * Replaces `(...args: any[]) => void` pattern.
 */
export type LogFunction = (message: string, ...args: unknown[]) => void

// =============================================================================
// PLUGIN TYPE GUARD
// =============================================================================

/**
 * Minimal interface for Remix Plugin detection.
 * Used for duck-typing to distinguish Plugin from IOAdapter.
 */
export interface PluginLike {
  call: (plugin: string, method: string, ...args: unknown[]) => Promise<unknown>
}

/**
 * Type guard to check if an object is a Plugin (has the `call` method).
 * This is used to distinguish between Plugin and IOAdapter in overloaded constructors.
 */
export function isPlugin(obj: unknown): obj is PluginLike {
  return obj !== null &&
         typeof obj === 'object' &&
         'call' in obj &&
         typeof (obj as PluginLike).call === 'function'
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Make all properties in T deeply readonly.
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

/**
 * Extract keys of T that have string values.
 */
export type StringKeys<T> = {
  [K in keyof T]: T[K] extends string ? K : never
}[keyof T]

/**
 * A record with string keys and string values (common pattern).
 */
export type StringRecord = Readonly<Record<string, string>>
