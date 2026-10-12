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

// ---------------------------------------------------------------------------
// Set-of-marks annotation
// ---------------------------------------------------------------------------

/**
 * One interactive element to badge on a capture.
 *
 * `label` is the digits of the `inspect_ui` ref (`e12` → `12`), so the badge
 * the model reads in the image is the handle it passes to `click_element`.
 * `rect` is in viewport coordinates — the same space `getBoundingClientRect`
 * returns — and is translated into image space by `annotatePngWithMarks`.
 */
export interface ElementMark {
  label: string
  rect: { left: number; top: number; width: number; height: number }
}

/** Badge fill. Chosen to stay legible over both IDE themes. */
const MARK_COLOR = '#e11d48'
const MARK_TEXT_COLOR = '#ffffff'
const MARK_FONT = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const BADGE_HEIGHT = 16
const BADGE_PAD = 4

interface Box { x: number; y: number; w: number; h: number }

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/**
 * Places a badge near the element's top-left without landing on a badge that
 * is already down. Above the box reads best — it sits in the gap between
 * controls instead of covering the label the model needs to read — so that is
 * tried first, then inside the box, then below it.
 */
function placeBadge(target: Box, placed: Box[], canvas: Box): Box {
  const candidates: Box[] = [
    { x: target.x, y: target.y - target.h, w: target.w, h: target.h },
    { x: target.x, y: target.y, w: target.w, h: target.h },
    { x: target.x, y: target.y + target.h, w: target.w, h: target.h }
  ]

  for (const candidate of candidates) {
    const box = {
      ...candidate,
      x: Math.min(Math.max(0, candidate.x), Math.max(0, canvas.w - candidate.w)),
      y: Math.min(Math.max(0, candidate.y), Math.max(0, canvas.h - candidate.h))
    }
    if (!placed.some((p) => overlaps(box, p))) return box
  }

  // Everything around the element is taken — slide right until there is room,
  // so two controls sharing an edge still get distinguishable badges.
  const fallback = { x: target.x, y: target.y, w: target.w, h: target.h }
  for (let i = 0; i < 8; i++) {
    fallback.x = Math.min(fallback.x + target.w, Math.max(0, canvas.w - target.w))
    if (!placed.some((p) => overlaps(fallback, p))) break
  }
  return fallback
}

/**
 * Draws numbered badges onto a captured PNG — the "set of marks" that turns a
 * screenshot from something the model can only describe into something it can
 * act on: every badge is an `inspect_ui` ref, so "the highlighted button" has a
 * handle `click_element` accepts.
 *
 * `origin` is the captured element's own viewport rect; marks are translated
 * into image space against it and dropped when they fall outside.
 *
 * Returns the original data URL untouched when there is nothing to draw or the
 * canvas is unavailable — an un-annotated screenshot is still useful, so this
 * never fails the capture.
 */
export async function annotatePngWithMarks(
  dataUrl: string,
  origin: { left: number; top: number; width: number; height: number },
  marks: ElementMark[]
): Promise<{ dataUrl: string; drawn: number }> {
  if (!marks.length || typeof document === 'undefined') return { dataUrl, drawn: 0 }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('could not reload the capture for annotation'))
      image.src = dataUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return { dataUrl, drawn: 0 }

    ctx.drawImage(img, 0, 0)
    // `captureElementPng` renders at pixelRatio 1 with the element's own box as
    // the canvas size, but a capture whose target overflowed its rect can still
    // come back a little different — scale rather than assume 1:1.
    const scaleX = img.width / Math.max(1, origin.width)
    const scaleY = img.height / Math.max(1, origin.height)

    ctx.font = MARK_FONT
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 1.5

    const placed: Box[] = []
    const canvasBox: Box = { x: 0, y: 0, w: canvas.width, h: canvas.height }
    let drawn = 0

    for (const mark of marks) {
      const x = (mark.rect.left - origin.left) * scaleX
      const y = (mark.rect.top - origin.top) * scaleY
      const w = mark.rect.width * scaleX
      const h = mark.rect.height * scaleY
      if (x + w < 0 || y + h < 0 || x > canvas.width || y > canvas.height) continue

      // Outline the element itself, so a badge pushed aside by a neighbour is
      // still unambiguously attached to its control.
      ctx.strokeStyle = MARK_COLOR
      ctx.globalAlpha = 0.9
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1))
      ctx.globalAlpha = 1

      const badgeWidth = Math.ceil(ctx.measureText(mark.label).width) + BADGE_PAD * 2
      const box = placeBadge({ x, y, w: badgeWidth, h: BADGE_HEIGHT }, placed, canvasBox)
      placed.push(box)

      ctx.fillStyle = MARK_COLOR
      ctx.fillRect(box.x, box.y, box.w, box.h)
      ctx.fillStyle = MARK_TEXT_COLOR
      ctx.fillText(mark.label, box.x + BADGE_PAD, box.y + BADGE_HEIGHT / 2)
      drawn++
    }

    return { dataUrl: canvas.toDataURL('image/png'), drawn }
  } catch (e) {
    remixAILogger.warn('[domCapture] set-of-marks annotation failed, returning the plain capture:', describeCaptureError(e))
    return { dataUrl, drawn: 0 }
  }
}
