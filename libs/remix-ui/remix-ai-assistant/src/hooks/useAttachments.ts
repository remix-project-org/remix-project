import { useCallback, useMemo, useState } from 'react'
import type { ChatAttachment } from '@remix/remix-ai-core'
import { captureElementPng, defaultCaptureTarget } from '@remix/remix-ai-core'

/** Attachments beyond this add cost without adding much signal. */
export const MAX_ATTACHMENTS = 4

/** Refuse anything larger before we even try to decode it. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024

/**
 * Longest edge we send. Above this the providers downscale server-side anyway,
 * so the extra pixels are pure token cost.
 */
const MAX_EDGE = 1568

/** Longest edge of the copy kept in chat history. */
const THUMB_EDGE = 320

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']

/** Rendered natively by vision models; sent as an OpenAI-style file block. */
export const ACCEPTED_DOCUMENT_TYPES = ['application/pdf']

/**
 * Read as text and sent inline. Browsers report `type` inconsistently for
 * source files — Solidity and most code extensions come back as `''` — so the
 * extension list below is what actually decides, with the mime type as a
 * fallback for the few that are reported reliably.
 */
export const ACCEPTED_TEXT_EXTENSIONS = [
  'sol', 'vy', 'yul', 'cairo', 'circom', 'nr',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonc',
  'py', 'rs', 'go', 'java', 'rb', 'php', 'c', 'h', 'cpp', 'hpp', 'cs', 'swift', 'kt',
  'md', 'markdown', 'txt', 'log', 'csv', 'tsv',
  'yml', 'yaml', 'toml', 'ini', 'env', 'cfg', 'conf',
  'html', 'htm', 'css', 'scss', 'less', 'xml', 'svg',
  'sh', 'bash', 'zsh', 'sql', 'abi', 'gitignore', 'dockerfile', 'lock'
]

/** Everything the picker offers, as an `accept` attribute value. */
export const ACCEPTED_FILE_ACCEPT_ATTR = [
  ...ACCEPTED_IMAGE_TYPES,
  ...ACCEPTED_DOCUMENT_TYPES,
  'text/*',
  ...ACCEPTED_TEXT_EXTENSIONS.map((ext) => `.${ext}`)
].join(',')

/**
 * Cap on the decoded text of a single file. Roughly 50k tokens — beyond this a
 * file is better read with the file tools than pasted into one turn.
 */
export const MAX_TEXT_CHARS = 200_000

export interface AttachmentError {
  fileName: string
  reason: string
}

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  // A dotfile like `.env` is all extension, not a name with none.
  if (dot < 0) return name.toLowerCase()
  return name.slice(dot + 1).toLowerCase()
}

/** Decides how a file will be sent, or `null` when we cannot take it. */
export function classifyFile(file: File | Blob, name: string): ChatAttachment['kind'] | null {
  const type = (file.type || '').toLowerCase()
  if (ACCEPTED_IMAGE_TYPES.includes(type)) return 'image'
  if (ACCEPTED_DOCUMENT_TYPES.includes(type)) return 'document'
  if (type.startsWith('text/')) return 'text'
  if (ACCEPTED_TEXT_EXTENSIONS.includes(extensionOf(name))) return 'text'
  // Some browsers report nothing at all for unknown extensions; an empty type
  // with no recognised extension is not worth guessing at.
  return null
}

const readAsDataUrl = (file: File | Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error || new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Not a readable image'))
    img.src = src
  })

/**
 * Redraws the image at most `maxEdge` across. Returns the original data URL
 * untouched when it is already small enough, so a screenshot we just produced
 * doesn't get re-encoded for nothing.
 */
const downscale = async (dataUrl: string, maxEdge: number, mimeType: string): Promise<{ dataUrl: string; width: number; height: number }> => {
  const img = await loadImage(dataUrl)
  const longest = Math.max(img.width, img.height)

  if (longest <= maxEdge) return { dataUrl, width: img.width, height: img.height }

  const scale = maxEdge / longest
  const width = Math.round(img.width * scale)
  const height = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return { dataUrl, width: img.width, height: img.height }
  ctx.drawImage(img, 0, 0, width, height)

  // PNG and GIF may carry transparency that JPEG would flatten to black.
  const keepsAlpha = mimeType === 'image/png' || mimeType === 'image/gif'
  const out = keepsAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85)
  return { dataUrl: out, width, height }
}

const approxBytes = (dataUrl: string): number => Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)

/** Turns a File/Blob into a send-ready attachment. */
export async function buildAttachment(
  file: File | Blob,
  name: string,
  source: ChatAttachment['source'] = 'upload',
  kind: ChatAttachment['kind'] = 'image'
): Promise<ChatAttachment> {
  const mimeType = file.type || (kind === 'image' ? 'image/png' : 'application/octet-stream')

  if (kind === 'text') {
    const raw = await file.text()
    const truncated = raw.length > MAX_TEXT_CHARS
    return {
      id: crypto.randomUUID(),
      name,
      mimeType: mimeType || 'text/plain',
      kind,
      textContent: truncated ? raw.slice(0, MAX_TEXT_CHARS) : raw,
      truncated,
      size: file.size,
      source
    }
  }

  if (kind === 'document') {
    return {
      id: crypto.randomUUID(),
      name,
      mimeType,
      kind,
      dataUrl: await readAsDataUrl(file),
      size: file.size,
      source
    }
  }

  const raw = await readAsDataUrl(file)
  const full = await downscale(raw, MAX_EDGE, mimeType)
  const thumb = await downscale(full.dataUrl, THUMB_EDGE, mimeType)

  return {
    id: crypto.randomUUID(),
    name,
    mimeType,
    kind,
    dataUrl: full.dataUrl,
    thumbnailDataUrl: thumb.dataUrl,
    size: approxBytes(full.dataUrl),
    source
  }
}

export interface UseAttachments {
  attachments: ChatAttachment[]
  errors: AttachmentError[]
  addFiles: (files: FileList | File[] | null) => Promise<void>
  addDataUrl: (dataUrl: string, name: string, source?: ChatAttachment['source']) => Promise<void>
  remove: (id: string) => void
  clear: () => void
  dismissErrors: () => void
}

/**
 * Owns the images staged on the composer: what is attached, what was rejected,
 * and the size/count rules. Kept out of the components so the two near-identical
 * prompt-area variants share one implementation.
 */
export function useAttachments(): UseAttachments {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [errors, setErrors] = useState<AttachmentError[]>([])

  const dismissErrors = useCallback(() => setErrors([]), [])
  const clear = useCallback(() => {
    setAttachments([])
    setErrors([])
  }, [])
  const remove = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const append = useCallback((next: ChatAttachment[], rejected: AttachmentError[]) => {
    setAttachments(prev => {
      const room = MAX_ATTACHMENTS - prev.length
      if (next.length > room) {
        rejected.push({ fileName: '', reason: `Only ${MAX_ATTACHMENTS} files can be attached to one message.` })
      }
      return [...prev, ...next.slice(0, Math.max(0, room))]
    })
    if (rejected.length) setErrors(rejected)
  }, [])

  const addFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files) return
    const list = Array.from(files as ArrayLike<File>)
    if (list.length === 0) return

    const accepted: ChatAttachment[] = []
    const rejected: AttachmentError[] = []

    for (const file of list) {
      const kind = classifyFile(file, file.name || '')
      if (!kind) {
        rejected.push({ fileName: file.name, reason: 'Unsupported file type. Attach an image, a PDF, or a text/source file.' })
        continue
      }
      if (file.size > MAX_SOURCE_BYTES) {
        rejected.push({ fileName: file.name, reason: 'File is larger than 10 MB.' })
        continue
      }
      try {
        accepted.push(await buildAttachment(file, file.name || 'file', 'upload', kind))
      } catch (e: any) {
        rejected.push({ fileName: file.name, reason: e?.message || 'Could not read the file.' })
      }
    }

    append(accepted, rejected)
  }, [append])

  const addDataUrl = useCallback(async (dataUrl: string, name: string, source: ChatAttachment['source'] = 'screenshot') => {
    try {
      const blob = await (await fetch(dataUrl)).blob()
      append([await buildAttachment(blob, name, source, 'image')], [])
    } catch (e: any) {
      setErrors([{ fileName: name, reason: e?.message || 'Could not process the image.' }])
    }
  }, [append])

  // Memoized so consumers can safely put the whole object in a dependency
  // array without re-creating every callback that closes over it each render.
  return useMemo(
    () => ({ attachments, errors, addFiles, addDataUrl, remove, clear, dismissErrors }),
    [attachments, errors, addFiles, addDataUrl, remove, clear, dismissErrors]
  )
}

/** Pulls attachable files out of a paste event. */
export function filesFromClipboard(e: React.ClipboardEvent): File[] {
  const items = e.clipboardData?.items
  if (!items) return []
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file && classifyFile(file, file.name || '')) files.push(file)
  }
  return files
}

/** Rasterizes the IDE to a PNG data URL. */
export async function captureIdeScreenshot(selector?: string): Promise<string> {
  const target = (selector ? document.querySelector(selector) : defaultCaptureTarget()) as HTMLElement | null
  if (!target) throw new Error('Nothing to capture')
  const { dataUrl } = await captureElementPng(target)
  return dataUrl
}
