import { Plugin } from '@remixproject/engine'
import { IMCPToolResult } from '../../types/mcp'
import { RemixToolDefinition, ToolCategory } from '../types/mcpTools'
import { BaseToolHandler } from '../registry/RemixToolRegistry'
import { remixAILogger } from '../../helpers/logger'
import { screenshotBuffer, screenshotMarker } from '../../inferencers/deepagent/visionBuffer'
import { captureElementPng, defaultCaptureTarget } from '../../helpers/domCapture'
import remixUiMap from '../context/remixUiMap.json'

/**
 * Lets the assistant see and drive the Remix IDE surface the user is looking at.
 *
 * This works because the assistant is a `ViewPlugin`, not an iframe: remix-ai-core
 * runs on the main thread in the same document as the editor, the panels, the
 * terminal and the icon bar. So these handlers can touch `document` directly.
 *
 * Two things it deliberately cannot do:
 *  - Cross-origin iframe plugins (every "native" plugin) are opaque. They are
 *    invisible to `inspect_ui` and rasterize blank in a screenshot.
 *  - Monaco renders imperfectly through DOM rasterization; read the file instead
 *    of screenshotting the editor.
 */

// ---------------------------------------------------------------------------
// Element ref registry
// ---------------------------------------------------------------------------

/**
 * CSS selectors the model invents are brittle and unverifiable. Instead
 * `inspect_ui` hands out short refs (`e12`) that the automation tools resolve
 * back to the exact node that was described. A ref pointing at a node that has
 * since been detached fails loudly rather than clicking the wrong thing.
 */
const elementRefs = new Map<string, Element>()
let refCounter = 0

function resetRefs(): void {
  // Dropped wholesale on every snapshot, so the map never outlives one turn
  // and cannot pin detached nodes in memory.
  elementRefs.clear()
  refCounter = 0
}

function registerRef(el: Element): string {
  const ref = `e${++refCounter}`
  elementRefs.set(ref, el)
  return ref
}

function resolveRef(ref: string): Element | null {
  const el = elementRefs.get(ref)
  if (!el || !el.isConnected) {
    elementRefs.delete(ref)
    return null
  }
  return el
}

const STALE_REF_HINT = 'Call inspect_ui again to get fresh refs — the UI has changed since the snapshot.'

// ---------------------------------------------------------------------------
// DOM snapshot
// ---------------------------------------------------------------------------

const MAX_SNAPSHOT_NODES = 400
const MAX_TEXT_LEN = 100

const INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'OPTION'])
// Compared against an upper-cased tag name: SVG elements keep their authored
// case in `tagName` ("svg", "path"), unlike HTML elements which are always
// upper-case. Matching naively would walk into every Font Awesome icon.
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'DEFS', 'BR', 'HR'])

const isSkippedTag = (el: Element): boolean => SKIPPED_TAGS.has((el.tagName || '').toUpperCase())

const TAG_TO_ROLE: Record<string, string> = {
  A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox',
  IMG: 'image', UL: 'list', OL: 'list', LI: 'listitem', TABLE: 'table',
  H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading',
  IFRAME: 'iframe', LABEL: 'label', FORM: 'form', NAV: 'navigation'
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false
  // Fully scrolled out of the viewport in either direction.
  if (rect.bottom < 0 || rect.right < 0) return false
  if (rect.top > window.innerHeight || rect.left > window.innerWidth) return false
  return true
}

function roleOf(el: Element): string {
  const explicit = el.getAttribute('role')
  if (explicit) return explicit
  const tag = el.tagName
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    if (type === 'checkbox') return 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'button' || type === 'submit') return 'button'
    return 'textbox'
  }
  return TAG_TO_ROLE[tag] || tag.toLowerCase()
}

function ownText(el: Element): string {
  let text = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent
  }
  return text.replace(/\s+/g, ' ').trim()
}

function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label')
  if (label) return label.trim()

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const target = document.getElementById(labelledBy)
    if (target) return (target.textContent || '').replace(/\s+/g, ' ').trim()
  }

  const title = el.getAttribute('title')
  if (title) return title.trim()

  const alt = el.getAttribute('alt')
  if (alt) return alt.trim()

  const placeholder = el.getAttribute('placeholder')
  if (placeholder) return placeholder.trim()

  const own = ownText(el)
  if (own) return own

  // Buttons and links are often just an icon plus a nested label.
  if (INTERACTIVE_TAGS.has(el.tagName) || el.getAttribute('role')) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim()
  }
  return ''
}

function isInteractive(el: Element): boolean {
  if (INTERACTIVE_TAGS.has(el.tagName)) return true
  if (el.hasAttribute('onclick')) return true
  if ((el as HTMLElement).isContentEditable) return true
  const role = el.getAttribute('role')
  if (role && ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch', 'option', 'combobox', 'textbox'].includes(role)) return true
  const tabIndex = el.getAttribute('tabindex')
  if (tabIndex && tabIndex !== '-1') return true
  return false
}

interface SnapshotLine {
  depth: number
  text: string
}

function describe(el: Element, interactive: boolean): string {
  const parts: string[] = [roleOf(el)]

  const name = accessibleName(el).slice(0, MAX_TEXT_LEN)
  if (name) parts.push(JSON.stringify(name))

  if (interactive) parts.push(`[ref=${registerRef(el)}]`)

  const dataId = el.getAttribute('data-id')
  if (dataId) parts.push(`data-id=${dataId}`)

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.value) parts.push(`value=${JSON.stringify(el.value.slice(0, MAX_TEXT_LEN))}`)
    if (el.disabled) parts.push('disabled')
  }
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    parts.push(el.checked ? 'checked' : 'unchecked')
  }
  if (el instanceof HTMLButtonElement && el.disabled) parts.push('disabled')
  if (el.getAttribute('aria-selected') === 'true') parts.push('selected')
  if (el.getAttribute('aria-expanded')) parts.push(`expanded=${el.getAttribute('aria-expanded')}`)
  if (el.tagName === 'IFRAME') parts.push('(cross-origin plugin — contents not visible)')

  return parts.join(' ')
}

function snapshot(root: Element): { lines: SnapshotLine[]; truncated: boolean } {
  const lines: SnapshotLine[] = []
  let truncated = false

  // `isRoot` bypasses the visibility gate for the starting node. A scoping
  // container can legitimately have a zero-size box (display:contents, a
  // wrapper whose children are absolutely positioned) while everything inside
  // it is on screen — bailing there would silently return an empty tree.
  const walk = (el: Element, depth: number, isRoot = false): void => {
    if (lines.length >= MAX_SNAPSHOT_NODES) {
      truncated = true
      return
    }
    if (isSkippedTag(el)) return
    if (!isRoot && !isVisible(el)) return

    // One malformed node must not lose the whole snapshot.
    let interactive = false
    let name = ''
    try {
      interactive = isInteractive(el)
      name = accessibleName(el)
    } catch { /* treat as an unnamed, non-interactive container */ }

    // Keep interactive nodes always; keep plain containers only when they
    // contribute a name the model can anchor on.
    const worthEmitting = !isRoot &&
      (interactive || (name.length > 0 && el.children.length === 0) || roleOf(el) === 'heading')

    let childDepth = depth
    if (worthEmitting) {
      try {
        lines.push({ depth, text: describe(el, interactive) })
        childDepth = depth + 1
      } catch { /* skip this node, keep walking */ }
    }

    // An interactive node's own label is already captured; don't re-walk into
    // its icon spans and produce a wall of noise.
    if (interactive && (el.textContent || '').length < MAX_TEXT_LEN) return

    for (const child of Array.from(el.children)) walk(child, childDepth)
  }

  walk(root, 0, true)
  return { lines, truncated }
}

function requireDom(): string | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return 'No DOM available in this context — UI tools only work in the browser/desktop IDE.'
  }
  return null
}

function ideRoot(): Element {
  // The app shell rendered by remix-app.tsx — icon bar, both side panels and
  // the main panel, without the document-level portals hanging off <body>.
  return document.querySelector('[data-id="remixIDE"]') ||
    document.getElementById('main-panel')?.parentElement ||
    document.body
}

/**
 * Resolves a model-supplied selector. Models routinely pass prose ("the side
 * panel") rather than CSS, and `querySelector` throws a DOMException on those
 * rather than returning null — so the syntax error is reported as such instead
 * of surfacing as an opaque tool failure.
 */
function resolveScope(selector?: string): { root?: Element; error?: string } {
  if (!selector) return { root: ideRoot() }
  try {
    const root = document.querySelector(selector)
    if (!root) return { error: `No element matches selector "${selector}". Omit \`selector\` to snapshot the whole IDE.` }
    return { root }
  } catch {
    return { error: `"${selector}" is not a valid CSS selector. Use a CSS selector such as '#side-panel' or '[data-id="remixIdeSidePanel"]', or omit it to snapshot the whole IDE.` }
  }
}

// ---------------------------------------------------------------------------
// inspect_ui
// ---------------------------------------------------------------------------

interface InspectUIArgs { selector?: string }

export class InspectUIHandler extends BaseToolHandler {
  name = 'inspect_ui'
  description = 'Take a structured text snapshot of what is currently visible in the Remix IDE: roles, labels, data-ids, values and a [ref=eN] handle for every interactive element. Call this before clicking or typing — click_element and type_into_element only accept refs from the most recent snapshot. Cheap: prefer this over capture_ui_screenshot unless the visual appearance itself matters. For where a feature lives in general, call get_ui_map first — it is static and answers most "where is X" questions without a snapshot.'
  inputSchema = {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'Optional CSS selector to scope the snapshot (e.g. "#side-panel"). Defaults to the whole IDE.'
      }
    },
    required: []
  }

  getPermissions(): string[] { return ['ui:read'] }

  async execute(args: InspectUIArgs, plugin: Plugin): Promise<IMCPToolResult> {
    const domError = requireDom()
    if (domError) return this.createErrorResult(domError)

    try {
      const { root, error } = resolveScope(args?.selector)
      if (error) return this.createErrorResult(error)

      resetRefs()
      const { lines, truncated } = snapshot(root)

      if (lines.length === 0) {
        return this.createSuccessResult(
          `UI snapshot of ${args?.selector || 'the Remix IDE'} is empty — nothing inside it is currently visible. ` +
          'The panel may be collapsed, or the content may live in a cross-origin plugin iframe, which cannot be inspected. ' +
          'Try get_ui_state to see which panels are open.'
        )
      }

      const body = lines.map((l) => `${'  '.repeat(l.depth)}- ${l.text}`).join('\n')
      const header = `UI snapshot (${lines.length} nodes, ${elementRefs.size} interactive refs)${truncated ? ' — TRUNCATED, narrow the scope with `selector`' : ''}:`
      return this.createSuccessResult(`${header}\n${body}`)
    } catch (e: any) {
      remixAILogger.error('[inspect_ui] failed', e)
      return this.createErrorResult(`Failed to inspect the UI: ${e?.message || e?.name || String(e)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// get_ui_map
// ---------------------------------------------------------------------------

export class GetUIMapHandler extends BaseToolHandler {
  name = 'get_ui_map'
  description = 'Return the map of the Remix IDE interface: which panel owns which capability, the plugin call that drives it, and the data-id of every significant control. Read this FIRST when a request involves finding or operating a feature in the UI — it is static, so it costs one call and saves guessing selectors or hunting through inspect_ui output. Pair it with get_ui_state for what is currently open.'
  inputSchema = {
    type: 'object',
    properties: {
      area: {
        type: 'string',
        description: 'Optional filter: a region id (topBar, iconPanel, sidePanel, mainPanel, rightSidePanel, terminal, statusBar) or a plugin name (solidity, udapp, filePanel, debugger, settings, …). Omit for the whole map.'
      }
    },
    required: []
  }

  getPermissions(): string[] { return ['ui:read'] }

  async execute(args: { area?: string }, plugin: Plugin): Promise<IMCPToolResult> {
    const map = remixUiMap as any
    if (!args?.area) return this.createSuccessResult(map)

    const area = args.area.toLowerCase()
    const region = (map.layout?.regions || []).find((r: any) => r.id?.toLowerCase() === area)
    const panel = (map.panels || []).find(
      (p: any) => p.plugin?.toLowerCase() === area || p.displayName?.toLowerCase() === area
    )

    if (!region && !panel) {
      const known = [
        ...(map.layout?.regions || []).map((r: any) => r.id),
        ...(map.panels || []).map((p: any) => p.plugin)
      ].join(', ')
      return this.createErrorResult(`No UI area named "${args.area}". Known areas: ${known}.`)
    }

    return this.createSuccessResult({
      conventions: map.conventions,
      ...(region ? { region } : {}),
      ...(panel ? { panel } : {})
    })
  }
}

// ---------------------------------------------------------------------------
// get_ui_state
// ---------------------------------------------------------------------------

export class GetUIStateHandler extends BaseToolHandler {
  name = 'get_ui_state'
  description = 'Report which parts of the Remix IDE are currently open: the focused side-panel and right-panel plugins, whether panels are hidden or maximized, the terminal state, the active file and the open editor tabs. Use this for "what am I looking at" questions — it is cheaper and more reliable than a screenshot. get_ui_map describes what each panel is for; this reports which of them are open right now.'
  inputSchema = { type: 'object', properties: {}, required: []}

  getPermissions(): string[] { return ['ui:read'] }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    const state: Record<string, any> = {}

    const safeCall = async (target: string, method: string, ...params: any[]) => {
      try {
        return await plugin.call(target as any, method as any, ...params)
      } catch {
        return undefined
      }
    }

    state.sidePanel = {
      activePlugin: await safeCall('sidePanel', 'currentFocus'),
      hidden: await safeCall('sidePanel', 'isPanelHidden')
    }
    state.rightSidePanel = {
      activePlugin: await safeCall('rightSidePanel', 'currentFocus'),
      maximized: await safeCall('rightSidePanel', 'isRightSidePanelMaximized')
    }
    state.layout = await safeCall('layout', 'getLayoutState')
    state.currentFile = await safeCall('fileManager', 'getCurrentFile')
    state.openFiles = await safeCall('fileManager', 'getOpenedFiles')

    const iconState = await safeCall('menuicons', 'getPluginState')
    if (iconState) state.iconBar = iconState

    if (typeof document !== 'undefined') {
      state.theme = document.documentElement.getAttribute('data-bs-theme') ||
        document.documentElement.getAttribute('data-theme') || undefined
      state.viewport = { width: window.innerWidth, height: window.innerHeight }
    }

    return this.createSuccessResult(state)
  }
}

// ---------------------------------------------------------------------------
// capture_ui_screenshot
// ---------------------------------------------------------------------------

interface CaptureArgs { selector?: string; reason?: string }

export class CaptureUIScreenshotHandler extends BaseToolHandler {
  name = 'capture_ui_screenshot'
  description = 'Render what is currently on screen in the Remix IDE to an image and attach it to the conversation so you can look at it. Use only when the visual appearance matters (layout, colours, a rendered DApp, a chart) — for structure and labels use inspect_ui instead, which is far cheaper. Cross-origin plugin iframes render blank and the code editor renders imperfectly.'
  inputSchema = {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'Optional CSS selector to capture just one region (e.g. "#side-panel"). Defaults to the whole IDE window.'
      },
      reason: {
        type: 'string',
        description: 'Short note on what you are trying to see. Shown to the user.'
      }
    },
    required: []
  }

  getPermissions(): string[] { return ['ui:read'] }

  async execute(args: CaptureArgs, plugin: Plugin): Promise<IMCPToolResult> {
    const domError = requireDom()
    if (domError) return this.createErrorResult(domError)

    try {
      const { root, error } = args?.selector ? resolveScope(args.selector) : { root: defaultCaptureTarget(), error: undefined }
      if (error) return this.createErrorResult(error)
      const target = root as HTMLElement

      const label = args?.selector || 'the Remix IDE'
      const { dataUrl, width, height, degraded } = await captureElementPng(target)
      const id = screenshotBuffer.put({ dataUrl, width, height, label, capturedAt: Date.now() })

      return this.createSuccessResult(
        `Screenshot of ${label} captured (${width}×${height}).` +
        (degraded ? ' Some images could not be inlined and render blank.' : '') +
        ` The image follows this message. ${screenshotMarker(id)}`
      )
    } catch (e: any) {
      remixAILogger.error('[capture_ui_screenshot] failed', e)
      return this.createErrorResult(`Failed to capture the UI: ${e?.message || e}`)
    }
  }
}

// ---------------------------------------------------------------------------
// click_element
// ---------------------------------------------------------------------------

function dispatchMouseSequence(el: Element): void {
  const rect = el.getBoundingClientRect()
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0
  }
  el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerId: 1, isPrimary: true }))
  el.dispatchEvent(new MouseEvent('mousedown', init))
  el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerId: 1, isPrimary: true }))
  el.dispatchEvent(new MouseEvent('mouseup', init))
  el.dispatchEvent(new MouseEvent('click', init))
}

interface ClickArgs { ref: string }

export class ClickElementHandler extends BaseToolHandler {
  name = 'click_element'
  description = 'Click an element in the Remix IDE by the [ref=eN] handle returned by inspect_ui. Prefer a dedicated tool or plugin API when one exists — only click when there is no other way to reach the behaviour. Always call inspect_ui first; refs from an older snapshot are rejected.'
  inputSchema = {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'Element ref from the latest inspect_ui snapshot, e.g. "e12".' }
    },
    required: ['ref']
  }

  getPermissions(): string[] { return ['ui:interact'] }

  validate(args: ClickArgs): boolean | string {
    return this.validateRequired(args, ['ref'])
  }

  async execute(args: ClickArgs, plugin: Plugin): Promise<IMCPToolResult> {
    const domError = requireDom()
    if (domError) return this.createErrorResult(domError)

    const el = resolveRef(args.ref)
    if (!el) return this.createErrorResult(`Unknown or stale ref "${args.ref}". ${STALE_REF_HINT}`)

    if ((el as HTMLButtonElement).disabled) {
      return this.createErrorResult(`Element ${args.ref} (${describe(el, false)}) is disabled and cannot be clicked.`)
    }

    try {
      el.scrollIntoView({ block: 'center', inline: 'center' })
      if (typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus()
      dispatchMouseSequence(el)
      return this.createSuccessResult(`Clicked ${describe(el, false)}. Call inspect_ui again to see the result — refs are now stale.`)
    } catch (e: any) {
      return this.createErrorResult(`Failed to click ${args.ref}: ${e?.message || e}`)
    }
  }
}

// ---------------------------------------------------------------------------
// type_into_element
// ---------------------------------------------------------------------------

/**
 * React tracks input values on the DOM node and skips `onChange` when it sees
 * a value it thinks it already set. Writing through the prototype's native
 * setter defeats that tracking, which is the only way a synthetic edit reaches
 * a controlled component.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
}

interface TypeArgs { ref: string; text: string; clear?: boolean; submit?: boolean }

export class TypeIntoElementHandler extends BaseToolHandler {
  name = 'type_into_element'
  description = 'Type text into an input, textarea or contenteditable in the Remix IDE, addressed by the [ref=eN] handle from inspect_ui. Fires the events React needs, so controlled inputs update correctly. Never use this to edit source files — use the file tools for that.'
  inputSchema = {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'Element ref from the latest inspect_ui snapshot, e.g. "e12".' },
      text: { type: 'string', description: 'Text to enter.' },
      clear: { type: 'boolean', description: 'Replace the existing value instead of appending. Defaults to true.' },
      submit: { type: 'boolean', description: 'Press Enter afterwards. Defaults to false.' }
    },
    required: ['ref', 'text']
  }

  getPermissions(): string[] { return ['ui:interact'] }

  validate(args: TypeArgs): boolean | string {
    const required = this.validateRequired(args, ['ref', 'text'])
    if (required !== true) return required
    return this.validateTypes(args, { ref: 'string', text: 'string' })
  }

  async execute(args: TypeArgs, plugin: Plugin): Promise<IMCPToolResult> {
    const domError = requireDom()
    if (domError) return this.createErrorResult(domError)

    const el = resolveRef(args.ref)
    if (!el) return this.createErrorResult(`Unknown or stale ref "${args.ref}". ${STALE_REF_HINT}`)

    const clear = args.clear !== false

    try {
      el.scrollIntoView({ block: 'center' })
      ;(el as HTMLElement).focus()

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el.disabled || el.readOnly) {
          return this.createErrorResult(`Element ${args.ref} is disabled or read-only.`)
        }
        setNativeValue(el, clear ? args.text : el.value + args.text)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else if ((el as HTMLElement).isContentEditable) {
        if (clear) (el as HTMLElement).textContent = ''
        ;(el as HTMLElement).textContent += args.text
        el.dispatchEvent(new InputEvent('input', { bubbles: true }))
      } else {
        return this.createErrorResult(`Element ${args.ref} (${describe(el, false)}) is not a text field.`)
      }

      if (args.submit) {
        const keyInit = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 } as any
        el.dispatchEvent(new KeyboardEvent('keydown', keyInit))
        el.dispatchEvent(new KeyboardEvent('keyup', keyInit))
      }

      return this.createSuccessResult(`Typed into ${describe(el, false)}.${args.submit ? ' Pressed Enter.' : ''} Call inspect_ui again to see the result.`)
    } catch (e: any) {
      return this.createErrorResult(`Failed to type into ${args.ref}: ${e?.message || e}`)
    }
  }
}

// ---------------------------------------------------------------------------
// scroll_element
// ---------------------------------------------------------------------------

interface ScrollArgs { ref?: string; selector?: string; deltaY?: number }

export class ScrollElementHandler extends BaseToolHandler {
  name = 'scroll_element'
  description = 'Scroll an element of the Remix IDE into view, or scroll a scrollable container by a pixel delta. Useful when inspect_ui reports content is out of the viewport.'
  inputSchema = {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'Element ref from the latest inspect_ui snapshot.' },
      selector: { type: 'string', description: 'CSS selector, as an alternative to ref.' },
      deltaY: { type: 'number', description: 'Pixels to scroll the container by. Omit to just scroll the element into view.' }
    },
    required: []
  }

  getPermissions(): string[] { return ['ui:read'] }

  async execute(args: ScrollArgs, plugin: Plugin): Promise<IMCPToolResult> {
    const domError = requireDom()
    if (domError) return this.createErrorResult(domError)

    let el: Element | null = null
    if (args.ref) {
      el = resolveRef(args.ref)
      if (!el) return this.createErrorResult(`Unknown or stale ref "${args.ref}". ${STALE_REF_HINT}`)
    } else if (args.selector) {
      const { root, error } = resolveScope(args.selector)
      if (error) return this.createErrorResult(error)
      el = root
    } else {
      return this.createErrorResult('Provide either a ref from inspect_ui or a CSS selector.')
    }

    if (typeof args.deltaY === 'number') {
      el.scrollBy({ top: args.deltaY })
      return this.createSuccessResult(`Scrolled by ${args.deltaY}px. Call inspect_ui again to see what is visible now.`)
    }

    el.scrollIntoView({ block: 'center' })
    return this.createSuccessResult(`Scrolled ${describe(el, false)} into view.`)
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * These tools operate on the screen the user is looking at *right now*, so they
 * belong to the main agent rather than a subagent: the element refs handed out
 * by `inspect_ui` are only useful to whoever is going to click them, and a
 * delegated round-trip just adds a turn between seeing and acting.
 * `DeepAgentInferencer` reads this list to attach them directly.
 */
export const UI_AUTOMATION_TOOL_NAMES = [
  'get_ui_map',
  'inspect_ui',
  'get_ui_state',
  'capture_ui_screenshot',
  'click_element',
  'type_into_element',
  'scroll_element'
] as const

export function createUIAutomationTools(): RemixToolDefinition[] {
  const handlers = [
    new GetUIMapHandler(),
    new InspectUIHandler(),
    new GetUIStateHandler(),
    new CaptureUIScreenshotHandler(),
    new ClickElementHandler(),
    new TypeIntoElementHandler(),
    new ScrollElementHandler()
  ]

  return handlers.map((handler) => ({
    name: handler.name,
    description: handler.description,
    inputSchema: handler.inputSchema,
    category: ToolCategory.UI,
    permissions: handler.getPermissions(),
    handler
  }))
}
