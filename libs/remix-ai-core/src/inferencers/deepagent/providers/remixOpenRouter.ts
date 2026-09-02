import { ChatOpenRouter } from '@langchain/openrouter'
import { getLangfuseUserId } from '../../../helpers/langfuse'
import { getRemixAuthHeader } from '../../auth'
import { getCurrentSessionId } from '../helpers/runContext'
import { reportResolvedModel } from '../helpers/resolvedModel'
import { remixAILogger } from '../../../helpers/logger'

type HeaderMap = Record<string, string>

/** `buildHeaders` is a plain prototype method, but private in the typings. */
const buildOpenRouterHeaders = (ChatOpenRouter.prototype as any).buildHeaders as (this: unknown) => HeaderMap

/**
 * Read the served model out of the first SSE frames without disturbing the
 * stream LangChain consumes.
 */
const sniffModel = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  try {
    // The model appears on the very first frame; a few KB is plenty.
    while (buffered.length < 8192) {
      const { done, value } = await reader.read()
      if (done) break
      buffered += decoder.decode(value, { stream: true })
      const match = buffered.match(/"model"\s*:\s*"([^"]+)"/)
      if (match) {
        reportResolvedModel(match[1])
        return
      }
    }
  } catch (e) {
    remixAILogger.warn('[RemixChatOpenRouter] could not read the served model', e)
  } finally {
    void reader.cancel().catch(() => undefined)
  }
}

export class RemixChatOpenRouter extends ChatOpenRouter {
  constructor(fields: any) {
    super(fields)

    // `openrouter/auto` resolves to a different model per request and the
    // streaming converter throws that away, so tap the raw response here.
    const caller: any = (this as any).caller
    const callWithOptions = caller?.callWithOptions?.bind(caller)
    if (!callWithOptions) return

    caller.callWithOptions = async (options: any, func: any, ...args: any[]) => {
      const result = await callWithOptions(options, func, ...args)
      if (typeof Response === 'undefined' || !(result instanceof Response) || !result.body) {
        return result
      }
      // tee so the sniffer never consumes the bytes LangChain needs.
      const [forLangchain, forSniffing] = result.body.tee()
      void sniffModel(forSniffing)
      return new Response(forLangchain, {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers
      })
    }
  }

  invocationParams(options: this['ParsedCallOptions']) {
    const sessionId = getCurrentSessionId()
    const user = getLangfuseUserId()
    return {
      ...super.invocationParams(options),
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(user ? { user } : {})
    }
  }
}

export class ProxyChatOpenRouter extends RemixChatOpenRouter {}

// Patched onto the prototype rather than declared: TypeScript forbids
// overriding a member the base class declares private.
;(ProxyChatOpenRouter.prototype as any).buildHeaders = function (this: unknown): HeaderMap {
  const { Authorization, ...headers } = buildOpenRouterHeaders.call(this)
  const auth = getRemixAuthHeader()
  return auth.Authorization ? { ...headers, Authorization: auth.Authorization } : headers
}
