import { remixAILogger } from '../../helpers/logger'

/**
 * Holds screenshots produced by the `capture_ui_screenshot` tool between the
 * moment the tool runs and the moment the next model call is assembled.
 *
 * Why a buffer instead of just returning the PNG from the tool: a tool result
 * becomes a `ToolMessage`, and OpenAI-compatible providers — which is every
 * model behind OpenRouter — reject image parts inside tool messages. So the
 * tool returns text carrying a marker, stashes the pixels here, and
 * `RemixVisionMiddleware` swaps the marker for a real user message holding the
 * image right after the tool result.
 *
 * Bounded on purpose: screenshots are large and every model call re-sends the
 * whole message list. Only the most recent few stay live; older ones decay to
 * the text summary the tool already returned.
 */

export interface BufferedScreenshot {
  dataUrl: string
  width: number
  height: number
  label: string
  capturedAt: number
}

/** How many screenshots stay visible to the model at once. */
const MAX_LIVE_SCREENSHOTS = 2

/** Marker the tool embeds in its text result, e.g. `[remix-screenshot:3]`. */
export const SCREENSHOT_MARKER_RE = /\[remix-screenshot:([a-z0-9-]+)\]/gi

export function screenshotMarker(id: string): string {
  return `[remix-screenshot:${id}]`
}

class ScreenshotBuffer {
  private entries = new Map<string, BufferedScreenshot>()
  private counter = 0

  /** Stores a screenshot and returns the id to embed in the tool's text result. */
  put(shot: BufferedScreenshot): string {
    const id = `s${++this.counter}`
    this.entries.set(id, shot)
    while (this.entries.size > MAX_LIVE_SCREENSHOTS) {
      const oldest = this.entries.keys().next().value
      this.entries.delete(oldest)
      remixAILogger.log('[ScreenshotBuffer] evicted screenshot', oldest)
    }
    return id
  }

  get(id: string): BufferedScreenshot | undefined {
    return this.entries.get(id)
  }

  clear(): void {
    this.entries.clear()
  }
}

export const screenshotBuffer = new ScreenshotBuffer()
