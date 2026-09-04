import JSZip from 'jszip'
import { applyConfig } from './config'
import { estimateStorage, getFs, requestPersistentStorage, sha256 } from './archive'
import {
  ARCHIVE_FORMAT_VERSION,
  FILES_PREFIX,
  ImportResult,
  MANIFEST_ENTRY,
  MigrationFs,
  MigrationIssue,
  MigrationManifest,
  ProgressCallback,
  SETTINGS_ENTRY
} from './types'

const RESUME_PREFIX = 'remix-migration/resume/'
const RESUME_FLUSH_EVERY = 25
const MAX_TRACKED_ISSUES = 200

export interface OpenedArchive {
  manifest: MigrationManifest
  zip: JSZip
  /** Stable id for this archive, used to match a resume checkpoint. */
  archiveId: string
}

interface ResumeState {
  nextIndex: number
  renames: Record<string, string>
  issues: MigrationIssue[]
  updatedAt: string
}

export async function openArchive(file: File | Blob): Promise<OpenedArchive> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('This file is not a readable ZIP archive.')
  }

  const manifestEntry = zip.file(MANIFEST_ENTRY)
  if (!manifestEntry) {
    throw new Error(
      'This ZIP has no manifest.json, so it is not a Remix migration archive. Export a new one from the old domain.'
    )
  }

  const raw = await manifestEntry.async('string')
  let manifest: MigrationManifest
  try {
    manifest = JSON.parse(raw)
  } catch {
    throw new Error('The archive manifest is corrupted.')
  }

  if (!manifest?.entries?.length) throw new Error('The archive manifest lists no files.')
  if (manifest.formatVersion > ARCHIVE_FORMAT_VERSION) {
    throw new Error(`This archive needs a newer version of Remix (format ${manifest.formatVersion}).`)
  }

  return { manifest, zip, archiveId: await sha256(new TextEncoder().encode(raw)) }
}

export function readResumeState(archiveId: string): ResumeState | null {
  try {
    const raw = localStorage.getItem(RESUME_PREFIX + archiveId)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed?.nextIndex === 'number' ? parsed : null
  } catch {
    return null
  }
}

function writeResumeState(archiveId: string, state: ResumeState): void {
  try {
    localStorage.setItem(RESUME_PREFIX + archiveId, JSON.stringify(state))
  } catch {
    // Losing the checkpoint only costs re-work, so never fail the import for it.
  }
}

export function clearResumeState(archiveId: string): void {
  try {
    localStorage.removeItem(RESUME_PREFIX + archiveId)
  } catch {
    // ignore
  }
}

export interface ImportOptions {
  /** Continue from a previous checkpoint instead of starting over. */
  resume?: boolean
  /** Overwrite settings that already exist locally. */
  overwriteConfig?: boolean
}

export async function importArchive(
  archive: OpenedArchive,
  options: ImportOptions,
  onProgress: ProgressCallback
): Promise<ImportResult> {
  const fs = getFs()
  const { manifest, zip, archiveId } = archive

  const existing = options.resume ? readResumeState(archiveId) : null
  const startIndex = existing?.nextIndex ?? 0
  const issues: MigrationIssue[] = existing?.issues ? [...existing.issues] : []

  await assertEnoughSpace(manifest, startIndex)
  await requestPersistentStorage()

  // Reuse the mapping from an interrupted run so resumed files land in the
  // same workspaces as the ones already written.
  const renames = existing?.renames ?? (await buildWorkspaceRenames(fs, manifest.workspaces || []))

  const total = manifest.entries.length
  let bytesDone = manifest.entries.slice(0, startIndex).reduce((sum, e) => sum + e.size, 0)
  let imported = 0
  const skipped = startIndex

  const checkpoint = (nextIndex: number) =>
    writeResumeState(archiveId, { nextIndex, renames, issues: issues.slice(0, MAX_TRACKED_ISSUES), updatedAt: new Date().toISOString() })

  for (let i = startIndex; i < total; i++) {
    const entry = manifest.entries[i]
    const targetPath = applyRenames(entry.path, renames)

    try {
      const zipEntry = zip.file(FILES_PREFIX + entry.path.replace(/^\//, ''))
      if (!zipEntry) throw new Error('missing from the archive')

      const bytes = await zipEntry.async('uint8array')
      const digest = await sha256(bytes)
      if (digest !== entry.sha256) throw new Error('checksum mismatch, the archive is damaged')

      await ensureDir(fs, targetPath.slice(0, targetPath.lastIndexOf('/')))
      await fs.writeFile(targetPath, bytes)
      imported++
    } catch (e: any) {
      issues.push({ path: entry.path, reason: e?.message || String(e) })
    }

    bytesDone += entry.size

    if (i % RESUME_FLUSH_EVERY === 0 || i === total - 1) {
      checkpoint(i + 1)
      onProgress({
        phase: 'importing',
        fraction: (i + 1) / total,
        filesDone: i + 1,
        filesTotal: total,
        bytesDone,
        bytesTotal: manifest.totalBytes,
        currentPath: targetPath
      })
      // Yield so the progress bar paints and the tab stays responsive.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  const settings = await readSettings(zip, manifest)
  const { applied, skipped: configSkipped } = applyConfig(settings, options.overwriteConfig)
  clearResumeState(archiveId)

  onProgress({
    phase: 'done',
    fraction: 1,
    filesDone: total,
    filesTotal: total,
    bytesDone,
    bytesTotal: manifest.totalBytes
  })

  return { imported, skipped, issues, renamedWorkspaces: renames, configApplied: applied, configSkipped }
}

/** Settings moved out of the manifest into their own entry; read both. */
async function readSettings(zip: JSZip, manifest: MigrationManifest): Promise<Record<string, string>> {
  const entry = zip.file(SETTINGS_ENTRY)
  if (!entry) return manifest.config || {}
  try {
    const parsed = JSON.parse(await entry.async('string'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return manifest.config || {}
  }
}

async function assertEnoughSpace(manifest: MigrationManifest, startIndex: number): Promise<void> {
  const remaining = manifest.entries.slice(startIndex).reduce((sum, e) => sum + e.size, 0)
  const estimate = await estimateStorage()
  if (!estimate.known) return
  // Headroom for IndexedDB overhead; a mid-import quota error is far worse
  // than refusing up front.
  if (estimate.available < remaining * 1.3) {
    throw new Error(
      `Not enough browser storage: this import needs about ${Math.ceil((remaining * 1.3) / 1048576)} MB ` +
        `but only ${Math.floor(estimate.available / 1048576)} MB is available. Free up space and try again.`
    )
  }
}

/**
 * Never overwrite a workspace that already exists locally; the archive is a
 * copy of another origin and the local one may be newer.
 */
async function buildWorkspaceRenames(fs: MigrationFs, workspaces: string[]): Promise<Record<string, string>> {
  const renames: Record<string, string> = {}
  for (const name of workspaces) {
    let candidate = name
    let suffix = 0
    while (await fs.exists(`/.workspaces/${candidate}`)) {
      suffix++
      candidate = suffix === 1 ? `${name}-imported` : `${name}-imported-${suffix}`
    }
    if (candidate !== name) renames[name] = candidate
  }
  return renames
}

function applyRenames(path: string, renames: Record<string, string>): string {
  const match = /^\/\.workspaces\/([^/]+)(\/.*)?$/.exec(path)
  if (!match) return path
  const replacement = renames[match[1]]
  return replacement ? `/.workspaces/${replacement}${match[2] || ''}` : path
}

async function ensureDir(fs: MigrationFs, dir: string): Promise<void> {
  if (!dir || dir === '/') return
  const segments = dir.split('/').filter(Boolean)
  let current = ''
  for (const segment of segments) {
    current += `/${segment}`
    if (!(await fs.exists(current))) {
      try {
        await fs.mkdir(current)
      } catch {
        // Concurrent creation is fine; a real failure surfaces on writeFile.
      }
    }
  }
}
