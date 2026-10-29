import type {
  AgentMiddleware,
  ModelRequest,
  ToolCallRequest,
  ToolCallHandler,
  WrapModelCallHandler
} from 'langchain'
import { HumanMessage, ToolMessage } from 'langchain'
import type { AIMessage } from '@langchain/core/messages'
import type { Plugin } from '@remixproject/engine'
import { trackMatomoEvent } from '@remix-api'
import { remixAILogger } from '../../helpers/logger'
import { DriftMode, getDriftMode } from '../../helpers/driftActions'
import {
  CallSample,
  DriftFinding,
  ECHO_RETRY_NOTE,
  REPEATED_ANSWER_NOTE,
  RULES_REMINDER,
  RepeatTracker,
  ToolLoopGuard,
  countFinding,
  detectContextLeak,
  detectEcho,
  detectInstructionDrift,
  duplicateToolCallNote,
  extractText,
  hashText,
  logFinding,
  recordCall,
  stopToolLoopNote,
  stripPromptEnvelope
} from '../../helpers/driftMonitor'
import { cachedPrefixParts } from './deepAgentMiddleWare'

/** Repeated calls from here on get the hard stop instead of the duplicate note. */
const TOOL_LOOP_STOP_AT = 4
/** Main-agent user turns between two reminders of the standing rules. */
const REMIND_EVERY_TURNS = 8
const WRITE_TOOLS = new Set(['write_file', 'edit_file'])

export interface DriftMonitorOptions {
  /** For Matomo. Absent in evals, which only read `getDriftStats()`. */
  plugin?: Plugin
  /**
   * `main` gets every countermeasure. A `subagent` instance only guards tool
   * loops and measures: its answers go to the main agent, not the user, and
   * its threads are a single task long.
   */
  role: 'main' | 'subagent'
  /**
   * Lets an echo retry take back what the first attempt already streamed.
   * `request` is called before the retry, `cancel` if the retry fails.
   */
  retraction?: { request(): void; cancel(): void }
  /** A model entering (`true`) or leaving (`false`) sustained degradation. */
  onDegradation?: (label: string, degraded: boolean, detail: string) => void
}

interface ThreadState {
  userTurns: number
  lastReminderTurn: number
  remindedAfterSummary: boolean
  wroteFileThisTurn: boolean
  echoRetriedThisTurn: boolean
  /** Notes to add to the next user turn, de-duplicated. */
  pendingNotes: Set<string>
}

/**
 * Drift monitor for the agent loop, and the countermeasures that act on it.
 *
 * Innermost `wrapModelCall` in the stack, so it sees the request exactly as it
 * is sent — after `RemixDeepAgentMiddleware` has stripped the context envelope,
 * rewritten the tool descriptions and placed the cache breakpoint, and after
 * `RemixVisionMiddleware` attached screenshots — and so a retry it makes goes
 * straight to the model.
 *
 * What it does about a finding depends on `getDriftMode()`: in `observe`
 * nothing changes but the reporting; in `act`
 *  - a duplicate tool call is answered with a note instead of being run, and
 *    a persistent loop is told to stop;
 *  - an answer that echoes its input is retried once with a correction;
 *  - a repeated answer, or one that breaks a standing rule, makes the next
 *    turn carry a note — added to the request only, never to the thread;
 *  - the standing rules are re-stated every few turns and after the history
 *    is summarised.
 *
 * Every detector and countermeasure runs inside a guard: a bug in here must
 * not be able to break a run. What it emits is counts and ratios —
 * `remixAILogger` locally, Matomo in aggregate — never prompt or answer text.
 *
 * Arrow properties rather than methods: langchain copies hooks off the
 * middleware before calling them, which loses `this` on a method.
 */
export class DriftMonitorMiddleware implements AgentMiddleware {
  name = 'DriftMonitorMiddleware'

  private readonly answerRepeats = new RepeatTracker(2)
  private readonly toolLoops = new ToolLoopGuard(TOOL_LOOP_STOP_AT)
  private readonly threads = new Map<string, ThreadState>()
  private lastLabel = 'unknown'

  constructor(private readonly options: DriftMonitorOptions) {}

  wrapModelCall = async (request: ModelRequest, handler: WrapModelCallHandler): Promise<AIMessage> => {
    const mode = getDriftMode()
    if (mode === 'off') return handler(request as any) as Promise<AIMessage>

    const threadId = threadIdOf(request.runtime)
    let sent: ModelRequest = request
    try {
      if (lastMessageRole(request) === 'human') {
        this.startTurn(threadId, request, mode)
        if (mode === 'act') sent = this.withPendingNotes(threadId, request)
      }
    } catch (error) {
      remixAILogger.warn('[DriftMonitor] turn preparation failed, continuing:', error)
    }

    const startedAt = Date.now()
    let result = (await handler(sent as any)) as AIMessage

    let echo: DriftFinding | null = null
    try {
      echo = this.inspect(request, result, Date.now() - startedAt, mode)
    } catch (error) {
      // The monitor failing is not a reason for the turn to fail.
      remixAILogger.warn('[DriftMonitor] inspection failed, continuing:', error)
    }

    const thread = this.threadFor(threadId, request)
    if (echo && mode === 'act' && this.options.role === 'main' && !hasToolCalls(result) && !thread.echoRetriedThisTurn) {
      thread.echoRetriedThisTurn = true
      this.options.retraction?.request()
      try {
        const retryStartedAt = Date.now()
        const retried = (await handler(withTrailingNote(sent, ECHO_RETRY_NOTE) as any)) as AIMessage
        remixAILogger.warn('[DriftMonitor] echo — retried the answer once with a correction')
        try {
          this.inspect(request, retried, Date.now() - retryStartedAt, mode, { retry: true })
        } catch (error) {
          remixAILogger.warn('[DriftMonitor] inspection failed, continuing:', error)
        }
        result = retried
      } catch (error) {
        this.options.retraction?.cancel()
        remixAILogger.warn('[DriftMonitor] echo retry failed, keeping the first answer:', error)
      }
    }

    return result
  }

  wrapToolCall = async (request: ToolCallRequest, handler: ToolCallHandler): Promise<ToolMessage> => {
    const mode = getDriftMode()
    if (mode !== 'off') {
      try {
        const name = request.toolCall?.name ?? 'unknown'
        const threadId = threadIdOf(request.runtime)
        const thread = this.threads.get(threadId)
        if (thread && WRITE_TOOLS.has(name)) thread.wroteFileThisTurn = true

        const verdict = this.toolLoops.check(threadId, name, request.toolCall?.args)
        if (verdict.action !== 'run') {
          // Once when the loop starts and once when it turns into a hard stop,
          // not on every call in between.
          if (verdict.count === 2 || verdict.count === TOOL_LOOP_STOP_AT) {
            this.report(this.lastLabel, threadId, verdict.finding, mode)
          }
          if (mode === 'act') {
            return new ToolMessage({
              content: verdict.action === 'stop' ? stopToolLoopNote(name) : duplicateToolCallNote(name),
              tool_call_id: request.toolCall?.id ?? '',
              name
            })
          }
        }
      } catch (error) {
        remixAILogger.warn('[DriftMonitor] tool inspection failed, continuing:', error)
      }
    }

    return handler(request as any) as Promise<ToolMessage>
  }

  private threadFor(threadId: string, request: ModelRequest): ThreadState {
    let thread = this.threads.get(threadId)
    if (!thread) {
      const userTurns = countUserTurns(request)
      thread = {
        userTurns,
        // A thread restored from a checkpoint is not reminded straight away.
        lastReminderTurn: userTurns,
        remindedAfterSummary: false,
        wroteFileThisTurn: false,
        echoRetriedThisTurn: false,
        pendingNotes: new Set()
      }
      this.threads.set(threadId, thread)
    }
    return thread
  }

  /** A model call whose last message is the user's: a new turn begins. */
  private startTurn(threadId: string, request: ModelRequest, mode: DriftMode): void {
    const thread = this.threadFor(threadId, request)
    // The user may have changed the workspace since the last turn, so the
    // same read is legitimate again.
    this.toolLoops.forget(threadId)
    thread.wroteFileThisTurn = false
    thread.echoRetriedThisTurn = false
    thread.userTurns = countUserTurns(request)

    if (this.options.role !== 'main' || mode !== 'act') return
    const summarised = (request?.messages ?? []).some(isSummaryMessage)
    if (summarised && !thread.remindedAfterSummary) {
      thread.remindedAfterSummary = true
      thread.lastReminderTurn = thread.userTurns
      thread.pendingNotes.add(RULES_REMINDER)
    } else if (thread.userTurns - thread.lastReminderTurn >= REMIND_EVERY_TURNS) {
      thread.lastReminderTurn = thread.userTurns
      thread.pendingNotes.add(RULES_REMINDER)
    }
  }

  private withPendingNotes(threadId: string, request: ModelRequest): ModelRequest {
    const thread = this.threads.get(threadId)
    if (!thread || thread.pendingNotes.size === 0) return request
    const notes = Array.from(thread.pendingNotes)
    thread.pendingNotes.clear()
    remixAILogger.log(`[DriftMonitor] adding ${notes.length} note(s) to this turn`)
    return withNotesOnLastUserMessage(request, notes)
  }

  /** Everything the model-call hook measures, in one place. Returns the echo finding, if any. */
  private inspect(
    request: ModelRequest,
    result: AIMessage,
    latencyMs: number,
    mode: DriftMode,
    { retry = false }: { retry?: boolean } = {}
  ): DriftFinding | null {
    const label = modelLabel(request)
    this.lastLabel = label
    const threadId = threadIdOf(request.runtime)
    const output = extractText(result?.content)
    const answerTurn = !hasToolCalls(result) && output.trim().length > 0
    const main = this.options.role === 'main'

    const echo = answerTurn
      ? detectEcho(output, [
        { label: 'the user prompt', text: stripPromptEnvelope(lastMessageText(request, 'human')) },
        { label: 'the last tool result', text: lastMessageText(request, 'tool') }
      ])
      : null
    if (echo) this.report(label, threadId, echo, mode)

    const leak = detectContextLeak(output)
    if (leak) this.report(label, threadId, leak, mode)

    if (main && answerTurn && !retry) {
      const thread = this.threads.get(threadId)
      const repeat = this.answerRepeats.push(threadId, output.trim(), 'answer')
      if (repeat) {
        this.report(label, threadId, repeat, mode)
        if (mode === 'act') thread?.pendingNotes.add(REPEATED_ANSWER_NOTE)
      }
      const broken = detectInstructionDrift(output, { wroteFileThisTurn: !!thread?.wroteFileThisTurn })
      if (broken) {
        this.report(label, threadId, broken, mode)
        if (mode === 'act') thread?.pendingNotes.add(RULES_REMINDER)
      }
    }

    for (const finding of recordCall(label, threadId, sampleOf(request, result, output, latencyMs, answerTurn))) {
      this.report(label, threadId, finding, mode, { counted: true })
      if (finding.degraded !== undefined) this.options.onDegradation?.(label, finding.degraded, finding.detail)
    }
    return echo
  }

  private report(
    label: string,
    threadId: string,
    finding: DriftFinding,
    mode: DriftMode,
    { counted = false }: { counted?: boolean } = {}
  ): void {
    logFinding(label, threadId, finding)
    // `recordCall` counts the findings it returns itself.
    if (!counted) countFinding(label, finding.signal)
    if (!this.options.plugin) return
    try {
      trackMatomoEvent(this.options.plugin, {
        category: 'ai',
        action: 'remixAI',
        name: `drift|${finding.signal}|${label}|${mode}`,
        value: finding.value ?? 1
      } as any)
    } catch (error) {
      remixAILogger.warn('[DriftMonitor] matomo tracking failed, continuing:', error)
    }
  }
}

function modelLabel(request: ModelRequest): string {
  return (request as any)?.model?.model ?? (request as any)?.model?.modelName ?? 'unknown'
}

function threadIdOf(runtime: unknown): string {
  const r = runtime as any
  return r?.configurable?.thread_id ?? r?.config?.configurable?.thread_id ?? 'no-thread'
}

function roleOf(message: any): string {
  return message?._getType?.() ?? message?.getType?.() ?? message?.role ?? ''
}

function lastMessageRole(request: ModelRequest): string {
  const messages = request?.messages ?? []
  return messages.length ? roleOf(messages[messages.length - 1]) : ''
}

function isSummaryMessage(message: any): boolean {
  return message?.additional_kwargs?.lc_source === 'summarization'
}

function countUserTurns(request: ModelRequest): number {
  return (request?.messages ?? []).filter((m: any) => roleOf(m) === 'human' && !isSummaryMessage(m)).length
}

function hasToolCalls(result: AIMessage): boolean {
  return Array.isArray((result as any)?.tool_calls) && (result as any).tool_calls.length > 0
}

/** Text of the most recent message of a given role, or '' when there is none. */
function lastMessageText(request: ModelRequest, role: 'human' | 'tool'): string {
  const messages = request?.messages ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    if (roleOf(messages[i]) === role) return extractText(messages[i]?.content)
  }
  return ''
}

/**
 * The notes ride on the user's own message rather than as a message of their
 * own: two user messages in a row, or a system message mid-conversation, are
 * rejected by some providers. The thread state keeps the original message.
 */
function withNotesOnLastUserMessage(request: ModelRequest, notes: string[]): ModelRequest {
  const messages = request.messages
  const last: any = messages[messages.length - 1]
  const note = `\n\n(${notes.join(' ')})`
  const content = typeof last.content === 'string'
    ? last.content + note
    : [...last.content, { type: 'text', text: note.trim() }]
  const replaced = new HumanMessage({ content, id: last.id, name: last.name, additional_kwargs: last.additional_kwargs })
  return { ...request, messages: [...messages.slice(0, -1), replaced]} as ModelRequest
}

/** A retry follows a tool result or the user's message, so the note is its own user message. */
function withTrailingNote(request: ModelRequest, note: string): ModelRequest {
  if (lastMessageRole(request) === 'human') return withNotesOnLastUserMessage(request, [note])
  return { ...request, messages: [...request.messages, new HumanMessage(note)]} as ModelRequest
}

function sampleOf(request: ModelRequest, result: AIMessage, output: string, latencyMs: number, answerTurn: boolean): CallSample {
  // Providers disagree on where usage lands; the same two shapes
  // `modelTelemetry` already reconciles.
  const usage: any = (result as any)?.usage_metadata ?? (result as any)?.response_metadata?.usage ?? {}
  const details = usage?.input_token_details ?? {}
  const systemContent = (request as any)?.systemMessage?.content
  const systemText = Array.isArray(systemContent)
    ? cachedPrefixParts(systemContent).map((part: any) => part?.text ?? '').join('\n')
    : (request?.systemPrompt ?? '')
  const toolsText = (request?.tools ?? []).map((tool: any) => `${tool?.name}:${tool?.description ?? ''}`).join('|')
  return {
    systemHash: systemText ? hashText(systemText) : '',
    toolsHash: toolsText ? hashText(toolsText) : '',
    answerTurn,
    outputLength: output.length,
    latencyMs,
    inputTokens: usage?.input_tokens ?? usage?.promptTokens ?? 0,
    outputTokens: usage?.output_tokens ?? usage?.completionTokens ?? 0,
    cacheReadTokens: details?.cache_read ?? usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: details?.cache_creation ?? usage?.cache_creation_input_tokens ?? 0
  }
}
