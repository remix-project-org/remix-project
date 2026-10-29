import { remixAILogger } from './logger'

/**
 * Quality telemetry for the agent loop — the counterpart to `modelTelemetry`,
 * which counts calls, latency and tokens but says nothing about *what* came
 * back.
 *
 * Four things degrade silently and none of them raise an error:
 *
 *  - **echo** — the model paraphrases its own input back instead of answering.
 *  - **repeat_loop** — the same tool call, or the same answer, over and over.
 *  - **context_leak** — system-prompt or skill text surfacing in the reply.
 *  - **drift** — the shape of the request or the response moving over time:
 *    a system prompt that grew, a tool list that changed (either one breaks
 *    the prompt-cache prefix), or responses getting steadily longer/slower.
 *
 * Everything here is **observation only**. Detectors are pure functions over
 * strings and numbers so they can be unit-tested without an agent, and the
 * callers that use them never let a detector failure reach the run.
 */

export type DriftSignal =
  | 'echo'
  | 'repeat_loop'
  | 'context_leak'
  | 'prompt_drift'
  | 'output_drift'

export interface DriftFinding {
  signal: DriftSignal
  /** Human-readable, content-free. Safe to log and to send to analytics. */
  detail: string
  /** The measured quantity behind the finding, when there is one. */
  value?: number
}

/* ------------------------------------------------------------------ */
/* text normalisation                                                  */
/* ------------------------------------------------------------------ */

/** Message content is a string for some providers and a block array for others. */
export function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((block: any) => (block?.type === 'text' && typeof block.text === 'string' ? block.text : ''))
      .join('\n')
  }
  return ''
}

/** Lowercase word tokens. Punctuation and whitespace carry no signal here. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

function trigrams(tokens: string[]): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i + 2 < tokens.length; i++) out.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`)
  return out
}

/**
 * Overlap of word trigrams, 0..1. Trigrams rather than single words because
 * two texts about the same contract share most of their vocabulary without
 * either one echoing the other — it takes repeated *phrasing* to score high.
 */
export function trigramJaccard(a: string, b: string): number {
  const left = trigrams(tokenize(a))
  const right = trigrams(tokenize(b))
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const gram of left) if (right.has(gram)) shared++
  return shared / (left.size + right.size - shared)
}

/* ------------------------------------------------------------------ */
/* 1. echo                                                             */
/* ------------------------------------------------------------------ */

export interface EchoOptions {
  /** Below this many characters an overlap is noise, not parroting. */
  minLength?: number
  /** Trigram overlap at or above which the output counts as echoed. */
  threshold?: number
}

export const ECHO_DEFAULTS: Required<EchoOptions> = { minLength: 200, threshold: 0.6 }

/**
 * Fires when the answer is mostly a restatement of what the model was just
 * given — either the user's own prompt or the tool result it just read.
 */
export function detectEcho(
  output: string,
  sources: { label: string; text: string }[],
  options: EchoOptions = {}
): DriftFinding | null {
  const { minLength, threshold } = { ...ECHO_DEFAULTS, ...options }
  if (!output || output.length < minLength) return null

  let worst: { label: string; ratio: number } | null = null
  for (const source of sources) {
    if (!source.text || source.text.length < minLength) continue
    const ratio = trigramJaccard(output, source.text)
    if (!worst || ratio > worst.ratio) worst = { label: source.label, ratio }
  }

  if (!worst || worst.ratio < threshold) return null
  return {
    signal: 'echo',
    detail: `output repeats ${worst.label}`,
    value: Number(worst.ratio.toFixed(3))
  }
}

/* ------------------------------------------------------------------ */
/* 2. repeat_loop                                                      */
/* ------------------------------------------------------------------ */

/**
 * Consecutive-repeat counter, keyed by whatever scope the caller picks
 * (a thread id, usually). Bounded: it only ever holds the last fingerprint
 * and a count per key, so a long session cannot grow it.
 */
export class RepeatTracker {
  private readonly last = new Map<string, { fingerprint: string; count: number }>()

  constructor(private readonly threshold = 3) {}

  /** Returns a finding the first time `fingerprint` hits `threshold` in a row. */
  push(key: string, fingerprint: string, what: string): DriftFinding | null {
    const prior = this.last.get(key)
    const count = prior && prior.fingerprint === fingerprint ? prior.count + 1 : 1
    this.last.set(key, { fingerprint, count })
    if (count !== this.threshold) return null
    return { signal: 'repeat_loop', detail: `${what} repeated identically`, value: count }
  }

  forget(key: string): void {
    this.last.delete(key)
  }

  clear(): void {
    this.last.clear()
  }
}

/** Order-stable so two equal argument objects fingerprint identically. */
export function fingerprintToolCall(name: string, args: unknown): string {
  const stable = (value: any): any => {
    if (Array.isArray(value)) return value.map(stable)
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc: any, key) => {
          acc[key] = stable(value[key])
          return acc
        }, {})
    }
    return value
  }
  try {
    return `${name}:${JSON.stringify(stable(args))}`
  } catch {
    return `${name}:<unserializable>`
  }
}

/* ------------------------------------------------------------------ */
/* 3. context_leak                                                     */
/* ------------------------------------------------------------------ */

/**
 * Strings that only ever exist inside the system prompt or inside the prompt
 * envelope the middleware strips. Any of them in a user-visible answer means
 * internal text escaped. Matched case-sensitively — these are all verbatim
 * fragments of text this repo writes itself, listed by a short name so a
 * finding never has to quote the surrounding content.
 */
export const LEAK_MARKERS: { name: string; marker: string }[] = [
  { name: 'system_prompt_opening', marker: 'Expert Web3 assistant in Remix IDE' },
  { name: 'system_prompt_concision', marker: 'CRITICAL: Be extremely concise' },
  { name: 'system_prompt_subagents', marker: 'Subagent calls are STATELESS' },
  { name: 'filesystem_tools_block', marker: '## Filesystem Tools' },
  { name: 'skills_block', marker: '## Skills System' },
  { name: 'write_todos_block', marker: '## `write_todos`' },
  { name: 'task_block', marker: '## `task`' },
  { name: 'prompt_envelope', marker: 'Context:' }
]

/**
 * The markers that are verbatim system-prompt text, as opposed to the prompt
 * envelope, which only counts in combination with `Question:`. These are the
 * ones safe to act on: no answer has a reason to contain them.
 */
const SYSTEM_LEAK_MARKERS = LEAK_MARKERS.filter(({ name }) => name !== 'prompt_envelope')

/** What the user sees, and what the thread keeps, in place of a leaked answer. */
export const CONTEXT_LEAK_NOTICE =
  '_Response withheld: it contained RemixAI\'s internal instructions. Please rephrase your request._'

/** Name of the first system-prompt marker present in `text`, or null. */
export function findSystemLeakMarker(text: string): string | null {
  if (!text) return null
  return SYSTEM_LEAK_MARKERS.find(({ marker }) => text.includes(marker))?.name ?? null
}

export function detectContextLeak(output: string): DriftFinding | null {
  if (!output) return null
  // The envelope marker alone is too common a word to trust; it only counts
  // when the matching `Question:` half is there too, which is the exact shape
  // `removePeviousContextFromMessages` strips out of the history.
  const name = findSystemLeakMarker(output) ??
    (output.includes('Context:') && output.includes('Question:') ? 'prompt_envelope' : null)
  if (!name) return null
  return { signal: 'context_leak', detail: `internal marker surfaced: ${name}` }
}

/**
 * Keeps system-prompt text off the screen while an answer streams.
 *
 * Each model run holds back the last few characters it has not yet released
 * (one shorter than the longest marker), so a marker split across chunks is
 * caught before any part of it is shown. Once a marker appears, the run is
 * blocked: the text before the marker is released, followed by
 * `CONTEXT_LEAK_NOTICE`, and every later chunk of that run is dropped.
 */
export class LeakStreamGuard {
  private readonly holdback = Math.max(...SYSTEM_LEAK_MARKERS.map(({ marker }) => marker.length)) - 1
  private readonly runs = new Map<string, { pending: string; released: string; blocked: boolean }>()

  /** Text of this chunk that is safe to show now. */
  push(runId: string, delta: string): string {
    const run = this.runs.get(runId) ?? { pending: '', released: '', blocked: false }
    this.runs.set(runId, run)
    if (run.blocked) return ''

    run.pending += delta
    const tail = run.released.slice(-this.holdback)
    const window = tail + run.pending
    const hits = SYSTEM_LEAK_MARKERS
      .map(({ marker }) => window.indexOf(marker))
      .filter((index) => index !== -1)
    if (hits.length > 0) {
      const safe = run.pending.slice(0, Math.max(0, Math.min(...hits) - tail.length))
      run.blocked = true
      run.pending = ''
      // Leaks usually arrive inside a code block; close it, or the notice
      // renders as code.
      const fences = (run.released + safe).split('```').length - 1
      return `${safe}${fences % 2 === 1 ? '\n```' : ''}\n\n${CONTEXT_LEAK_NOTICE}`
    }

    const release = run.pending.slice(0, Math.max(0, run.pending.length - this.holdback))
    run.pending = run.pending.slice(release.length)
    run.released += release
    return release
  }

  /** Releases whatever the run still holds back; call when the run ends. */
  flush(runId: string): string {
    const run = this.runs.get(runId)
    this.runs.delete(runId)
    return run && !run.blocked ? run.pending : ''
  }

  reset(): void {
    this.runs.clear()
  }
}

/* ------------------------------------------------------------------ */
/* 4. prompt_drift / output_drift                                      */
/* ------------------------------------------------------------------ */

export interface CallSample {
  /** Byte length of the rendered system prompt. */
  systemLength: number
  /** How many tools were offered this call. */
  toolCount: number
  outputLength: number
  latencyMs: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface DriftStats {
  label: string
  samples: number
  /** Running mean / variance of output length, maintained by Welford. */
  meanOutputLength: number
  m2OutputLength: number
  meanLatencyMs: number
  m2LatencyMs: number
  cacheReadTokens: number
  cacheCreationTokens: number
  findings: Record<DriftSignal, number>
}

const EMPTY_FINDINGS = (): Record<DriftSignal, number> => ({
  echo: 0,
  repeat_loop: 0,
  context_leak: 0,
  prompt_drift: 0,
  output_drift: 0
})

/** Module-level and keyed by model label, mirroring `modelTelemetry`'s `stats`. */
const driftStats = new Map<string, DriftStats>()

export function getDriftStats(): DriftStats[] {
  return Array.from(driftStats.values())
}

export function resetDriftStats(): void {
  driftStats.clear()
  promptShapes.clear()
}

function statsFor(label: string): DriftStats {
  let row = driftStats.get(label)
  if (!row) {
    row = {
      label,
      samples: 0,
      meanOutputLength: 0,
      m2OutputLength: 0,
      meanLatencyMs: 0,
      m2LatencyMs: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      findings: EMPTY_FINDINGS()
    }
    driftStats.set(label, row)
  }
  return row
}

export function countFinding(label: string, signal: DriftSignal): void {
  statsFor(label).findings[signal] += 1
}

/** Welford, so a long session needs no sample buffer at all. */
function accumulate(mean: number, m2: number, n: number, x: number): { mean: number; m2: number } {
  const delta = x - mean
  const nextMean = mean + delta / n
  return { mean: nextMean, m2: m2 + delta * (x - nextMean) }
}

function zScore(x: number, mean: number, m2: number, n: number): number {
  if (n < 2) return 0
  const sd = Math.sqrt(m2 / (n - 1))
  if (sd === 0) return 0
  return Math.abs(x - mean) / sd
}

/** Last seen request shape per thread, for the cache-prefix check. */
const promptShapes = new Map<string, { systemLength: number; toolCount: number }>()

export interface ShapeDriftOptions {
  /** Deviations below this many standard deviations are normal variation. */
  zThreshold?: number
  /** Below this many samples the mean is not worth comparing against. */
  minSamples?: number
}

export const DRIFT_DEFAULTS: Required<ShapeDriftOptions> = { zThreshold: 3, minSamples: 12 }

/**
 * Records one model call and returns whatever drifted.
 *
 * `prompt_drift` is deliberately strict: *any* change to the system-prompt
 * length or the tool count within a thread invalidates the cached prefix the
 * middleware sets a breakpoint on, so it is worth knowing about every time,
 * not just when it is statistically unusual.
 */
export function recordCall(
  label: string,
  threadId: string,
  sample: CallSample,
  options: ShapeDriftOptions = {}
): DriftFinding[] {
  const { zThreshold, minSamples } = { ...DRIFT_DEFAULTS, ...options }
  const row = statsFor(label)
  const findings: DriftFinding[] = []

  // Keyed by model too: switching models mid-thread legitimately changes the
  // prompt, and reporting that as drift would bury the real signal.
  const shapeKey = `${label}|${threadId}`
  const previousShape = promptShapes.get(shapeKey)
  if (previousShape) {
    if (previousShape.systemLength !== sample.systemLength) {
      findings.push({
        signal: 'prompt_drift',
        detail: 'system prompt length changed within the thread — cached prefix invalidated',
        value: sample.systemLength - previousShape.systemLength
      })
    } else if (previousShape.toolCount !== sample.toolCount) {
      findings.push({
        signal: 'prompt_drift',
        detail: 'tool count changed within the thread — cached prefix invalidated',
        value: sample.toolCount - previousShape.toolCount
      })
    }
  }
  promptShapes.set(shapeKey, { systemLength: sample.systemLength, toolCount: sample.toolCount })

  // Compare against the mean *before* folding this sample in, or every point
  // pulls the baseline towards itself and a slow drift never registers.
  if (row.samples >= minSamples) {
    const lengthZ = zScore(sample.outputLength, row.meanOutputLength, row.m2OutputLength, row.samples)
    if (lengthZ >= zThreshold) {
      findings.push({
        signal: 'output_drift',
        detail: 'response length departed from this model\'s baseline',
        value: Number(lengthZ.toFixed(2))
      })
    }
    const latencyZ = zScore(sample.latencyMs, row.meanLatencyMs, row.m2LatencyMs, row.samples)
    if (latencyZ >= zThreshold) {
      findings.push({
        signal: 'output_drift',
        detail: 'response latency departed from this model\'s baseline',
        value: Number(latencyZ.toFixed(2))
      })
    }
  }

  row.samples += 1
  const length = accumulate(row.meanOutputLength, row.m2OutputLength, row.samples, sample.outputLength)
  row.meanOutputLength = length.mean
  row.m2OutputLength = length.m2
  const latency = accumulate(row.meanLatencyMs, row.m2LatencyMs, row.samples, sample.latencyMs)
  row.meanLatencyMs = latency.mean
  row.m2LatencyMs = latency.m2
  row.cacheReadTokens += sample.cacheReadTokens
  row.cacheCreationTokens += sample.cacheCreationTokens

  for (const finding of findings) row.findings[finding.signal] += 1
  return findings
}

/** Shared logging shape, so every emitter prints the same thing. */
export function logFinding(label: string, threadId: string, finding: DriftFinding): void {
  remixAILogger.warn(
    `[DriftMonitor] ${finding.signal} — ${finding.detail}`,
    { model: label, threadId, value: finding.value }
  )
}
