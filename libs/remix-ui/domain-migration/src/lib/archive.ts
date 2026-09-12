import { MigrationEntry, MigrationFs, MigrationIssue } from './types'

/** Directories that are never part of a migration. */
const SKIP_ENTRIES = new Set([
  '_workspace.zip',
  '.sync-manifest.json',
  // Cloud workspaces live on S3 and come back by signing in on the new
  // domain, so copying them into the archive would only bloat it.
  '.cloud-workspaces'
])

export function getFs(): MigrationFs {
  const fs = (window as any).remixFileSystem
  if (!fs) throw new Error('Remix filesystem is not available in this browser.')
  return fs as MigrationFs
}

export function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  // `bytes.buffer` may be a pooled ArrayBuffer, so slice to the exact view.
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return toHex(await crypto.subtle.digest('SHA-256', view))
}

export function asBytes(content: Uint8Array | string): Uint8Array {
  return typeof content === 'string' ? new TextEncoder().encode(content) : content
}

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export interface StorageEstimate {
  usage: number
  quota: number
  available: number
  known: boolean
}

export async function estimateStorage(): Promise<StorageEstimate> {
  try {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate()
      return { usage, quota, available: Math.max(quota - usage, 0), known: quota > 0 }
    }
  } catch {
    // fall through
  }
  return { usage: 0, quota: 0, available: 0, known: false }
}

/**
 * Ask the browser to exempt this origin from storage eviction. Best effort:
 * some browsers grant it silently, others refuse without a prompt.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted?.()) return true
      return await navigator.storage.persist()
    }
  } catch {
    // ignore
  }
  return false
}

export interface ScanResult {
  entries: MigrationEntry[]
  totalBytes: number
  workspaces: string[]
  /** Cloud workspaces deliberately left out, for reporting in the UI. */
  cloudWorkspaces: string[]
  issues: MigrationIssue[]
}

export interface MigrationPreview {
  fileCount: number
  totalBytes: number
  workspaces: string[]
  cloudWorkspaces: string[]
}

/**
 * Size up the export without reading file contents, so the wizard can show
 * what's included before the user commits to a full hash-and-pack pass.
 */
export async function previewFileSystem(fs: MigrationFs): Promise<MigrationPreview> {
  let fileCount = 0
  let totalBytes = 0

  const walk = async (dir: string): Promise<void> => {
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch {
      return
    }
    for (const name of names) {
      if (SKIP_ENTRIES.has(name)) continue
      const path = dir === '/' ? `/${name}` : `${dir}/${name}`
      try {
        const stat = await fs.stat(path)
        if (stat.isDirectory()) await walk(path)
        else {
          fileCount++
          totalBytes += stat.size || 0
        }
      } catch {
        // unreadable entries surface during the real scan
      }
    }
  }
  await walk('/')

  const listDirs = async (root: string): Promise<string[]> => {
    const out: string[] = []
    try {
      if (!(await fs.exists(root))) return out
      for (const name of await fs.readdir(root)) {
        if ((await fs.stat(`${root}/${name}`)).isDirectory()) out.push(name)
      }
    } catch {
      // listing is cosmetic
    }
    return out
  }

  return {
    fileCount,
    totalBytes,
    workspaces: await listDirs('/.workspaces'),
    cloudWorkspaces: await listDirs('/.cloud-workspaces')
  }
}

/**
 * Walk the whole filesystem and hash every file.
 *
 * Files are always read as raw bytes. Reading as utf8 here is what silently
 * corrupted git pack files in the previous backup implementation.
 */export async function scanFileSystem(
  fs: MigrationFs,
  onFile?: (path: string, bytes: Uint8Array, index: number) => Promise<void> | void
): Promise<ScanResult> {
  const entries: MigrationEntry[] = []
  const issues: MigrationIssue[] = []
  const workspaces: string[] = []
  const cloudWorkspaces: string[] = []
  let totalBytes = 0

  const walk = async (dir: string): Promise<void> => {
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch (e: any) {
      issues.push({ path: dir, reason: `Could not list directory: ${e?.message || e}` })
      return
    }

    for (const name of names) {
      if (SKIP_ENTRIES.has(name)) continue
      const path = dir === '/' ? `/${name}` : `${dir}/${name}`
      try {
        const stat = await fs.stat(path)
        if (stat.isDirectory()) {
          await walk(path)
        } else {
          const bytes = asBytes(await fs.readFile(path))
          const entry = { path, size: bytes.byteLength, sha256: await sha256(bytes) }
          entries.push(entry)
          totalBytes += entry.size
          if (onFile) await onFile(path, bytes, entries.length - 1)
        }
      } catch (e: any) {
        issues.push({ path, reason: e?.message || String(e) })
      }
    }
  }

  await walk('/')

  try {
    if (await fs.exists('/.workspaces')) {
      for (const name of await fs.readdir('/.workspaces')) {
        if ((await fs.stat(`/.workspaces/${name}`)).isDirectory()) workspaces.push(name)
      }
    }
  } catch {
    // workspace listing is cosmetic; the entry list is the source of truth
  }

  try {
    if (await fs.exists('/.cloud-workspaces')) {
      for (const name of await fs.readdir('/.cloud-workspaces')) {
        if ((await fs.stat(`/.cloud-workspaces/${name}`)).isDirectory()) cloudWorkspaces.push(name)
      }
    }
  } catch {
    // nothing to report if the directory can't be read
  }

  return { entries, totalBytes, workspaces, cloudWorkspaces, issues }
}
