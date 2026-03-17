/**
 * Cloud Workspace ZIP Utilities
 *
 * Provides pack/unpack for the workspace snapshot ZIP stored on S3.
 *
 * Strategy:
 *   - `packWorkspace()` — reads all files from the local IndexedDB FS tree
 *     and produces a ZIP blob (as Uint8Array) ready to PUT to S3.
 *   - `unpackWorkspace()` — takes a ZIP Uint8Array, extracts it into the
 *     local FS tree, and returns a SyncManifest built from the contents.
 *
 * The ZIP is stored on S3 as `_workspace.zip` (prefixed with underscore
 * so it sorts first and is unlikely to collide with user files).
 *
 * Binary files (git pack files, images, etc.) are stored in the ZIP as
 * binary; text files as utf-8 strings.  The ZIP itself is always
 * transferred as `application/zip`.
 */

import JSZip from 'jszip'
import { SyncManifest } from './types'

/** S3 key for the workspace snapshot ZIP (relative to workspace prefix) */
export const WORKSPACE_ZIP_KEY = '_workspace.zip'

/** S3 key for the git directory snapshot ZIP */
export const GIT_ZIP_KEY = '_git.zip'

// ── Known binary file extensions (stored as Uint8Array, not utf-8) ──
const BINARY_EXTENSIONS = new Set([
  '.pack', '.idx', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff',
  '.woff2', '.ttf', '.eot', '.pdf', '.wasm', '.zip', '.gz', '.tar',
])

function isBinaryPath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return false
  return BINARY_EXTENSIONS.has(path.slice(dot).toLowerCase())
}

// ── Pack ─────────────────────────────────────────────────────

/**
 * Walk the workspace directory tree and pack all files into a ZIP.
 *
 * @param localWorkspacePath  Absolute local FS path, e.g. `/.cloud-workspaces/<uuid>`
 * @param fs                  Reference to `window.remixFileSystem`
 * @returns ZIP as Uint8Array, ready for `s3.putObject()`
 */
export async function packWorkspace(
  localWorkspacePath: string,
  fs: any,
): Promise<Uint8Array> {
  const zip = new JSZip()
  const fileList: string[] = []
  await walkAndZip(zip, localWorkspacePath, '', fs, fileList)
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  return data
}

/**
 * Recursively walk the FS and add files to the ZIP.
 * `relativePath` is the path inside the ZIP (empty string for root).
 */
async function walkAndZip(
  zip: JSZip,
  basePath: string,
  relativePath: string,
  fs: any,
  fileList: string[] = [],
): Promise<void> {
  const absPath = relativePath ? `${basePath}/${relativePath}` : basePath
  let entries: string[]
  try {
    entries = await fs.readdir(absPath)
  } catch {
    return // directory may not exist yet
  }

  for (const entry of entries) {
    // Skip the sync manifest and the ZIP itself — they're not user data
    if (entry === '.sync-manifest.json') continue
    if (entry === '_workspace.zip') continue
    // Skip .git — managed locally by isomorphic-git, never synced
    if (entry === '.git') continue

    const childRelative = relativePath ? `${relativePath}/${entry}` : entry
    const childAbs = `${basePath}/${childRelative}`

    try {
      const stat = await fs.stat(childAbs)
      if (stat.isDirectory()) {
        await walkAndZip(zip, basePath, childRelative, fs, fileList)
      } else {
        // Read file — binary for known binary types, utf-8 otherwise
        if (isBinaryPath(entry)) {
          const data = await fs.readFile(childAbs)
          zip.file(childRelative, data instanceof Uint8Array ? data : new TextEncoder().encode(data))
          fileList.push(`${childRelative} (binary)`)
        } else {
          const text = await fs.readFile(childAbs, 'utf8')
          zip.file(childRelative, text)
          fileList.push(childRelative)
        }
      }
    } catch {
      // Skip unreadable files
    }
  }
}

// ── Unpack ───────────────────────────────────────────────────

/**
 * Extract a workspace ZIP into the local FS and build a manifest.
 *
 * @param zipData               The ZIP as Uint8Array (from S3 getObjectBinary)
 * @param localWorkspacePath    Absolute local FS path, e.g. `/.cloud-workspaces/<uuid>`
 * @param fs                    Reference to `window.remixFileSystem`
 * @returns A SyncManifest populated from the extracted files (ETags will be
 *          filled in by the caller from the S3 LIST response).
 */
export async function unpackWorkspace(
  zipData: Uint8Array,
  localWorkspacePath: string,
  fs: any,
): Promise<{ manifest: SyncManifest; fileCount: number }> {
  const zip = await JSZip.loadAsync(zipData)
  const manifest: SyncManifest = { version: 1, lastSyncTimestamp: Date.now(), files: {} }
  let fileCount = 0

  // ensureDir helper
  const ensuredDirs = new Set<string>()
  const ensureDir = async (dirPath: string) => {
    if (ensuredDirs.has(dirPath)) return
    const parts = dirPath.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += '/' + part
      if (ensuredDirs.has(current)) continue
      try {
        await fs.stat(current)
      } catch {
        try {
          await fs.mkdir(current)
        } catch (mkdirErr: any) {
          // Ignore EEXIST — concurrent extractions may race to create the same dir
          if (mkdirErr?.code !== 'EEXIST' && mkdirErr?.message !== 'EEXIST' && !String(mkdirErr).includes('EEXIST')) {
            throw mkdirErr
          }
        }
      }
      ensuredDirs.add(current)
    }
  }

  await ensureDir(localWorkspacePath)

  // Extract all files
  const filePromises: Promise<void>[] = []

  zip.forEach((relativePath: string, zipEntry: JSZip.JSZipObject) => {
    if (zipEntry.dir) return // skip directory entries
    if (relativePath === '.git' || relativePath.startsWith('.git/')) return // skip .git internals

    filePromises.push((async () => {
      const localPath = `${localWorkspacePath}/${relativePath}`
      const parentDir = localPath.substring(0, localPath.lastIndexOf('/'))
      await ensureDir(parentDir)

      if (isBinaryPath(relativePath)) {
        const data = await zipEntry.async('uint8array')
        await fs.writeFile(localPath, data)
        manifest.files[relativePath] = {
          etag: '', // will be updated from LIST response
          lastModified: new Date().toISOString(),
          size: data.byteLength,
        }
      } else {
        const text = await zipEntry.async('string')
        await fs.writeFile(localPath, text, 'utf8')
        manifest.files[relativePath] = {
          etag: '', // will be updated from LIST response
          lastModified: new Date().toISOString(),
          size: new TextEncoder().encode(text).byteLength,
        }
      }
      fileCount++
    })())
  })

  await Promise.all(filePromises)

  return { manifest, fileCount }
}

// ── Git Directory ZIP ────────────────────────────────────────

/**
 * Pack the `.git/` directory into an atomic ZIP snapshot.
 *
 * Everything inside `.git/` is treated as binary to preserve exact byte
 * content (loose objects, pack files, index, etc.).  The resulting ZIP
 * is stored on S3 as `_git.zip` and downloaded on workspace load when
 * no local `.git/` exists (e.g. fresh device, cleared IndexedDB).
 *
 * @param localWorkspacePath  Absolute FS path, e.g. `/.cloud-workspaces/<uuid>`
 * @param fs                  Reference to `window.remixFileSystem`
 * @returns ZIP as Uint8Array, or `null` if no `.git/` directory exists
 */
export async function packGitDir(
  localWorkspacePath: string,
  fs: any,
): Promise<Uint8Array | null> {
  const gitPath = `${localWorkspacePath}/.git`

  // Check if .git directory exists at all
  try {
    const stat = await fs.stat(gitPath)
    if (!stat.isDirectory()) return null
  } catch {
    return null // no .git dir
  }

  const zip = new JSZip()
  let fileCount = 0

  async function walkGit(basePath: string, relativePath: string): Promise<void> {
    const absPath = relativePath ? `${basePath}/${relativePath}` : basePath
    let entries: string[]
    try {
      entries = await fs.readdir(absPath)
    } catch {
      return
    }

    for (const entry of entries) {
      const childRelative = relativePath ? `${relativePath}/${entry}` : entry
      const childAbs = `${basePath}/${childRelative}`

      try {
        const stat = await fs.stat(childAbs)
        if (stat.isDirectory()) {
          await walkGit(basePath, childRelative)
        } else {
          // Read everything as binary — git internals are byte-sensitive
          const data = await fs.readFile(childAbs)
          if (data instanceof Uint8Array) {
            zip.file(childRelative, data)
          } else if (typeof data === 'string') {
            // Some FS implementations return strings for text-like files
            zip.file(childRelative, new TextEncoder().encode(data))
          } else {
            zip.file(childRelative, data)
          }
          fileCount++
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  await walkGit(gitPath, '')
  if (fileCount === 0) {
    return null
  }

  const data = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return data
}

/**
 * Extract `_git.zip` into the `.git/` directory of a workspace.
 *
 * All files are written as binary to preserve exact byte content.
 * This is only called when no local `.git/` exists (fresh device or
 * cleared storage).
 *
 * @param zipData               The ZIP as Uint8Array (from S3 getObjectBinary)
 * @param localWorkspacePath    Absolute FS path, e.g. `/.cloud-workspaces/<uuid>`
 * @param fs                    Reference to `window.remixFileSystem`
 * @returns Number of files extracted
 */
export async function unpackGitDir(
  zipData: Uint8Array,
  localWorkspacePath: string,
  fs: any,
): Promise<number> {
  const gitPath = `${localWorkspacePath}/.git`
  const zip = await JSZip.loadAsync(zipData)
  let fileCount = 0

  // ensureDir helper
  const ensuredDirs = new Set<string>()
  const ensureDir = async (dirPath: string) => {
    if (ensuredDirs.has(dirPath)) return
    const parts = dirPath.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += '/' + part
      if (ensuredDirs.has(current)) continue
      try {
        await fs.stat(current)
      } catch {
        try {
          await fs.mkdir(current)
        } catch (mkdirErr: any) {
          if (mkdirErr?.code !== 'EEXIST' && mkdirErr?.message !== 'EEXIST'
            && !String(mkdirErr).includes('EEXIST')) {
            throw mkdirErr
          }
        }
      }
      ensuredDirs.add(current)
    }
  }

  await ensureDir(gitPath)

  const filePromises: Promise<void>[] = []

  zip.forEach((relativePath: string, zipEntry: JSZip.JSZipObject) => {
    if (zipEntry.dir) return

    filePromises.push((async () => {
      const localPath = `${gitPath}/${relativePath}`
      const parentDir = localPath.substring(0, localPath.lastIndexOf('/'))
      await ensureDir(parentDir)

      // Write everything as binary
      const data = await zipEntry.async('uint8array')
      await fs.writeFile(localPath, data)
      fileCount++
    })())
  })

  await Promise.all(filePromises)
  return fileCount
}
