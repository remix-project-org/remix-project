import { ChatOpenRouter } from '@langchain/openrouter'
import { getLangfuseUserId } from '../../../helpers/langfuse'
import { getRemixAuthHeader } from '../../auth'
import { getCurrentSessionId } from '../helpers/runContext'

type HeaderMap = Record<string, string>

/** `buildHeaders` is a plain prototype method, but private in the typings. */
const buildOpenRouterHeaders = (ChatOpenRouter.prototype as any).buildHeaders as (this: unknown) => HeaderMap

export class RemixChatOpenRouter extends ChatOpenRouter {
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
