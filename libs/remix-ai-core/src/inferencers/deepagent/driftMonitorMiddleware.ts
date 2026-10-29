import type {
  AgentMiddleware,
  ModelRequest,
  ToolCallRequest,
  ToolCallHandler,
  WrapModelCallHandler
} from 'langchain'
import type { AIMessage, ToolMessage } from '@langchain/core/messages'
import type { Plugin } from '@remixproject/engine'
import { trackMatomoEvent } from '@remix-api'
import { remixAILogger } from '../../helpers/logger'
import {
  CallSample,
  DriftFinding,
  RepeatTracker,
  countFinding,
  detectContextLeak,
  detectEcho,
  extractText,
  fingerprintToolCall,
  logFinding,
  recordCall
} from '../../helpers/driftMonitor'

/**
 * Observe-only monitor for the agent loop.
 *
 * Registered **last** in the middleware array so it sees the request as it is
 * actually sent — after `RemixDeepAgentMiddleware` has stripped the context
 * envelope, rewritten the tool descriptions and placed the cache breakpoint.
 * Measuring the request before any of that would describe a prompt that never
 * leaves the browser.
 *
 * It never modifies a request, never substitutes a result, and every detector
 * runs inside a guard: a bug in here must not be able to break a run. What it
 * emits is counts and ratios — `remixAILogger` locally, Matomo in aggregate —
 * and never prompt or response text.
 *
 * Blind spot: `basic_inference()` and `structured_inference()` on
 * `DeepAgentInferencer` call the model directly and bypass the middleware
 * chain entirely. Those are covered instead by `RemixModelCallbackHandler` in
 * `helpers/modelTelemetry.ts`, which records the same shape samples from a
 * callback.
 */
export class DriftMonitorMiddleware implements AgentMiddleware {
  name = 'DriftMonitorMiddleware'

  private readonly answerRepeats = new RepeatTracker()
  private readonly toolRepeats = new RepeatTracker()

  constructor(private readonly plugin: Plugin) {}

  async wrapModelCall(request: ModelRequest, handler: WrapModelCallHandler): Promise<AIMessage> {
    const startedAt = Date.now()
    const result = await handler(request as any)

    try {
      this.inspect(request, result as AIMessage, Date.now() - startedAt)
    } catch (error) {
      // The monitor failing is not a reason for the turn to fail.
      remixAILogger.warn('[DriftMonitor] inspection failed, continuing:', error)
    }

    return result as AIMessage
  }

  // An arrow property, not a method: langchain copies `wrapToolCall` off the
  // middleware before calling it (`agents/utils.js`), so a method loses `this`.
  wrapToolCall = async (request: ToolCallRequest, handler: ToolCallHandler): Promise<ToolMessage> => {
    try {
      const fingerprint = fingerprintToolCall(request.toolCall?.name ?? 'unknown', request.toolCall?.args)
      const finding = this.toolRepeats.push(
        threadIdOf(request.runtime),
        fingerprint,
        `tool ${request.toolCall?.name ?? 'unknown'}`
      )
      if (finding) this.report(toolLabel(request), threadIdOf(request.runtime), finding)
    } catch (error) {
      remixAILogger.warn('[DriftMonitor] tool inspection failed, continuing:', error)
    }

    return handler(request as any) as Promise<ToolMessage>
  }

  /** Everything the model-call hook measures, in one place. */
  private inspect(request: ModelRequest, result: AIMessage, latencyMs: number): void {
    const label = modelLabel(request)
    const threadId = threadIdOf(request.runtime)
    const output = extractText(result?.content)

    const echo = detectEcho(output, [
      { label: 'the user prompt', text: lastMessageText(request, 'human') },
      { label: 'the last tool result', text: lastMessageText(request, 'tool') }
    ])
    if (echo) this.report(label, threadId, echo)

    const leak = detectContextLeak(output)
    if (leak) this.report(label, threadId, leak)

    // Only non-empty answers can loop; a tool-call turn carries no text and
    // would otherwise fingerprint as an endless run of empty strings.
    if (output.trim()) {
      const repeat = this.answerRepeats.push(threadId, output.trim(), 'answer')
      if (repeat) this.report(label, threadId, repeat)
    }

    for (const finding of recordCall(label, threadId, sampleOf(request, result, output, latencyMs))) {
      this.report(label, threadId, finding)
    }
  }

  private report(label: string, threadId: string, finding: DriftFinding): void {
    logFinding(label, threadId, finding)
    countFinding(label, finding.signal)
    try {
      trackMatomoEvent(this.plugin, {
        category: 'ai',
        action: 'remixAI',
        name: `drift|${finding.signal}|${label}`,
        value: finding.value ?? 1
      })
    } catch (error) {
      remixAILogger.warn('[DriftMonitor] matomo tracking failed, continuing:', error)
    }
  }
}

function modelLabel(request: ModelRequest): string {
  return (request as any)?.model?.model ?? (request as any)?.model?.modelName ?? 'unknown'
}

function toolLabel(request: ToolCallRequest): string {
  return (request as any)?.runtime?.context?.modelId ?? 'tool'
}

function threadIdOf(runtime: unknown): string {
  return (runtime as any)?.configurable?.thread_id ?? 'no-thread'
}

/** Text of the most recent message of a given role, or '' when there is none. */
function lastMessageText(request: ModelRequest, role: 'human' | 'tool'): string {
  const messages = request?.messages ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    const type = (messages[i] as any)?._getType?.() ?? (messages[i] as any)?.role
    if (type === role) return extractText(messages[i]?.content)
  }
  return ''
}

function sampleOf(request: ModelRequest, result: AIMessage, output: string, latencyMs: number): CallSample {
  // Providers disagree on where usage lands; the same two shapes
  // `modelTelemetry` already reconciles.
  const usage: any = (result as any)?.usage_metadata ?? (result as any)?.response_metadata?.usage ?? {}
  const details = usage?.input_token_details ?? {}
  return {
    systemLength: (request?.systemPrompt ?? '').length,
    toolCount: request?.tools?.length ?? 0,
    outputLength: output.length,
    latencyMs,
    inputTokens: usage?.input_tokens ?? usage?.promptTokens ?? 0,
    outputTokens: usage?.output_tokens ?? usage?.completionTokens ?? 0,
    cacheReadTokens: details?.cache_read ?? usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: details?.cache_creation ?? usage?.cache_creation_input_tokens ?? 0
  }
}
