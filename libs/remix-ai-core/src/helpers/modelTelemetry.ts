import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import type { Serialized } from '@langchain/core/load/serializable'
import type { BaseMessage } from '@langchain/core/messages'
import type { LLMResult } from '@langchain/core/outputs'
import { remixAILogger } from './logger'

/**
 * Per-provider observability for model calls.
 *
 * Replaces the previous `wrapModelForDebug`, which monkeypatched
 * `invoke` / `stream` / `streamEvents` / `_generate` on the model instance.
 * That mutated a shared object, silently broke whenever LangChain renamed an
 * internal method, and only ever logged — it could not report latency or
 * token usage, so there was no way to compare two models.
 *
 * A callback handler gets the same information through a supported hook, and
 * composes with the Langfuse handler instead of fighting it.
 *
 * Verbose per-message dumping stays behind `localStorage.AI_DEBUG = 'true'`;
 * the latency / token / error summary is always collected.
 */

export interface ModelCallStats {
  label: string
  calls: number
  errors: number
  totalLatencyMs: number
  inputTokens: number
  outputTokens: number
}

const stats = new Map<string, ModelCallStats>()

export function getModelCallStats(): ModelCallStats[] {
  return Array.from(stats.values())
}

export function resetModelCallStats(): void {
  stats.clear()
}

function bump(label: string, patch: Partial<Omit<ModelCallStats, 'label'>>): void {
  const row = stats.get(label) ?? { label, calls: 0, errors: 0, totalLatencyMs: 0, inputTokens: 0, outputTokens: 0 }
  row.calls += patch.calls ?? 0
  row.errors += patch.errors ?? 0
  row.totalLatencyMs += patch.totalLatencyMs ?? 0
  row.inputTokens += patch.inputTokens ?? 0
  row.outputTokens += patch.outputTokens ?? 0
  stats.set(label, row)
}

export function isModelDebugEnabled(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem('AI_DEBUG') === 'true'
  } catch {
    return false
  }
}

/** Content-block shape of one message, e.g. `array[3]: text,image_url,thinking`. */
function describeContent(content: any): string {
  if (typeof content === 'string') return `string(${content.length})`
  if (Array.isArray(content)) {
    return `array[${content.length}]: ${content.map((b: any) => b?.type ?? typeof b).join(',')}`
  }
  return typeof content
}

/**
 * Mistral's adapter rejects any content block that is not `text` or
 * `image_url`, and does so during message conversion — before any HTTP
 * request, so a transport-level log never sees it. Flag those blocks here.
 */
function warnOnUnsupportedBlocks(label: string, index: number, content: any): void {
  if (!Array.isArray(content)) return
  content.forEach((block: any, j: number) => {
    if (block?.type !== 'text' && block?.type !== 'image_url') {
      remixAILogger.warn(`[Model ${label}] msg[${index}] block[${j}] type=${block?.type} — unsupported by the Mistral adapter`, block)
    }
  })
}

export class RemixModelCallbackHandler extends BaseCallbackHandler {
  name = 'remix_model_telemetry'

  private readonly label: string
  private readonly startedAt = new Map<string, number>()

  constructor(label: string) {
    super()
    this.label = label
  }

  handleChatModelStart(_llm: Serialized, messages: BaseMessage[][], runId: string): void {
    this.startedAt.set(runId, Date.now())
    if (!isModelDebugEnabled()) return
    const flat = messages?.[0] ?? []
    remixAILogger.groupCollapsed(`[Model ${this.label}] → ${flat.length} message(s)`)
    flat.forEach((m, i) => {
      const role = (m as any)?._getType?.() ?? (m as any)?.role ?? 'unknown'
      remixAILogger.log(`  [${i}] role=${role} content=${describeContent(m?.content)}`)
      warnOnUnsupportedBlocks(this.label, i, m?.content)
    })
    remixAILogger.groupEnd()
  }

  handleLLMStart(_llm: Serialized, _prompts: string[], runId: string): void {
    this.startedAt.set(runId, Date.now())
  }

  handleLLMEnd(output: LLMResult, runId: string): void {
    const started = this.startedAt.get(runId)
    this.startedAt.delete(runId)
    const latencyMs = started ? Date.now() - started : 0

    // Providers disagree on where usage lands; check both known shapes.
    const usage: any =
      (output?.llmOutput as any)?.tokenUsage ??
      (output?.llmOutput as any)?.usage ??
      (output?.generations?.[0]?.[0] as any)?.message?.usage_metadata
    const inputTokens = usage?.promptTokens ?? usage?.input_tokens ?? usage?.input_tokens ?? 0
    const outputTokens = usage?.completionTokens ?? usage?.output_tokens ?? 0

    bump(this.label, { calls: 1, totalLatencyMs: latencyMs, inputTokens, outputTokens })
    if (isModelDebugEnabled()) {
      remixAILogger.log(`[Model ${this.label}] ← ${latencyMs}ms in=${inputTokens} out=${outputTokens}`)
    }
  }

  handleLLMError(error: any, runId: string): void {
    const started = this.startedAt.get(runId)
    this.startedAt.delete(runId)
    bump(this.label, { errors: 1, totalLatencyMs: started ? Date.now() - started : 0 })
    remixAILogger.error(`[Model ${this.label}] failed:`, error?.message || error)
  }
}

/** Callbacks array to hand a chat model constructor. */
export function modelCallbacks(label: string): BaseCallbackHandler[] {
  return [new RemixModelCallbackHandler(label)]
}
