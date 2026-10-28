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
 *  - Only the icon webfonts are embedded. Blanket font embedding is the single
 *    slowest and most failure-prone step, but with no font at all every icon
 *    rasterizes as an empty box, so `iconFontEmbedCSS` inlines just the faces
 *    the captured subtree actually draws glyphs with.
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
  /** Width of the captured element, in CSS pixels. */
  width: number
  /** Height of the captured element, in CSS pixels. */
  height: number
  /** Device pixels per CSS pixel in `dataUrl` — see CAPTURE_PIXEL_RATIO. */
  scale: number
  /** True when images had to be dropped to get the capture to succeed. */
  degraded: boolean
}

/**
 * Device pixels per CSS pixel to rasterize at. Capturing at 1 on a HiDPI
 * screen produces an image with half the detail the user sees, which then has
 * to be scaled back up to be viewed — the blur they notice. 2 is the ceiling:
 * past it the payload grows without adding anything a reader or a model can
 * use.
 */
export const CAPTURE_PIXEL_RATIO = 2

/**
 * Longest edge of the copy handed to the model. Every vision model downsamples
 * past roughly this, so a larger image costs bytes and buys nothing.
 */
export const MODEL_MAX_EDGE = 1600

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

// ---------------------------------------------------------------------------
// Icon fonts
// ---------------------------------------------------------------------------

/**
 * Icons in the IDE are glyphs in a webfont — Font Awesome for most of them,
 * codicon for the editor and panel controls — drawn through a `::before`
 * content codepoint. The clone
 * inside the SVG `foreignObject` cannot fetch anything, so without the font
 * file inlined every icon rasterizes as an empty box. Only the icon families
 * are embedded — body text falls back to the system stack and looks the same,
 * while embedding every face on the page is megabytes of base64 for nothing.
 */
const ICON_FAMILY_PATTERN = /font ?awesome|custom-icons|codicon|remixicon|material icons|glyphicon/i

/** Elements that plausibly carry an icon glyph, to keep the style probe cheap. */
const ICON_CANDIDATE_SELECTOR = 'i, [class*="fa-"], [class*="icon"]'

/** Parsed font files, keyed by absolute URL, so repeat captures cost nothing. */
const fontFileCache = new Map<string, Promise<string | null>>()

/** Built @font-face CSS, keyed by the set of families it covers. */
const fontCssCache = new Map<string, Promise<string>>()

const normalizeFamily = (family: string): string =>
  family.replace(/["']/g, '').trim().toLowerCase()

/** Font formats, by the extension or the `format()` hint of the `src` entry. */
const FONT_MIME: Record<string, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  truetype: 'font/ttf',
  ttf: 'font/ttf',
  opentype: 'font/otf',
  otf: 'font/otf'
}

const fetchFontAsDataUrl = (url: string, mime: string): Promise<string | null> => {
  if (!fontFileCache.has(url)) {
    fontFileCache.set(url, (async () => {
      try {
        const res = await fetch(url, { credentials: 'same-origin' })
        if (!res.ok) return null
        const buf = new Uint8Array(await res.arrayBuffer())
        let binary = ''
        for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
        return `data:${mime};base64,${btoa(binary)}`
      } catch (e) {
        remixAILogger.warn('[domCapture] could not inline font', url, e)
        return null
      }
    })())
  }
  return fontFileCache.get(url)
}

const normalizeWeight = (weight: string): string => {
  const w = (weight || '').trim().toLowerCase()
  if (!w || w === 'normal') return '400'
  if (w === 'bold') return '700'
  return w
}

/**
 * The icon faces actually referenced by the subtree about to be captured, as
 * family -> weights. Weights matter: one Font Awesome family covers light,
 * regular and solid, and embedding the faces nobody used would triple the
 * payload for nothing.
 */
function usedIconFaces(target: HTMLElement): Map<string, Set<string>> {
  const faces = new Map<string, Set<string>>()
  const add = (style: CSSStyleDeclaration) => {
    const weight = normalizeWeight(style.fontWeight)
    for (const part of (style.fontFamily || '').split(',')) {
      const name = normalizeFamily(part)
      if (!name || !ICON_FAMILY_PATTERN.test(name)) continue
      if (!faces.has(name)) faces.set(name, new Set())
      faces.get(name).add(weight)
    }
  }

  const candidates = [target, ...Array.from(target.querySelectorAll(ICON_CANDIDATE_SELECTOR))] as HTMLElement[]
  for (const el of candidates) {
    add(window.getComputedStyle(el))
    // The glyph itself lives on the pseudo-element, which may name a different
    // family than its host (`.fas` sets the family, `.fa-save` the codepoint).
    add(window.getComputedStyle(el, '::before'))
    add(window.getComputedStyle(el, '::after'))
  }
  return faces
}

interface FontFaceSource { url: string; format: string; mime: string }

/** The `src` of a @font-face rule, preferring woff2, resolved absolutely. */
function fontFaceSource(
  rule: CSSFontFaceRule,
  sheetHref: string | null
): FontFaceSource | null {
  const src = rule.style.getPropertyValue('src')
  if (!src) return null
  const re = /url\(\s*["']?([^"')]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/g
  const entries: RegExpExecArray[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(src)) !== null) entries.push(match)
  if (!entries.length) return null

  const picked = entries.find(e => (e[2] || '').includes('woff2')) || entries[0]
  const raw = picked[1]
  // Codicon and friends declare no `format()`, so fall back to the extension.
  const hint = (picked[2] || raw.split('?')[0].split('.').pop() || '').toLowerCase()
  const format = hint === 'ttf' ? 'truetype' : hint === 'otf' ? 'opentype' : hint
  const mime = FONT_MIME[hint] || 'application/octet-stream'

  if (raw.startsWith('data:')) return { url: raw, format, mime }
  try {
    return { url: new URL(raw, sheetHref || document.baseURI).href, format, mime }
  } catch {
    return null
  }
}

/**
 * Builds the `fontEmbedCSS` handed to html-to-image: the @font-face rules for
 * the icon families in use, with their files inlined as data URLs.
 */
export async function iconFontEmbedCSS(target: HTMLElement): Promise<string> {
  const faces = usedIconFaces(target)
  if (!faces.size) return ''

  const key = Array.from(faces.entries())
    .map(([family, weights]) => `${family}:${Array.from(weights).sort().join(',')}`)
    .sort()
    .join('|')
  if (!fontCssCache.has(key)) {
    fontCssCache.set(key, (async () => {
      // Collected per family first: a family whose declared weights don't line
      // up with the computed ones (codicon declares none and is used at 700)
      // must still get its faces embedded, so the weight filter can only
      // narrow a family down, never drop it entirely.
      const byFamily = new Map<string, Array<{ style: string; weight: string; src: FontFaceSource }>>()
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList
        try {
          rules = sheet.cssRules
        } catch {
          // Cross-origin stylesheet: unreadable, and never ours.
          continue
        }
        for (const rule of Array.from(rules || [])) {
          if (rule.constructor.name !== 'CSSFontFaceRule' && (rule as any).type !== 5) continue
          const faceRule = rule as CSSFontFaceRule
          const family = normalizeFamily(faceRule.style.getPropertyValue('font-family'))
          if (!faces.has(family)) continue
          const src = fontFaceSource(faceRule, sheet.href)
          if (!src) continue
          if (!byFamily.has(family)) byFamily.set(family, [])
          byFamily.get(family).push({
            style: faceRule.style.getPropertyValue('font-style') || 'normal',
            weight: faceRule.style.getPropertyValue('font-weight') || 'normal',
            src
          })
        }
      }

      const jobs: Promise<string>[] = []
      for (const [family, declared] of byFamily) {
        const wanted = faces.get(family)
        const matching = declared.filter(face => wanted.has(normalizeWeight(face.weight)))
        for (const face of (matching.length ? matching : declared)) {
          jobs.push(fetchFontAsDataUrl(face.src.url, face.src.mime).then(dataUrl => dataUrl
            ? `@font-face{font-family:'${family}';font-style:${face.style};font-weight:${face.weight};font-display:block;src:url(${dataUrl}) format('${face.src.format}');}`
            : ''))
        }
      }

      const css = (await Promise.all(jobs)).filter(Boolean).join('\n')
      if (!css) remixAILogger.warn('[domCapture] no icon font could be inlined; icons will render as boxes')
      return css
    })())
  }
  return fontCssCache.get(key)
}

export async function captureElementPng(target: HTMLElement): Promise<CaptureResult> {
  if (typeof document === 'undefined') throw new Error('No DOM available in this context')

  const { toPng } = await import('html-to-image')

  const rect = target.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width || target.scrollWidth))
  const height = Math.max(1, Math.round(rect.height || target.scrollHeight))
  const backgroundColor = window.getComputedStyle(document.body).backgroundColor || undefined

  // Icon fonts are the one family worth inlining — see iconFontEmbedCSS. An
  // empty string still counts as "provided", which keeps html-to-image from
  // falling back to its own all-fonts scan.
  let fontEmbedCSS = ''
  try {
    fontEmbedCSS = await iconFontEmbedCSS(target)
  } catch (e) {
    remixAILogger.warn('[domCapture] icon font embedding failed, icons may render as boxes', e)
  }

  const scale = Math.min(window.devicePixelRatio || 1, CAPTURE_PIXEL_RATIO)
  const common = {
    width,
    height,
    backgroundColor,
    pixelRatio: scale,
    cacheBust: false,
    skipFonts: true,
    fontEmbedCSS,
    skipAutoScale: true,
    imagePlaceholder: TRANSPARENT_PIXEL
  }

  try {
    return { dataUrl: await toPng(target, { ...common, filter: baseFilter }), width, height, scale, degraded: false }
  } catch (first) {
    remixAILogger.warn('[domCapture] full capture failed, retrying without images:', describeCaptureError(first), first)
    try {
      return { dataUrl: await toPng(target, { ...common, filter: noImagesFilter }), width, height, scale, degraded: true }
    } catch (second) {
      remixAILogger.error('[domCapture] capture failed', second)
      throw new Error(describeCaptureError(second))
    }
  }
}

// Remix's own ModalDialog is a `.modal` shown with an inline `display: block`
// and kept in the DOM with `display: none` when closed — it never gets `.show`.
// react-bootstrap modals do get `.show`. Other blocking overlays (plan manager,
// desktop redirect) mark themselves aria-modal. A bare role="dialog" is not
// enough: the nudge callout uses it for a non-blocking bubble.
const OVERLAY_SELECTOR = '.modal, [role="dialog"][aria-modal="true"], [role="alertdialog"]'

function isDisplayed(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/**
 * The topmost open modal or dialog, if any. Later portals stack on top of
 * earlier ones, so the last displayed match in document order wins. A match
 * nested inside another one counts as part of it.
 */
export function findOpenOverlay(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const open = Array.from(document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR))
    .filter((el) => !el.parentElement?.closest(OVERLAY_SELECTOR) && isDisplayed(el))
  return open.length > 0 ? open[open.length - 1] : null
}

/**
 * The part of an overlay worth photographing: the dialog box itself rather
 * than the full-viewport backdrop around it.
 */
export function overlayCaptureTarget(overlay: HTMLElement): HTMLElement {
  const content = overlay.querySelector<HTMLElement>('.modal-content') || overlay.querySelector<HTMLElement>('.modal-dialog')
  return content && isDisplayed(content) ? content : overlay
}

/**
 * The element to capture when no selector is given: an open modal if there is
 * one, otherwise the IDE shell, not the raw
 * `<body>`. Serializing the whole document drags in overlays and portals and
 * makes the payload far more likely to blow past what an SVG data URL can hold.
 */
export function defaultCaptureTarget(): HTMLElement {
  // Modals are portalled onto <body>, outside the shell. While one is open it
  // is what the user is looking at, so it is captured instead — on its own it
  // is a small subtree, well inside the payload limit.
  const overlay = findOpenOverlay()
  if (overlay) return overlayCaptureTarget(overlay)

  // `[data-id="remixIdeShell"]` is the full app column rendered by
  // remix-app.tsx: top bar, the IDE row (icon bar, both side panels, main
  // panel) and the status bar, without the document-level portals and overlays
  // that hang off <body>. `remixIDE` is the row alone — it leaves the top bar
  // out, so it is only the fallback.
  return (document.querySelector('[data-id="remixIdeShell"]') ||
    document.querySelector('[data-id="remixIDE"]') ||
    document.getElementById('root') ||
    document.body) as HTMLElement
}

/** Longest edge of the preview copy kept in chat history. */
export const THUMB_EDGE = 320

/**
 * Longest edge of the full-view copy — what opens when the user clicks the
 * thumbnail. Large enough to stay sharp on a HiDPI screen, and it never
 * reaches storage: `stripAttachmentPayloads` drops it before persistence.
 */
export const PREVIEW_MAX_EDGE = 2560

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode the image'))
    img.src = src
  })

/**
 * Redraws an image at most `maxEdge` across. Returns the original data URL
 * untouched when it is already small enough, so a screenshot we just produced
 * doesn't get re-encoded for nothing.
 */
export async function downscaleDataUrl(
  dataUrl: string,
  maxEdge: number,
  mimeType = 'image/png'
): Promise<{ dataUrl: string; width: number; height: number }> {
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

/**
 * A small JPEG preview of a capture, for showing the user what was sent. JPEG
 * rather than PNG because this copy is persisted with the conversation and a
 * screenshot of an IDE compresses badly as PNG.
 */
/**
 * A full-view JPEG of a capture, for the user to open from the chat. JPEG
 * because this copy only ever gets looked at, and a PNG of an IDE at HiDPI is
 * several megabytes to hold in memory.
 */
export async function previewDataUrl(dataUrl: string): Promise<string> {
  try {
    const { dataUrl: out } = await downscaleDataUrl(dataUrl, PREVIEW_MAX_EDGE, 'image/jpeg')
    return out
  } catch (e) {
    remixAILogger.warn('[domCapture] preview failed', e)
    return ''
  }
}

export async function thumbnailDataUrl(dataUrl: string): Promise<string> {
  try {
    const { dataUrl: out } = await downscaleDataUrl(dataUrl, THUMB_EDGE, 'image/jpeg')
    return out
  } catch (e) {
    remixAILogger.warn('[domCapture] thumbnail failed', e)
    return ''
  }
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
const MARK_FONT_SIZE = 12
const MARK_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
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
    // The capture is rasterized at CAPTURE_PIXEL_RATIO device pixels per CSS
    // pixel, and a target that overflowed its rect can come back different
    // again — so derive the mapping from the image rather than assume it.
    const scaleX = img.width / Math.max(1, origin.width)
    const scaleY = img.height / Math.max(1, origin.height)

    // Badges are drawn in image space, so they have to grow with it: a 12px
    // badge on a 2× capture reads as 6px once the model-side copy is scaled
    // back down, which is the size at which a ref number stops being legible.
    const badgeScale = Math.max(1, scaleX)
    const badgeHeight = BADGE_HEIGHT * badgeScale
    const badgePad = BADGE_PAD * badgeScale

    ctx.font = `bold ${MARK_FONT_SIZE * badgeScale}px ${MARK_FONT_STACK}`
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 1.5 * badgeScale

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

      const badgeWidth = Math.ceil(ctx.measureText(mark.label).width) + badgePad * 2
      const box = placeBadge({ x, y, w: badgeWidth, h: badgeHeight }, placed, canvasBox)
      placed.push(box)

      ctx.fillStyle = MARK_COLOR
      ctx.fillRect(box.x, box.y, box.w, box.h)
      ctx.fillStyle = MARK_TEXT_COLOR
      ctx.fillText(mark.label, box.x + badgePad, box.y + badgeHeight / 2)
      drawn++
    }

    return { dataUrl: canvas.toDataURL('image/png'), drawn }
  } catch (e) {
    remixAILogger.warn('[domCapture] set-of-marks annotation failed, returning the plain capture:', describeCaptureError(e))
    return { dataUrl, drawn: 0 }
  }
}
