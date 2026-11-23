import { AIMessage } from 'langchain'
import type { AgentMiddleware, ModelRequest, WrapModelCallHandler } from 'langchain'
import { remixAILogger } from '../../helpers/logger'
import { CONTEXT_LEAK_NOTICE, extractText, findSystemLeakMarker } from '../../helpers/driftMonitor'

/**
 * Countermeasure for `context_leak`: an answer that quotes the system prompt
 * is replaced before it reaches the thread state, so the leaked text is not
 * stored in the checkpoint and replayed into every later turn. What already
 * streamed to the UI is handled by the `LeakStreamGuard` in StreamEventHandler.
 *
 * Registered before DriftMonitorMiddleware, so the monitor — nested inside
 * this one — still measures and reports the original answer.
 */
export class ContextLeakGuardMiddleware implements AgentMiddleware {
  name = 'ContextLeakGuardMiddleware'

  async wrapModelCall(request: ModelRequest, handler: WrapModelCallHandler): Promise<AIMessage> {
    const result = (await handler(request as any)) as AIMessage

    try {
      const marker = findSystemLeakMarker(extractText(result?.content))
      if (!marker) return result

      remixAILogger.warn(`[ContextLeakGuard] answer quoted internal text (${marker}), replaced before it reaches the thread`)
      return new AIMessage({
        id: result.id,
        name: result.name,
        content: redactContent(result.content),
        tool_calls: result.tool_calls,
        invalid_tool_calls: result.invalid_tool_calls,
        usage_metadata: result.usage_metadata,
        response_metadata: result.response_metadata
      })
    } catch (error) {
      remixAILogger.warn('[ContextLeakGuard] redaction failed, keeping the original answer:', error)
      return result
    }
  }
}

/**
 * Block arrays keep their non-text blocks: thinking blocks carry signatures
 * some providers require on the next turn, and tool-use blocks must match
 * `tool_calls`. Only the text is swapped for the notice.
 */
function redactContent(content: AIMessage['content']): AIMessage['content'] {
  if (!Array.isArray(content)) return CONTEXT_LEAK_NOTICE

  let replaced = false
  return content.flatMap((block: any) => {
    if (block?.type !== 'text') return [block]
    if (replaced) return []
    replaced = true
    return [{ type: 'text', text: CONTEXT_LEAK_NOTICE }]
  }) as AIMessage['content']
}
