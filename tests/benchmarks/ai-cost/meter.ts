import type { Page } from '@playwright/test'

/**
 * Measures what a workflow cost on the signed-in pool account.
 *
 * The backend does not return a cost per request, only an aggregated usage
 * report (`GET /credits/usage`, day granularity) and a balance. A pool account
 * is held exclusively by one test, so "today's totals after" minus "today's
 * totals before" is the cost of what ran in between.
 */

export interface UsageSnapshot {
  day: string
  credits: number
  costUsd: number
  calls: number
  promptTokens: number
  completionTokens: number
  cacheReadTokens: number
  balance: number | null
  /** Client-side counters from window.__remixAI (AI_DEBUG), for latency and tokens. */
  modelCalls: { calls: number; inputTokens: number; outputTokens: number; latencyMs: number }
}

export interface UsageDelta {
  credits: number
  costUsd: number
  calls: number
  promptTokens: number
  completionTokens: number
  cacheReadTokens: number
  /** Balance change; null when the balance is not debited (e.g. unlimited plans). */
  balanceDelta: number | null
  clientCalls: number
  clientInputTokens: number
  clientOutputTokens: number
}

export async function snapshot(page: Page): Promise<UsageSnapshot> {
  return page.evaluate(async () => {
    const day = new Date().toISOString().slice(0, 10)
    const plugin = (window as any).getRemixAIPlugin
    const api = await plugin.call('auth', 'getCreditsApi')
    const usage = await api.getUsageReport({ from: day, to: day, groupBy: ['day']})
    if (!usage?.ok) throw new Error(`usage report failed: ${usage?.status} ${usage?.error ?? ''}`)
    const totals = usage.data?.totals ?? {}
    const balance = await api.getBalance().catch(() => null)

    const stats: any[] = (window as any).__remixAI?.getModelCallStats?.() ?? []
    const modelCalls = stats.reduce(
      (sum, row) => ({
        calls: sum.calls + (row.calls ?? 0),
        inputTokens: sum.inputTokens + (row.inputTokens ?? 0),
        outputTokens: sum.outputTokens + (row.outputTokens ?? 0),
        latencyMs: sum.latencyMs + (row.totalLatencyMs ?? 0)
      }),
      { calls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0 }
    )

    return {
      day,
      credits: totals.credits ?? 0,
      costUsd: totals.cost_usd ?? 0,
      calls: totals.calls ?? 0,
      promptTokens: totals.prompt_tokens ?? 0,
      completionTokens: totals.completion_tokens ?? 0,
      cacheReadTokens: totals.cache_read_tokens ?? 0,
      balance: balance?.ok ? balance.data?.balance ?? null : null,
      modelCalls
    }
  })
}

function diff(before: UsageSnapshot, after: UsageSnapshot): UsageDelta {
  return {
    credits: after.credits - before.credits,
    costUsd: after.costUsd - before.costUsd,
    calls: after.calls - before.calls,
    promptTokens: after.promptTokens - before.promptTokens,
    completionTokens: after.completionTokens - before.completionTokens,
    cacheReadTokens: after.cacheReadTokens - before.cacheReadTokens,
    balanceDelta: before.balance !== null && after.balance !== null ? before.balance - after.balance : null,
    clientCalls: after.modelCalls.calls - before.modelCalls.calls,
    clientInputTokens: after.modelCalls.inputTokens - before.modelCalls.inputTokens,
    clientOutputTokens: after.modelCalls.outputTokens - before.modelCalls.outputTokens
  }
}

/** 10,000 credits = $1 — the conversion ai-usage bills an upstream cost with. */
const CREDITS_PER_USD = 10_000

export interface ResponseCost {
  /** Credits billed from upstream cost: ceil(cost × 10,000) per call, as the proxy does. */
  credits: number
  costUsd: number
  calls: number
  /** Calls whose response carried no `usage.cost` (e.g. Bedrock, or a failed call). */
  uncosted: number
  /**
   * The model that actually answered each call, from the response's `model`
   * field. Differs from the selection under Auto (`openrouter/auto-beta`
   * routes per request) and when OpenRouter fell back to a `models` entry.
   */
  servedModels: Record<string, { calls: number; credits: number }>
}

/**
 * Reads the charge from the AI responses themselves. The langchain proxy
 * forwards OpenRouter's body untouched, and OpenRouter reports what each call
 * cost on `usage.cost` (the client asks for it with `usage: { include: true }`).
 * Independent of the backend's usage tables, so it still works when the usage
 * report is broken.
 *
 * It is the upstream cost: ai-usage bills a model from its pricing table when
 * one matches, which can differ. Prefer the usage report when it is available.
 */
export class ResponseCostMeter {
  private readonly pending: Promise<void>[] = []
  private total: ResponseCost = { credits: 0, costUsd: 0, calls: 0, uncosted: 0, servedModels: {} }

  constructor(page: Page) {
    page.on('response', (response) => {
      if (!/\/ai\/langchain\/openrouter\/.*completions/.test(response.url())) return
      if (response.request().method() !== 'POST') return
      this.pending.push(response.text().then((body) => this.add(body), () => {
        this.total.calls += 1
        this.total.uncosted += 1
      }))
    })
  }

  private add(body: string): void {
    // Streamed bodies are SSE `data: {…}` lines; the usage chunk comes last.
    // A non-streamed body is one JSON object.
    const chunks = body.includes('data:')
      ? body.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim())
      : [body]
    let cost: number | null = null
    let model: string | null = null
    for (const chunk of chunks) {
      if (!chunk || chunk === '[DONE]') continue
      try {
        const parsed = JSON.parse(chunk)
        if (typeof parsed?.model === 'string' && parsed.model) model = parsed.model
        const usage = parsed?.usage
        if (typeof usage?.cost !== 'number') continue
        // With BYOK `cost` is only OpenRouter's fee; the inference is upstream_inference_cost.
        cost = usage.is_byok === true ? usage.cost + Number(usage.cost_details?.upstream_inference_cost ?? 0) : usage.cost
      } catch { /* keep-alive comments and partial lines */ }
    }
    this.total.calls += 1
    const served = (this.total.servedModels[model ?? 'unknown'] ??= { calls: 0, credits: 0 })
    served.calls += 1
    if (cost === null) {
      this.total.uncosted += 1
      return
    }
    const credits = Math.ceil(cost * CREDITS_PER_USD)
    this.total.costUsd += cost
    this.total.credits += credits
    served.credits += credits
  }

  /** Everything seen so far, once the bodies still being read have arrived. */
  async read(): Promise<ResponseCost> {
    await Promise.all(this.pending)
    return { ...this.total, servedModels: structuredClone(this.total.servedModels) }
  }
}

/**
 * Usage is aggregated asynchronously, so the totals can lag the last call.
 * Polls until two consecutive reads agree (or `maxWaitMs` passes) and returns
 * the cost since `before`. Throws if the UTC day changed in between: the
 * report is per day, so a run across midnight cannot be measured.
 */
export async function settle(page: Page, before: UsageSnapshot, { maxWaitMs = 120_000, intervalMs = 10_000 } = {}): Promise<UsageDelta> {
  const deadline = Date.now() + maxWaitMs
  let previous = await snapshot(page)
  while (Date.now() < deadline) {
    await page.waitForTimeout(intervalMs)
    const current = await snapshot(page)
    if (current.day !== before.day) throw new Error('UTC day changed during the run — usage cannot be measured; re-run')
    // Two equal reads only mean "settled" once something was recorded;
    // before that, they mean the report has not caught up yet.
    const recorded = current.calls > before.calls
    if (recorded && current.credits === previous.credits && current.calls === previous.calls) return diff(before, current)
    previous = current
  }
  return diff(before, previous)
}
