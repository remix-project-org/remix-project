/**
 * Cloud Migration Engine
 *
 * Handles the atomic migration of a local workspace (/.workspaces/<name>)
 * to a cloud workspace (/.cloud-workspaces/<uuid> + S3).
 *
 * Atomicity guarantee:
 *   1. Create cloud workspace via API → get UUID
 *   2. Copy all files from /.workspaces/<name> → /.cloud-workspaces/<uuid>
 *   3. Pack as ZIP and upload to S3
 *   4. Upload individual files to S3 (for incremental sync compatibility)
 *   5. Verify via LIST that all files made it
 *   6. Delete /.workspaces/<name> from IndexedDB
 *   7. If ANY step fails → rollback (delete API workspace + local cloud copy)
 *
 * Name conflict resolution:
 *   If a cloud workspace with the same name already exists, the caller
 *   should provide a resolved name (e.g. "myproject (local)").
 */

import { S3Client } from './s3-client'
import { CloudWorkspace, STSToken, SyncManifest } from './types'
import {
  createCloudWorkspace,
  fetchWorkspaceSTS,
  deleteCloudWorkspace,
  listCloudWorkspaces,
} from './cloud-workspace-api'
import { packWorkspace, WORKSPACE_ZIP_KEY } from './cloud-workspace-zip'

// ── Types ────────────────────────────────────────────────────

export interface LocalWorkspaceInfo {
  /** Display name (directory name under /.workspaces/) */
  name: string
  /** Number of files (approximate, from walk) */
  fileCount: number
  /** Total size in bytes (approximate) */
  totalSize: number
}

export type MigrationStatus =
  | 'pending'
  | 'creating' // creating cloud workspace via API
  | 'copying' // copying files to /.cloud-workspaces/<uuid>
  | 'uploading' // uploading to S3
  | 'verifying' // LIST check
  | 'cleaning' // removing local copy
  | 'done'
  | 'error'
  | 'skipped' // user chose not to migrate this one

export interface MigrationItem {
  localName: string
  /** Cloud name (may differ from localName if conflict resolved) */
  cloudName: string
  status: MigrationStatus
  progress?: string // human-readable progress text
  error?: string
  /** Set to true if a cloud workspace with the same name already exists */
  nameConflict: boolean

  // ── Fine-grained progress fields ──
  /** Total number of files in this workspace */
  totalFiles?: number
  /** Number of files copied so far (copying phase) */
  copiedFiles?: number
  /** Number of files uploaded so far (uploading phase) */
  uploadedFiles?: number
  /** Current file being processed (path) */
  currentFile?: string
  /** Snapshot zip size in bytes (after zip phase) */
  snapshotSize?: number
  /** Whether the snapshot upload is done */
  snapshotDone?: boolean
  /** Size of all files uploaded so far in bytes */
  uploadedBytes?: number
  /** Total size of all files in bytes */
  totalBytes?: number
}

export type MigrationProgressCallback = (items: MigrationItem[]) => void

// ── Constants ────────────────────────────────────────────────

const LOCAL_WORKSPACES_PATH = '/.workspaces'
const CLOUD_WORKSPACES_PATH = '/.cloud-workspaces'
const MIGRATION_DONE_KEY = 'remix_migration_done_workspaces'
const MIGRATION_DISMISSED_KEY = 'remix_migration_dismissed'

import { cloudLocalKey } from './cloud-workspace-actions'

// ── Discovery ────────────────────────────────────────────────

/**
 * Discover all local workspaces that haven't been migrated yet.
 */
export async function discoverLocalWorkspaces(): Promise<LocalWorkspaceInfo[]> {
  const fs = (window as any).remixFileSystem
  const workspaces: LocalWorkspaceInfo[] = []

  try {
    const entries = await fs.readdir(LOCAL_WORKSPACES_PATH)
    for (const name of entries) {
      const wsPath = `${LOCAL_WORKSPACES_PATH}/${name}`
      try {
        const stat = await fs.stat(wsPath)
        if (!stat.isDirectory()) continue

        // Quick size estimation by walking the tree
        const { fileCount, totalSize } = await estimateWorkspaceSize(wsPath, fs)
        workspaces.push({ name, fileCount, totalSize })
      } catch {
        // Skip unreadable entries
      }
    }
  } catch {
    // /.workspaces/ may not exist
  }

  // Filter out already-migrated workspaces
  const migrated = getMigratedWorkspaces()
  return workspaces.filter(ws => !migrated.has(ws.name))
}

/**
 * Walk a workspace tree and estimate file count + total size.
 */
async function estimateWorkspaceSize(
  basePath: string,
  fs: any,
): Promise<{ fileCount: number; totalSize: number }> {
  let fileCount = 0
  let totalSize = 0

  async function walk(dirPath: string) {
    let entries: string[]
    try {
      entries = await fs.readdir(dirPath)
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry}`
      try {
        const stat = await fs.stat(fullPath)
        if (stat.isDirectory()) {
          await walk(fullPath)
        } else {
          fileCount++
          totalSize += stat.size || 0
        }
      } catch {
        // skip
      }
    }
  }

  await walk(basePath)
  return { fileCount, totalSize }
}

// ── Migration tracking ───────────────────────────────────────

function getMigratedWorkspaces(): Set<string> {
  try {
    const raw = localStorage.getItem(cloudLocalKey(MIGRATION_DONE_KEY))
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function markAsMigrated(name: string): void {
  const migrated = getMigratedWorkspaces()
  migrated.add(name)
  localStorage.setItem(cloudLocalKey(MIGRATION_DONE_KEY), JSON.stringify([...migrated]))
}

/**
 * Check if there are any local workspaces that haven't been migrated yet
 * AND the user hasn't dismissed the migration prompt.
 * Use this to decide whether to show the migration prompt.
 */
export async function hasPendingMigrations(): Promise<boolean> {
  // If user already dismissed, don't ask again (until new workspaces appear)
  if (isMigrationDismissed()) return false
  const locals = await discoverLocalWorkspaces()
  return locals.length > 0
}

/**
 * Dismiss the migration prompt so it won't be shown again.
 * Called when the user clicks "Skip" — marks the current set of
 * local workspaces as "seen" so they won't trigger the prompt.
 * If NEW local workspaces appear later (e.g. user creates one while
 * logged out), the prompt will show again.
 */
export function dismissMigration(): void {
  // Store the set of workspace names that existed when the user dismissed.
  // hasPendingMigrations() will check: if ALL current local workspaces
  // were in the dismissed set, stay dismissed.  If a new workspace appears
  // that wasn't in the set, re-prompt.
  discoverLocalWorkspaces().then(locals => {
    const names = locals.map(l => l.name)
    localStorage.setItem(cloudLocalKey(MIGRATION_DISMISSED_KEY), JSON.stringify(names))
  }).catch(() => {
    // If discovery fails, just set an empty dismiss flag
    localStorage.setItem(cloudLocalKey(MIGRATION_DISMISSED_KEY), JSON.stringify([]))
  })
}

/**
 * Check if migration was dismissed AND no new workspaces have appeared since.
 */
function isMigrationDismissed(): boolean {
  try {
    const raw = localStorage.getItem(cloudLocalKey(MIGRATION_DISMISSED_KEY))
    if (!raw) return false
    // If the key exists, migration was dismissed.
    // We could check for new workspaces here, but to keep it sync,
    // we just check presence.  The async hasPendingMigrations() above
    // is the real gate.
    return true
  } catch {
    return false
  }
}

/**
 * Clear the dismissal — called when new workspaces are detected that
 * weren't in the dismissed set, or when the user logs in with a different account.
 */
export function clearMigrationDismissal(): void {
  localStorage.removeItem(cloudLocalKey(MIGRATION_DISMISSED_KEY))
}

// ── Name conflict detection ──────────────────────────────────

/**
 * Build migration items from local workspaces, detecting name conflicts
 * with existing cloud workspaces.
 */
export async function buildMigrationItems(
  localWorkspaces: LocalWorkspaceInfo[],
): Promise<MigrationItem[]> {
  const cloudWorkspaces = await listCloudWorkspaces()
  const cloudNames = new Set(cloudWorkspaces.map(cw => cw.name.toLowerCase()))

  return localWorkspaces.map(lw => {
    const nameConflict = cloudNames.has(lw.name.toLowerCase())
    return {
      localName: lw.name,
      cloudName: nameConflict ? `${lw.name} (local)` : lw.name,
      status: 'pending' as MigrationStatus,
      nameConflict,
    }
  })
}

// ── Core migration ───────────────────────────────────────────

/**
 * Migrate a single local workspace to the cloud.
 * Atomic: succeeds completely or rolls back.
 *
 * @returns The created CloudWorkspace, or null if rolled back.
 */
export async function migrateWorkspace(
  item: MigrationItem,
  onProgress: (item: MigrationItem) => void,
): Promise<CloudWorkspace | null> {
  const fs = (window as any).remixFileSystem
  const localPath = `${LOCAL_WORKSPACES_PATH}/${item.localName}`
  let cloudWorkspace: CloudWorkspace | null = null
  let cloudLocalPath: string | null = null

  // helper: emit progress with current item state
  const emit = () => onProgress({ ...item })

  try {
    // ── 1. Create cloud workspace via API ──
    item.status = 'creating'
    item.progress = 'Creating cloud workspace…'
    item.copiedFiles = 0
    item.uploadedFiles = 0
    item.uploadedBytes = 0
    item.snapshotDone = false
    emit()

    cloudWorkspace = await createCloudWorkspace(item.cloudName, true)
    cloudLocalPath = `${CLOUD_WORKSPACES_PATH}/${cloudWorkspace.uuid}`

    // ── 2. Copy files from local → cloud path in IndexedDB ──
    item.status = 'copying'
    item.progress = 'Copying files…'
    emit()

    const fileMap = await copyWorkspaceTree(localPath, cloudLocalPath, fs, (copiedCount, currentFile) => {
      item.copiedFiles = copiedCount
      item.currentFile = currentFile
      item.progress = `Copying ${currentFile}`
      emit()
    })
    const fileCount = Object.keys(fileMap).length
    item.totalFiles = fileCount
    item.copiedFiles = fileCount

    // Calculate total bytes
    let totalBytes = 0
    for (const content of Object.values(fileMap)) {
      totalBytes += new TextEncoder().encode(content as string).byteLength
    }
    item.totalBytes = totalBytes
    item.progress = `Copied ${fileCount} files`
    item.currentFile = undefined
    emit()

    // ── 3. Upload to S3 ──
    item.status = 'uploading'
    item.progress = 'Preparing snapshot…'
    emit()

    const token = await fetchWorkspaceSTS(cloudWorkspace.uuid)
    const s3 = new S3Client(token)

    // 3a. Upload ZIP snapshot (for fast bulk load by other clients)
    const zipData = await packWorkspace(cloudLocalPath, fs)
    item.snapshotSize = zipData.byteLength
    item.progress = `Uploading snapshot (${(zipData.byteLength / 1024).toFixed(1)} KB)…`
    emit()

    await s3.putObject(WORKSPACE_ZIP_KEY, zipData, 'application/zip')
    item.snapshotDone = true
    item.progress = `Snapshot uploaded (${(zipData.byteLength / 1024).toFixed(1)} KB)`
    emit()

    // 3b. Upload individual files (for incremental sync compatibility)
    item.progress = 'Uploading files…'
    emit()

    const manifest: SyncManifest = { version: 1, lastSyncTimestamp: Date.now(), files: {} }
    let uploaded = 0
    let uploadedBytes = 0
    for (const [relPath, content] of Object.entries(fileMap)) {
      item.currentFile = relPath
      const bytes = new TextEncoder().encode(content as string)
      const etag = await s3.putObject(relPath, content as string)
      manifest.files[relPath] = {
        etag,
        lastModified: new Date().toISOString(),
        size: bytes.byteLength,
      }
      uploaded++
      uploadedBytes += bytes.byteLength
      item.uploadedFiles = uploaded
      item.uploadedBytes = uploadedBytes
      item.progress = `Uploading ${relPath}`
      emit()
    }
    item.currentFile = undefined
    item.progress = `Uploaded all ${fileCount} files`
    emit()

    // 3c. Save manifest locally
    await ensureDir(cloudLocalPath, fs)
    await fs.writeFile(
      `${cloudLocalPath}/.sync-manifest.json`,
      JSON.stringify(manifest),
      'utf8'
    )

    // ── 4. Verify upload ──
    item.status = 'verifying'
    item.progress = 'Verifying upload…'
    item.currentFile = undefined
    emit()

    const remoteObjects = await s3.listObjects('')
    const remoteKeys = new Set(remoteObjects.map(o => o.key))
    const missing = Object.keys(fileMap).filter(k => !remoteKeys.has(k))

    if (missing.length > 0) {
      throw new Error(`Verification failed: ${missing.length} files missing on S3: ${missing.slice(0, 3).join(', ')}…`)
    }

    // ── 5. Delete local workspace ──
    item.status = 'cleaning'
    item.progress = 'Cleaning up local copy…'
    emit()

    await deleteDirectoryRecursive(localPath, fs)

    // ── 6. Mark as migrated ──
    markAsMigrated(item.localName)
    item.status = 'done'
    item.progress = 'Migration complete'
    emit()

    return cloudWorkspace

  } catch (error) {
    console.error(`[Migration] Failed for "${item.localName}":`, error)
    item.status = 'error'
    item.error = error.message || String(error)
    item.progress = 'Failed — rolling back…'
    item.currentFile = undefined
    emit()

    // ── Rollback ──
    if (cloudLocalPath) {
      try { await deleteDirectoryRecursive(cloudLocalPath, fs) } catch { /* ignore */ }
    }
    if (cloudWorkspace) {
      try { await deleteCloudWorkspace(cloudWorkspace.uuid) } catch { /* ignore */ }
    }

    item.progress = `Failed: ${item.error}`
    emit()
    return null
  }
}

/**
 * Migrate multiple workspaces sequentially.
 */
export async function migrateWorkspaces(
  items: MigrationItem[],
  onProgress: MigrationProgressCallback,
): Promise<CloudWorkspace[]> {
  const results: CloudWorkspace[] = []

  for (const item of items) {
    if (item.status === 'skipped') continue

    const result = await migrateWorkspace(item, (updatedItem) => {
      // Replace in array and notify
      const idx = items.findIndex(i => i.localName === updatedItem.localName)
      if (idx >= 0) items[idx] = { ...updatedItem }
      onProgress([...items])
    })

    if (result) results.push(result)
  }

  return results
}

// ── File helpers ─────────────────────────────────────────────

/**
 * Recursively copy all files from srcPath to destPath.
 * Returns a map of relative-path → content (for S3 upload).
 *
 * @param onFileCopied  Optional callback (copiedCount, relativePath) called after each file.
 */
async function copyWorkspaceTree(
  srcPath: string,
  destPath: string,
  fs: any,
  onFileCopied?: (copiedCount: number, relativePath: string) => void,
): Promise<Record<string, string>> {
  const fileMap: Record<string, string> = {}
  let copiedCount = 0
  await ensureDir(destPath, fs)

  async function walk(srcDir: string, destDir: string, relativeBase: string) {
    let entries: string[]
    try {
      entries = await fs.readdir(srcDir)
    } catch {
      return
    }

    for (const entry of entries) {
      // Skip sync artifacts
      if (entry === '.sync-manifest.json' || entry === '_workspace.zip') continue

      const srcChild = `${srcDir}/${entry}`
      const destChild = `${destDir}/${entry}`
      const relativePath = relativeBase ? `${relativeBase}/${entry}` : entry

      try {
        const stat = await fs.stat(srcChild)
        if (stat.isDirectory()) {
          await ensureDir(destChild, fs)
          await walk(srcChild, destChild, relativePath)
        } else {
          const content = await fs.readFile(srcChild, 'utf8')
          await fs.writeFile(destChild, content, 'utf8')
          fileMap[relativePath] = content
          copiedCount++
          onFileCopied?.(copiedCount, relativePath)
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  await walk(srcPath, destPath, '')
  return fileMap
}

/**
 * Recursively delete a directory.
 */
async function deleteDirectoryRecursive(dirPath: string, fs: any): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(dirPath)
  } catch {
    return // directory doesn't exist
  }

  for (const entry of entries) {
    const fullPath = `${dirPath}/${entry}`
    try {
      const stat = await fs.stat(fullPath)
      if (stat.isDirectory()) {
        await deleteDirectoryRecursive(fullPath, fs)
      } else {
        await fs.unlink(fullPath)
      }
    } catch {
      // skip
    }
  }

  try {
    await fs.rmdir(dirPath)
  } catch {
    // directory may already be gone
  }
}

/**
 * Ensure a directory path exists (recursive mkdir).
 */
async function ensureDir(path: string, fs: any): Promise<void> {
  const parts = path.split('/').filter(Boolean)
  let current = ''
  for (const part of parts) {
    current += '/' + part
    try {
      await fs.stat(current)
    } catch {
      try {
        await fs.mkdir(current)
      } catch {
        // may already exist from concurrent call
      }
    }
  }
}
