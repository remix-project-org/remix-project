import { remixAILogger } from './logger'

/**
 * Rasterizes a live DOM subtree to a PNG data URL.
 *
 * `html-to-image` works by serializing the subtree into an SVG `foreignObject`
 * and loading that through an `Image`. Anything that makes the serialized
 * document unloadable — a cross-origin image, a font fetch, an oversized
 * payload — rejects the whole render, often with a bare `Event` that carries no
 * `.message`. Capturing a whole IDE hits every one of those, so this wrapper
 * exists to make the common case actually succeed:
 *
 *  - `cacheBust` is OFF. It rewrites every image URL with a `?t=` query, which
 *    forces a fresh fetch and breaks any CORS-approved cached response.
 *  - A transparent `imagePlaceholder` means one unfetchable image degrades to a
 *    blank rectangle instead of failing the capture.
 *  - Scripts and cross-origin iframes are filtered out. Iframe contents cannot
 *    be reached from the parent document anyway; leaving them in only risks a
 *    SecurityError.
 *  - Fonts are skipped. Text still renders with whatever the clone resolves to,
 *    and font embedding is the single slowest and most failure-prone step.
 *
 * If the first attempt still fails it retries with images dropped entirely,
 * which is nearly always enough to get *something* back.
 */

/** 1×1 transparent PNG, substituted for any image that fails to load. */
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const EXCLUDED_TAGS = new Set(['SCRIPT', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED'])

export interface CaptureResult {
  dataUrl: string
  width: number
  height: number
  /** True when images had to be dropped to get the capture to succeed. */
  degraded: boolean
}

/** Turns whatever html-to-image rejected with into something readable. */
export function describeCaptureError(e: any): string {
  if (!e) return 'unknown error'
  if (typeof e === 'string') return e
  if (e.message) return e.message
  // Image load failures reject with a bare Event.
  if (e.type) return `${e.type} while loading the rendered image (an asset on the page could not be inlined)`
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

const baseFilter = (node: HTMLElement): boolean => {
  if (!node?.tagName) return true
  return !EXCLUDED_TAGS.has(node.tagName)
}

const noImagesFilter = (node: HTMLElement): boolean => {
  if (!node?.tagName) return true
  if (node.tagName === 'IMG' || node.tagName === 'CANVAS' || node.tagName === 'VIDEO') return false
  return baseFilter(node)
}

export async function captureElementPng(target: HTMLElement): Promise<CaptureResult> {
  if (typeof document === 'undefined') throw new Error('No DOM available in this context')

  const { toPng } = await import('html-to-image')

  const rect = target.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width || target.scrollWidth))
  const height = Math.max(1, Math.round(rect.height || target.scrollHeight))
  const backgroundColor = window.getComputedStyle(document.body).backgroundColor || undefined

  const common = {
    width,
    height,
    backgroundColor,
    pixelRatio: 1,
    cacheBust: false,
    skipFonts: true,
    skipAutoScale: true,
    imagePlaceholder: TRANSPARENT_PIXEL
  }

  try {
    return { dataUrl: await toPng(target, { ...common, filter: baseFilter }), width, height, degraded: false }
  } catch (first) {
    remixAILogger.warn('[domCapture] full capture failed, retrying without images:', describeCaptureError(first), first)
    try {
      return { dataUrl: await toPng(target, { ...common, filter: noImagesFilter }), width, height, degraded: true }
    } catch (second) {
      remixAILogger.error('[domCapture] capture failed', second)
      throw new Error(describeCaptureError(second))
    }
  }
}

/**
 * The element to capture when no selector is given: the IDE shell, not the raw
 * `<body>`. Serializing the whole document drags in overlays and portals and
 * makes the payload far more likely to blow past what an SVG data URL can hold.
 */
export function defaultCaptureTarget(): HTMLElement {
  // `[data-id="remixIDE"]` is the app shell rendered by remix-app.tsx — the
  // icon bar, both side panels and the main panel, without the document-level
  // portals and overlays that hang off <body>.
  return (document.querySelector('[data-id="remixIDE"]') ||
    document.getElementById('root') ||
    document.body) as HTMLElement
}
