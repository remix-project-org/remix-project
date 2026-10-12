import { remixAILogger } from '../../helpers/logger'
import { AgentMiddleware, HumanMessage, ModelRequest, ToolMessage, WrapModelCallHandler } from 'langchain'
import { imageBlock } from '../../helpers/multimodal'
import { screenshotBuffer, SCREENSHOT_MARKER_RE } from './visionBuffer'

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
  const attachedIds: string[] = []
  let attached = 0
  let markersSeen = false

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
    markersSeen = true

    // The marker is bookkeeping, not something the model should reason about.
    // Strip it into a *copy* — mutating the original would remove the marker
    // from the graph's own state, so the image would reach the model exactly
    // once instead of staying visible until it falls out of the buffer.
    const live = ids.filter((id) => !!screenshotBuffer.get(id))
    const stripped = text.replace(SCREENSHOT_MARKER_RE, '').replace(/\s{2,}/g, ' ').trim()
    const decayNote = live.length === 0
      ? ' (The image from this capture is no longer in context — call capture_ui_screenshot again if you need to look at it.)'
      : ''
    rebuilt.push(new ToolMessage({
      content: stripped + decayNote,
      tool_call_id: (msg as any).tool_call_id,
      name: (msg as any).name,
      status: (msg as any).status
    }))

    for (const id of live) {
      const shot = screenshotBuffer.get(id)
      if (!shot) continue
      rebuilt.push(new HumanMessage({
        content: [
          imageBlock(shot.dataUrl),
          { type: 'text', text: `Screenshot of ${shot.label} (${shot.width}×${shot.height}).` }
        ] as any
      }))
      attachedIds.push(id)
      attached++
    }
  }

  if (markersSeen) {
    request.messages = rebuilt
  }
  if (attached > 0) {
    remixAILogger.log('[RemixVisionMiddleware] attached', attached, 'screenshot(s) to the model request')
  }

  if (attachedIds.length > 0) screenshotBuffer.tick(attachedIds)
}
