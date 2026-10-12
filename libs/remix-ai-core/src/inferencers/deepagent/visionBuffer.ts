import { remixAILogger } from '../../helpers/logger'

export interface BufferedScreenshot {
  dataUrl: string
  width: number
  height: number
  label: string
  capturedAt: number
}

interface BufferEntry {
  shot: BufferedScreenshot
  threadId: string
  attachments: number
  hash: string
}

/** How many screenshots stay visible to the model at once. */
const MAX_LIVE_SCREENSHOTS = 2
const MAX_LIVE_TURNS = 3

/** Marker the tool embeds in its text result, e.g. `[remix-screenshot:3]`. */
export const SCREENSHOT_MARKER_RE = /\[remix-screenshot:([a-z0-9-]+)\]/gi

export function screenshotMarker(id: string): string {
  return `[remix-screenshot:${id}]`
}

function fingerprint(dataUrl: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < dataUrl.length; i++) {
    hash ^= dataUrl.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36) + ':' + dataUrl.length
}

class ScreenshotBuffer {
  private entries = new Map<string, BufferEntry>()
  private counter = 0
  /** Thread new captures are tagged with. Set by the inferencer. */
  private threadId = ''

  setThread(threadId: string): void {
    const next = threadId || ''
    if (next === this.threadId) return
    const dropped = this.entries.size
    this.entries.clear()
    this.threadId = next
    if (dropped > 0) remixAILogger.log('[ScreenshotBuffer] thread switch dropped', dropped, 'screenshot(s)')
  }

  /** Stores a screenshot and returns the id to embed in the tool's text result. */
  put(shot: BufferedScreenshot): string {
    const hash = fingerprint(shot.dataUrl)

    for (const [id, entry] of this.entries) {
      if (entry.threadId !== this.threadId || entry.hash !== hash) continue
      entry.attachments = 0
      entry.shot = shot
      remixAILogger.log('[ScreenshotBuffer] identical capture, reusing', id)
      return id
    }

    const id = `s${++this.counter}`
    this.entries.set(id, { shot, threadId: this.threadId, attachments: 0, hash })
    while (this.entries.size > MAX_LIVE_SCREENSHOTS) {
      const oldest = this.entries.keys().next().value
      this.entries.delete(oldest)
      remixAILogger.log('[ScreenshotBuffer] evicted screenshot', oldest)
    }
    return id
  }

  get(id: string): BufferedScreenshot | undefined {
    const entry = this.entries.get(id)
    if (!entry) return undefined
    if (entry.threadId !== this.threadId) return undefined
    return entry.shot
  }

  tick(attachedIds: Iterable<string>): void {
    const seen = new Set(attachedIds)
    for (const id of seen) {
      const entry = this.entries.get(id)
      if (!entry) continue
      entry.attachments++
      if (entry.attachments >= MAX_LIVE_TURNS) {
        this.entries.delete(id)
        remixAILogger.log('[ScreenshotBuffer] expired screenshot', id, `after ${entry.attachments} model call(s)`)
      }
    }
  }

  clear(): void {
    this.entries.clear()
  }

  /** Live entry count — for logs and tests, not for routing decisions. */
  size(): number {
    return this.entries.size
  }
}

export const screenshotBuffer = new ScreenshotBuffer()
