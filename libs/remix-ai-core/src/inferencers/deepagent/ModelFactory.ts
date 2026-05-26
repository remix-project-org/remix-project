import { ChatAnthropic } from '@langchain/anthropic'
import { ChatMistralAI } from '@langchain/mistralai'
import { ChatOpenAI } from '@langchain/openai'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HTTPClient } from '@mistralai/mistralai/lib/http.js'
import { endpointUrls } from '@remix-endpoints-helper'
import { ModelSelection, IUserApiKeyConfig } from '../../types/deepagent'
import { DAPP_MAX_TOKENS } from './constants'
import { getRemixAuthHeader } from '../auth'

const AI_DEBUG = (() => {
  try { return typeof window !== 'undefined' && window.localStorage?.getItem('AI_DEBUG') === 'true' } catch { return false }
})()

/**
 * fetch wrapper that injects the user's Remix bearer token on every request.
 * Reads the token fresh from localStorage so login/logout takes effect
 * without rebuilding the cached ChatAnthropic instance.
 */
const authedFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers || {})
  const auth = getRemixAuthHeader()
  if (auth.Authorization) {
    // Always overwrite: the langchain client may have stamped a placeholder
    // 'Authorization: Bearer proxy-handled' from the dummy apiKey we pass in.
    headers.set('Authorization', auth.Authorization)
  }
  return fetch(input as any, { ...init, headers })
}

/**
 * Moonshot (Kimi) thinking models require that every assistant message
 * containing `tool_calls` in the request history also carries the original
 * `reasoning_content` returned by the model. LangChain's ChatOpenAI captures
 * `reasoning_content` from streamed deltas into `additional_kwargs`, but its
 * outbound serializer (convertMessagesToCompletionsMessageParams) does NOT
 * re-emit it. Without this, the second turn fails with:
 *   "thinking is enabled but reasoning_content is missing in assistant tool
 *    call message at index N"
 *
 * Workaround: a fetch wrapper that
 *  - tees the streamed SSE response, accumulates `reasoning_content` per
 *    assistant turn, and caches it keyed by the resulting tool_call ids;
 *  - on outbound requests, walks `body.messages` and stamps the cached
 *    `reasoning_content` onto matching assistant tool_call messages.
 */
const moonshotReasoningByToolCallKey = new Map<string, string>()
const MOONSHOT_REASONING_CACHE_MAX = 200

function moonshotToolCallKey(toolCalls: any[]): string {
  const ids = toolCalls
    .map((tc) => tc?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .sort()
  return ids.join('|')
}

function cacheMoonshotReasoning(key: string, reasoning: string): void {
  if (!key || !reasoning) return
  if (moonshotReasoningByToolCallKey.size >= MOONSHOT_REASONING_CACHE_MAX) {
    const firstKey = moonshotReasoningByToolCallKey.keys().next().value
    if (firstKey !== undefined) moonshotReasoningByToolCallKey.delete(firstKey)
  }
  moonshotReasoningByToolCallKey.set(key, reasoning)
}

async function captureMoonshotReasoningFromSSE(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let reasoning = ''
  const toolCallsByIndex: Record<number, { id?: string }> = {}
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const delta = json?.choices?.[0]?.delta
          if (!delta) continue
          if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = typeof tc?.index === 'number' ? tc.index : 0
              if (!toolCallsByIndex[idx]) toolCallsByIndex[idx] = {}
              if (typeof tc?.id === 'string' && tc.id) toolCallsByIndex[idx].id = tc.id
            }
          }
        } catch {
          /* not JSON, ignore */
        }
      }
    }
    const ids = Object.values(toolCallsByIndex)
      .map((t) => t.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (ids.length > 0 && reasoning.length > 0) {
      cacheMoonshotReasoning(ids.sort().join('|'), reasoning)
      if (AI_DEBUG) console.log('[Moonshot←] cached reasoning_content for tool_calls', ids, `(${reasoning.length} chars)`)
    }
  } catch (e) {
    if (AI_DEBUG) console.warn('[Moonshot←] capture failed', e)
  }
}

function injectMoonshotReasoning(bodyText: string): string {
  try {
    const body = JSON.parse(bodyText)
    if (!Array.isArray(body?.messages)) return bodyText
    let mutated = false
    for (const m of body.messages) {
      if (
        m &&
        m.role === 'assistant' &&
        Array.isArray(m.tool_calls) &&
        m.tool_calls.length > 0 &&
        (m.reasoning_content === undefined || m.reasoning_content === null)
      ) {
        const key = moonshotToolCallKey(m.tool_calls)
        const cached = key ? moonshotReasoningByToolCallKey.get(key) : undefined
        // Moonshot validates presence; supply a single-space fallback when we
        // don't have the original (e.g. cache miss across page reload).
        m.reasoning_content = cached ?? ' '
        mutated = true
        if (AI_DEBUG) console.log('[Moonshot→] injected reasoning_content', { key, fromCache: !!cached })
      }
    }
    return mutated ? JSON.stringify(body) : bodyText
  } catch {
    return bodyText
  }
}

const moonshotFetch: typeof fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers || {})
  const auth = getRemixAuthHeader()
  if (auth.Authorization) headers.set('Authorization', auth.Authorization)

  let nextInit: RequestInit = { ...init, headers }
  if (typeof nextInit.body === 'string') {
    nextInit = { ...nextInit, body: injectMoonshotReasoning(nextInit.body) }
  }

  const response = await fetch(input as any, nextInit)
  const ct = response.headers.get('content-type') || ''
  if (response.ok && response.body && ct.includes('event-stream')) {
    const [a, b] = response.body.tee()
    void captureMoonshotReasoningFromSSE(b)
    return new Response(a, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
  }
  if (response.ok && ct.includes('application/json')) {
    response
      .clone()
      .json()
      .then((json) => {
        const msg = json?.choices?.[0]?.message
        if (msg?.tool_calls?.length && typeof msg.reasoning_content === 'string') {
          const key = moonshotToolCallKey(msg.tool_calls)
          if (key) cacheMoonshotReasoning(key, msg.reasoning_content)
        }
      })
      .catch(() => {})
  }
  return response
}

/**
 * HTTPClient (Mistral SDK) with a beforeRequest hook that injects the user's
 * Remix bearer token — evaluated per-request so login state stays in sync.
 *
 * Also dumps the outbound request body when AI_DEBUG is enabled, so we can
 * see exactly which message blocks trigger
 *   `Mistral only supports types "text" or "image_url" for complex message types.`
 */

async function dumpMistralRequest(req: Request): Promise<void> {
  try {
    const cloned = req.clone()
    const text = await cloned.text()
    let parsed: any = text
    try { parsed = JSON.parse(text) } catch { /* not json */ }
    // Print the messages array — that's where the offending content blocks live.
    const msgs = parsed?.messages
    console.groupCollapsed(`[Mistral→] ${req.method} ${req.url}`)
    if (Array.isArray(msgs)) {
      msgs.forEach((m: any, i: number) => {
        const c = m?.content
        const shape = typeof c === 'string'
          ? `string(${c.length})`
          : Array.isArray(c)
            ? `array[${c.length}]: ${c.map((b: any) => b?.type ?? typeof b).join(',')}`
            : typeof c
        console.log(`  msg[${i}] role=${m?.role} content=${shape}`)
        if (Array.isArray(c)) {
          c.forEach((b: any, j: number) => {
            if (b?.type !== 'text' && b?.type !== 'image_url') {
              console.warn(`    ⚠ block[${j}] OFFENDING type=${b?.type}`, b)
            }
          })
        }
      })
    }
    console.log('full body:', parsed)
    console.groupEnd()
  } catch (e) {
    console.warn('[Mistral→] failed to dump request', e)
  }
}

function createAuthedMistralHttpClient(): HTTPClient {
  const client = new HTTPClient()
  client.addHook('beforeRequest', (req) => {
    const auth = getRemixAuthHeader()
    let next: Request = req
    if (auth.Authorization) {
      // Always overwrite: the Mistral SDK stamps a placeholder
      // 'Authorization: Bearer proxy-handled' from the dummy apiKey, which
      // would shadow the real Remix bearer token if we only set-when-missing.
      next = new Request(req, { headers: new Headers(req.headers) })
      next.headers.set('Authorization', auth.Authorization)
    }
    if (AI_DEBUG) void dumpMistralRequest(next)
    return next
  })
  return client
}

function summarizeMessages(label: string, messages: any): void {
  try {
    const arr: any[] = Array.isArray(messages)
      ? messages
      : (messages?.messages && Array.isArray(messages.messages) ? messages.messages : [])
    console.groupCollapsed(`[ModelInput ${label}] ${arr.length} message(s)`)
    arr.forEach((m, i) => {
      const role = m?._getType?.() || m?.role || m?.constructor?.name || 'unknown'
      const c = m?.content
      let shape: string
      if (typeof c === 'string') shape = `string(${c.length})`
      else if (Array.isArray(c)) shape = `array[${c.length}]: ${c.map((b: any) => b?.type ?? typeof b).join(',')}`
      else shape = typeof c
      console.log(`  [${i}] role=${role} content=${shape}`)
      if (Array.isArray(c)) {
        c.forEach((b: any, j: number) => {
          if (b?.type !== 'text' && b?.type !== 'image_url') {
            console.warn(`     ⚠ block[${j}] OFFENDING-FOR-MISTRAL type=${b?.type}`, b)
          }
        })
      }
    })
    console.log('full messages:', messages)
    console.groupEnd()
  } catch (e) {
    console.warn(`[ModelInput ${label}] dump failed`, e)
  }
}

/**
 * Wrap a chat model so every call to invoke/stream/streamEvents logs the
 * messages being passed in. Helps diagnose the
 *   `Mistral only supports types "text" or "image_url" ...`
 * error which is raised during message conversion (before any HTTP request).
 * Enable via `localStorage.setItem('AI_DEBUG', 'true')`.
 */
function wrapModelForDebug<T extends BaseChatModel>(model: T, label: string): T {
  if (!AI_DEBUG) return model
  const methodsToWrap = ['invoke', 'stream', 'streamEvents', '_generate', '_streamResponseChunks'] as const
  for (const method of methodsToWrap) {
    const original = (model as any)[method]
    if (typeof original !== 'function') continue
    ;(model as any)[method] = function (...args: any[]) {
      summarizeMessages(`${label}.${method}`, args[0])
      try {
        const result = original.apply(this, args)
        if (result && typeof result.then === 'function') {
          return result.catch((err: any) => {
            console.error(`[ModelInput ${label}.${method}] threw:`, err?.message || err)
            throw err
          })
        }
        return result
      } catch (err: any) {
        console.error(`[ModelInput ${label}.${method}] threw sync:`, err?.message || err)
        throw err
      }
    }
  }
  return model
}

export function createModelInstance(
  modelSelection: ModelSelection,
  maxTokens: number = DAPP_MAX_TOKENS,
  userApiKeys?: IUserApiKeyConfig
): BaseChatModel {
  const { provider, modelId } = modelSelection

  switch (provider) {
  case 'mistralai': {
    const useDirectApi = !!(userApiKeys?.useOwnKeys && userApiKeys?.mistralApiKey)
    console.log(`[ModelFactory] Creating mistralai model: ${modelId}${useDirectApi ? ' (direct API)' : ' (proxy)'}`)
    return wrapModelForDebug(new ChatMistralAI({
      apiKey: useDirectApi ? userApiKeys!.mistralApiKey! : 'proxy-handled',
      model: modelId,
      temperature: 0.7,
      maxTokens: maxTokens,
      streaming: true,
      // Disable langchain's automatic retry. Otherwise a single user
      // turn produces 5-6 silent retries on 429 (or any 5xx), each
      // doubling the delay before the cooldown banner can show. We
      // want the FIRST envelope error to surface immediately so
      // assistantState can gate the next attempt.
      maxRetries: 0,
      // With a user-provided key the call goes direct to Mistral — no proxy
      // routing, no Remix-bearer-token injection.
      ...(useDirectApi
        ? {}
        : {
          serverURL: `${endpointUrls.langchain}/mistral`,
          httpClient: createAuthedMistralHttpClient()
        })
    }), `mistralai/${modelId}`)
  }

  case 'openai': {
    const useDirectApi = !!(userApiKeys?.useOwnKeys && userApiKeys?.openaiApiKey)
    console.log(`[ModelFactory] Creating OpenAI model: ${modelId}${useDirectApi ? ' (direct API)' : ' (proxy)'}`)
    return wrapModelForDebug(new ChatOpenAI({
      apiKey: useDirectApi ? userApiKeys!.openaiApiKey! : 'proxy-handled',
      model: modelId,
      temperature: 0.7,
      maxTokens: maxTokens,
      streaming: true,
      maxRetries: 0,
      ...(useDirectApi
        ? {}
        : {
          configuration: {
            baseURL: `${endpointUrls.langchain}/openai`,
            fetch: authedFetch
          }
        })
    }), `openai/${modelId}`)
  }

  case 'moonshot': {
    // Moonshot (Kimi) speaks the OpenAI Chat Completions wire format, so we
    // use ChatOpenAI rather than the Mistral shim.
    //
    // Two routing modes:
    //   1. User-supplied Moonshot key → call goes direct to Moonshot's API.
    //      Thinking mode is disabled to avoid the reasoning_content round-trip
    //      that requires our streaming shim.
    //   2. Default → routed through the Remix proxy at
    //      `${endpointUrls.langchain}/moonshot/v1`. The reasoning-content
    //      shim re-emits captured `reasoning_content` on follow-up tool_call
    //      assistant messages so kimi-k2-thinking doesn't 400.
    const useDirectApi = !!(userApiKeys?.useOwnKeys && userApiKeys?.moonshotApiKey)
    console.log(`[ModelFactory] Creating moonshot model: ${modelId}${useDirectApi ? ' (direct API)' : ' (proxy)'}`)
    return wrapModelForDebug(new ChatOpenAI({
      apiKey: useDirectApi ? userApiKeys!.moonshotApiKey! : 'proxy-handled',
      model: modelId,
      // Moonshot recommends temperature=1 and currently enforces top_p=0.95.
      temperature: 1,
      topP: 0.95,
      maxTokens: maxTokens,
      streaming: true,
      maxRetries: 0,
      ...(useDirectApi
        ? {
          configuration: { baseURL: 'https://api.moonshot.ai/v1' },
          // Direct path: drop thinking mode so we don't have to re-emit
          // reasoning_content for tool calls without the proxy shim.
          modelKwargs: { thinking: { type: 'disabled' } }
        }
        : {
          configuration: {
            baseURL: `${endpointUrls.langchain}/moonshot/v1`,
            // moonshotFetch wraps authedFetch and additionally
            //  1) captures reasoning_content from streamed assistant turns, and
            //  2) re-injects it onto outbound assistant tool_call messages —
            // required by Moonshot's thinking-enabled models (e.g. kimi-k2-thinking).
            fetch: moonshotFetch
          }
        })
    }), `moonshot/${modelId}`)
  }

  case 'anthropic':
  default: {
    const useDirectApi = !!(userApiKeys?.useOwnKeys && userApiKeys?.anthropicApiKey)
    console.log(`[ModelFactory] Creating Anthropic model: ${modelId}${useDirectApi ? ' (direct API)' : ' (proxy)'}`)
    return wrapModelForDebug(new ChatAnthropic({
      apiKey: useDirectApi ? userApiKeys!.anthropicApiKey! : 'proxy-handled',
      model: modelId,
      temperature: 0.7,
      maxTokens: maxTokens,
      streaming: true,
      // See note in mistralai branch — langchain auto-retry hides
      // 429s behind exponential backoff and produces a cluster of
      // red requests in DevTools before the user sees anything.
      maxRetries: 0,
      ...(useDirectApi
        ? {}
        : {
          clientOptions: {
            baseURL: endpointUrls.langchain,
            fetch: authedFetch
          }
        })
    }), `anthropic/${modelId}`)
  }
  }
}
