/**
 * Types for the cross-domain migration archive.
 *
 * The archive is a ZIP with this layout:
 *
 *   manifest.json            <- MigrationManifest, always first entry
 *   files/<fs path>          <- raw bytes of every file, path relative to FS root
 *   readme.txt               <- human readable note
 *
 * File contents are stored as raw bytes with no text decoding at any point,
 * so git pack files, images and wasm survive the round trip intact.
 */

export const MANIFEST_ENTRY = 'manifest.json'
export const SETTINGS_ENTRY = 'settings.json'
export const FILES_PREFIX = 'files/'
export const ARCHIVE_FORMAT_VERSION = 1

export interface MigrationEntry {
  /** Absolute path in the Remix filesystem, e.g. `/.workspaces/default/contracts/a.sol` */
  path: string
  size: number
  /** Lowercase hex SHA-256 of the raw file bytes. */
  sha256: string
}

export interface MigrationManifest {
  formatVersion: number
  createdAt: string
  /** Origin the archive was exported from, for display only. */
  sourceOrigin: string
  totalFiles: number
  totalBytes: number
  entries: MigrationEntry[]
  /**
   * Allow-listed localStorage settings. Never contains credentials.
   * Written to `settings.json`; kept here only to read older archives.
   */
  config?: Record<string, string>
  /** How many settings the archive carries, without extracting them. */
  settingsCount?: number
  /** Top level workspace names found under `.workspaces/`. */
  workspaces: string[]
  /** Cloud workspaces left out of the archive; they resync from S3. */
  cloudWorkspaces?: string[]
}

export type MigrationPhase =
  | 'idle'
  | 'scanning'
  | 'packing'
  | 'writing'
  | 'reading'
  | 'importing'
  | 'done'
  | 'error'

export interface MigrationProgress {
  phase: MigrationPhase
  /** 0..1, or null when the total is not yet known. */
  fraction: number | null
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
  currentPath?: string
  message?: string
}

export interface MigrationIssue {
  path: string
  reason: string
}

export interface ImportResult {
  imported: number
  skipped: number
  issues: MigrationIssue[]
  /** Original workspace name -> name actually used locally. */
  renamedWorkspaces: Record<string, string>
  configApplied: number
  /** Settings present in the archive but left alone because a local value exists. */
  configSkipped: number
}

export type ProgressCallback = (progress: MigrationProgress) => void

/** Minimal surface of `window.remixFileSystem` that migration needs. */
export interface MigrationFs {
  exists(path: string): Promise<boolean>
  readdir(path: string): Promise<string[]>
  stat(path: string): Promise<{ isDirectory(): boolean; size: number }>
  readFile(path: string, options?: any): Promise<Uint8Array | string>
  writeFile(path: string, content: any, options?: any): Promise<void>
  mkdir(path: string): Promise<void>
}
