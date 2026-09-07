import { ChatAttachment } from '../types/types'

/**
 * OpenAI-style image content block. This is the shape every transport we use
 * understands: OpenRouter passes it straight through, `@langchain/aws` converts
 * a `data:` URL into a Converse image block, and `ChatOllama` base64-decodes it.
 * It also matches what `DAppGeneratorPrompts` already builds.
 */
export interface ImageContentBlock {
  type: 'image_url'
  image_url: { url: string }
}

export interface TextContentBlock {
  type: 'text'
  text: string
}

export type MessageContentBlock = TextContentBlock | ImageContentBlock

export function imageBlock(dataUrl: string): ImageContentBlock {
  return { type: 'image_url', image_url: { url: dataUrl } }
}

/** Only attachments that still carry their full-size payload can be sent. */
export function sendableAttachments(attachments?: ChatAttachment[]): ChatAttachment[] {
  if (!Array.isArray(attachments)) return []
  return attachments.filter((a) => typeof a?.dataUrl === 'string' && a.dataUrl.startsWith('data:image/'))
}

/**
 * Builds the `content` for a user turn.
 *
 * Returns the plain string when there is nothing to attach, so every existing
 * text-only code path stays byte-identical.
 */
export function buildUserContent(text: string, attachments?: ChatAttachment[]): string | MessageContentBlock[] {
  const images = sendableAttachments(attachments)
  if (images.length === 0) return text

  const blocks: MessageContentBlock[] = images.map((a) => imageBlock(a.dataUrl))
  if (text && text.trim().length > 0) blocks.push({ type: 'text', text })
  return blocks
}

/** Flattens multimodal content back to text — for logs, titles and telemetry. */
export function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part: any) => {
      if (typeof part === 'string') return part
      if (part?.type === 'text') return part.text ?? ''
      if (part?.type === 'image_url') return '[image]'
      return ''
    })
    .filter(Boolean)
    .join(' ')
}
