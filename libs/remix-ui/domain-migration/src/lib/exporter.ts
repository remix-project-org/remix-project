import JSZip from 'jszip'
import { collectConfig } from './config'
import { asBytes, getFs, scanFileSystem } from './archive'
import {
  ARCHIVE_FORMAT_VERSION,
  FILES_PREFIX,
  MANIFEST_ENTRY,
  MigrationManifest,
  ProgressCallback,
  SETTINGS_ENTRY
} from './types'

export interface ExportResult {
  manifest: MigrationManifest
  fileName: string
  streamedToDisk: boolean
}

/** A destination chosen by the user, or null when the browser has no picker. */
export type SaveTarget = { handle: any } | null

/** Present in jszip 3.x but absent from its bundled type definitions. */
interface JSZipStreamHelper {
  on(event: 'data', handler: (chunk: Uint8Array, metadata: { percent: number; currentFile: string }) => void): JSZipStreamHelper
  on(event: 'error', handler: (error: Error) => void): JSZipStreamHelper
  on(event: 'end', handler: () => void): JSZipStreamHelper
  pause(): JSZipStreamHelper
  resume(): JSZipStreamHelper
}

export function suggestedFileName(): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = new Date()
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  return `remix-migration-${stamp}.zip`
}

/**
 * Must be called synchronously from the click handler: the file picker needs a
 * live user gesture, and scanning the filesystem first would consume it.
 *
 * Returns null when unsupported or dismissed, in which case the export falls
 * back to an in-memory blob download.
 */
export async function pickSaveTarget(): Promise<SaveTarget> {
  const picker = (window as any).showSaveFilePicker
  if (!picker) return null
  try {
    const handle = await picker.call(window, {
      suggestedName: suggestedFileName(),
      types: [{ description: 'Remix migration archive', accept: { 'application/zip': ['.zip']} }]
    })
    return { handle }
  } catch {
    return null // user dismissed, or picker unavailable in this context
  }
}

export async function exportArchive(target: SaveTarget, onProgress: ProgressCallback): Promise<ExportResult> {
  const fs = getFs()
  const zip = new JSZip()

  onProgress({ phase: 'scanning', fraction: null, filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 })

  const scan = await scanFileSystem(fs, (path, bytes, index) => {
    zip.file(FILES_PREFIX + path.replace(/^\//, ''), bytes)
    if (index % 20 === 0) {
      onProgress({
        phase: 'scanning',
        fraction: null,
        filesDone: index + 1,
        filesTotal: 0,
        bytesDone: 0,
        bytesTotal: 0,
        currentPath: path
      })
    }
  })

  if (!scan.entries.length) throw new Error('There are no files to export.')

  const settings = collectConfig()

  const manifest: MigrationManifest = {
    formatVersion: ARCHIVE_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    sourceOrigin: window.location.origin,
    totalFiles: scan.entries.length,
    totalBytes: scan.totalBytes,
    entries: scan.entries,
    settingsCount: Object.keys(settings).length,
    workspaces: scan.workspaces,
    cloudWorkspaces: scan.cloudWorkspaces
  }

  zip.file(MANIFEST_ENTRY, JSON.stringify(manifest))
  // Separate entry so settings stay readable without parsing the file index.
  zip.file(SETTINGS_ENTRY, JSON.stringify(settings, null, 2))
  zip.file(
    'readme.txt',
    'Remix migration archive.\n\n' +
      `Exported from ${manifest.sourceOrigin} on ${manifest.createdAt}.\n` +
      `${manifest.totalFiles} files, ${manifest.totalBytes} bytes, ${manifest.settingsCount} settings.\n\n` +
      'files/       your workspaces, byte for byte\n' +
      'settings.json  your Remix preferences (no credentials)\n' +
      'manifest.json  file list with a SHA-256 per file\n\n' +
      'Import it with "Move your workspaces" in the workspace menu.\n' +
      'Keep this file until you have confirmed your workspaces opened correctly.\n'
  )

  const fileName = suggestedFileName()
  const options: JSZip.JSZipGeneratorOptions<'uint8array'> = {
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    streamFiles: true
  }

  const report = (percent: number, currentPath?: string) =>
    onProgress({
      phase: 'packing',
      fraction: Math.max(0, Math.min(percent / 100, 1)),
      filesDone: scan.entries.length,
      filesTotal: scan.entries.length,
      bytesDone: Math.round((percent / 100) * scan.totalBytes),
      bytesTotal: scan.totalBytes,
      currentPath
    })

  if (target?.handle) {
    await streamToDisk(zip, options, target.handle, report)
    return { manifest, fileName, streamedToDisk: true }
  }

  const blob = await zip.generateAsync({ ...options, type: 'blob' }, (meta) => report(meta.percent, meta.currentFile))
  downloadBlob(blob, fileName)
  return { manifest, fileName, streamedToDisk: false }
}

/**
 * Pipe the archive straight to disk so peak memory stays near one chunk rather
 * than the whole workspace, which is what makes large git repos survivable.
 */
async function streamToDisk(
  zip: JSZip,
  options: JSZip.JSZipGeneratorOptions<'uint8array'>,
  handle: any,
  report: (percent: number, currentPath?: string) => void
): Promise<void> {
  const writable = await handle.createWritable()
  try {
    await new Promise<void>((resolve, reject) => {
      const stream = (zip as any).generateInternalStream(options) as JSZipStreamHelper
      let pending: Promise<void> = Promise.resolve()

      stream
        .on('data', (chunk, meta) => {
          stream.pause()
          pending = pending
            .then(() => writable.write(chunk))
            .then(() => {
              report(meta?.percent ?? 0, meta?.currentFile)
              stream.resume()
            })
            .catch(reject)
        })
        .on('error', reject)
        .on('end', () => {
          pending.then(resolve).catch(reject)
        })
        .resume()
    })
  } catch (e) {
    await writable.abort?.()
    throw e
  }
  await writable.close()
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Long timeout: revoking while a large download is still flushing aborts it.
  setTimeout(() => URL.revokeObjectURL(url), 120000)
}
