import { remixAILogger } from '../../helpers/logger'
import { AgentMiddleware, HumanMessage, ModelRequest, ToolMessage, WrapModelCallHandler } from 'langchain'
import { imageBlock } from '../../helpers/multimodal'
import { screenshotBuffer, SCREENSHOT_MARKER_RE } from './visionBuffer'

/**
 * Makes tool-captured screenshots actually visible to the model.
 *
 * `capture_ui_screenshot` can only return text — image parts are illegal inside
 * a tool message for every OpenAI-compatible provider, and OpenRouter carries
 * all of our hosted models. So the tool returns a summary containing a
 * `[remix-screenshot:<id>]` marker and parks the PNG in `screenshotBuffer`.
 *
 * Right before each model call this middleware walks the message list, and for
 * every tool message carrying a live marker it inserts a following user message
 * holding the image. That is an ordinary multimodal user turn, so it works the
 * same on OpenRouter, Bedrock and Ollama.
 *
 * Markers whose screenshot has been evicted from the buffer are stripped, which
 * is how older screenshots quietly fall out of context.
 */
export class RemixVisionMiddleware implements AgentMiddleware {
  name = 'RemixVisionMiddleware'

  async wrapModelCall(request: ModelRequest, handler: WrapModelCallHandler) {
    try {
      attachBufferedScreenshots(request)
    } catch (e) {
      remixAILogger.warn('[RemixVisionMiddleware] failed to attach screenshots', e)
    }
    return handler(request as any)
  }
}

const isToolMessage = (msg: any): boolean => {
  const type = typeof msg?.getType === 'function' ? msg.getType() : msg?._getType?.()
  return type === 'tool' || msg?.role === 'tool'
}

/** Reads the text of a message whose content may be a block array. */
const textOf = (content: any): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((p: any) => (typeof p === 'string' ? p : p?.type === 'text' ? p.text ?? '' : '')).join('')
}

export function attachBufferedScreenshots(request: ModelRequest): void {
  const messages = request?.messages
  if (!Array.isArray(messages) || messages.length === 0) return

  const rebuilt: any[] = []
  let attached = 0

  for (const msg of messages) {
    if (!isToolMessage(msg)) {
      rebuilt.push(msg)
      continue
    }

    const text = textOf((msg as any).content)
    SCREENSHOT_MARKER_RE.lastIndex = 0
    const ids = [...text.matchAll(SCREENSHOT_MARKER_RE)].map((m) => m[1])
    if (ids.length === 0) {
      rebuilt.push(msg)
      continue
    }

    // The marker is bookkeeping, not something the model should reason about.
    // Strip it into a *copy* — mutating the original would remove the marker
    // from the graph's own state, so the image would reach the model exactly
    // once instead of staying visible until it falls out of the buffer.
    const stripped = text.replace(SCREENSHOT_MARKER_RE, '').replace(/\s{2,}/g, ' ').trim()
    rebuilt.push(new ToolMessage({
      content: stripped,
      tool_call_id: (msg as any).tool_call_id,
      name: (msg as any).name,
      status: (msg as any).status
    }))

    for (const id of ids) {
      const shot = screenshotBuffer.get(id)
      if (!shot) continue
      rebuilt.push(new HumanMessage({
        content: [
          imageBlock(shot.dataUrl),
          { type: 'text', text: `Screenshot of ${shot.label} (${shot.width}×${shot.height}).` }
        ] as any
      }))
      attached++
    }
  }

  if (attached > 0) {
    request.messages = rebuilt
    remixAILogger.log('[RemixVisionMiddleware] attached', attached, 'screenshot(s) to the model request')
  }
}
