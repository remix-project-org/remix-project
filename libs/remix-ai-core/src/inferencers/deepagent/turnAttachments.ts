import { remixAILogger } from '../../helpers/logger'
import { AgentMiddleware, HumanMessage, ModelRequest, WrapModelCallHandler } from 'langchain'
import { ChatAttachment } from '../../types/types'
import { buildUserContent, sendableAttachments } from '../../helpers/multimodal'

/**
 * User turns that still hand the last attachments to subagents: the turn they
 * came with plus two follow-ups ("and what about the button on the left?").
 */
const MAX_LIVE_TURNS = 3

/**
 * The images, PDFs and files the user attached most recently.
 *
 * Only the main agent's own user message carries them. A subagent starts from
 * nothing but the task description the main agent wrote, so without this the
 * agent that actually answers "what is this?" never sees the picture.
 */
class TurnAttachments {
  private threadId = ''
  private attachments: ChatAttachment[] = []
  private turnsLeft = 0

  setThread(threadId: string): void {
    const next = threadId || ''
    if (next === this.threadId) return
    this.threadId = next
    this.attachments = []
    this.turnsLeft = 0
  }

  /** Called once per user turn with what that turn carried. */
  beginTurn(attachments?: ChatAttachment[]): void {
    const sendable = sendableAttachments(attachments)
    if (sendable.length > 0) {
      this.attachments = sendable
      this.turnsLeft = MAX_LIVE_TURNS
      return
    }
    if (this.turnsLeft > 0 && --this.turnsLeft === 0) this.attachments = []
  }

  current(): ChatAttachment[] {
    return this.turnsLeft > 0 ? this.attachments : []
  }
}

export const turnAttachments = new TurnAttachments()

const isHumanMessage = (msg: any): boolean => {
  const type = typeof msg?.getType === 'function' ? msg.getType() : msg?._getType?.()
  return type === 'human' || msg?.role === 'user'
}

/**
 * Subagent middleware: puts the user's attachments in front of the task
 * description, the subagent's first human message. Works on a copy, like
 * RemixVisionMiddleware, so the subagent's stored state stays text only.
 */
export class RemixTurnAttachmentsMiddleware implements AgentMiddleware {
  name = 'RemixTurnAttachmentsMiddleware'

  async wrapModelCall(request: ModelRequest, handler: WrapModelCallHandler) {
    try {
      attachTurnAttachments(request)
    } catch (e) {
      remixAILogger.warn('[RemixTurnAttachmentsMiddleware] failed to attach the user\'s attachments', e)
    }
    return handler(request as any)
  }
}

export function attachTurnAttachments(request: ModelRequest): void {
  const attachments = turnAttachments.current()
  const messages = request?.messages
  if (attachments.length === 0 || !Array.isArray(messages)) return

  const index = messages.findIndex(isHumanMessage)
  if (index < 0) return

  const original = (messages[index] as any).content
  const originalBlocks = typeof original === 'string' ? [{ type: 'text', text: original }] : Array.isArray(original) ? original : []
  const attachmentBlocks = buildUserContent('', attachments) as any[]

  const rebuilt = [...messages]
  rebuilt[index] = new HumanMessage({
    content: [
      { type: 'text', text: 'The user attached the following with their request. Look at it before answering:' },
      ...attachmentBlocks,
      ...originalBlocks
    ] as any
  })
  request.messages = rebuilt
}
