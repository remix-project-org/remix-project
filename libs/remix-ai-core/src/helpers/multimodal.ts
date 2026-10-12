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

/**
 * OpenAI-style file block. OpenRouter accepts this for PDFs and forwards it to
 * providers with native document support.
 */
export interface FileContentBlock {
  type: 'file'
  file: { filename: string; file_data: string }
}

export type MessageContentBlock = TextContentBlock | ImageContentBlock | FileContentBlock

export function imageBlock(dataUrl: string): ImageContentBlock {
  return { type: 'image_url', image_url: { url: dataUrl } }
}

export function fileBlock(filename: string, dataUrl: string): FileContentBlock {
  return { type: 'file', file: { filename, file_data: dataUrl } }
}

/** Attachments that still carry a payload the model can actually be shown. */
export function sendableAttachments(attachments?: ChatAttachment[]): ChatAttachment[] {
  if (!Array.isArray(attachments)) return []
  return attachments.filter((a) => {
    if (!a) return false
    if (a.kind === 'text') return typeof a.textContent === 'string' && a.textContent.length > 0
    return typeof a.dataUrl === 'string' && a.dataUrl.startsWith('data:')
  })
}

/** True when the turn carries something only a vision-capable model can read. */
export function hasVisualAttachment(attachments?: ChatAttachment[]): boolean {
  return sendableAttachments(attachments).some((a) => a.kind === 'image' || a.kind === 'document')
}

/** A text file rendered as a fenced block the model reads as file content. */
function textAttachmentBlock(attachment: ChatAttachment): TextContentBlock {
  const note = attachment.truncated ? ' (truncated)' : ''
  return {
    type: 'text',
    text: `Attached file: ${attachment.name}${note}\n\n\`\`\`\n${attachment.textContent}\n\`\`\``
  }
}

/**
 * Builds the `content` for a user turn.
 *
 * Returns the plain string when there is nothing to attach, so every existing
 * text-only code path stays byte-identical.
 *
 * Ordering matters: attachments come first and the user's own words last, so
 * the question is the most recent thing the model reads.
 */
export function buildUserContent(text: string, attachments?: ChatAttachment[]): string | MessageContentBlock[] {
  const sendable = sendableAttachments(attachments)
  if (sendable.length === 0) return text

  const blocks: MessageContentBlock[] = []
  for (const attachment of sendable) {
    if (attachment.kind === 'image') blocks.push(imageBlock(attachment.dataUrl))
    else if (attachment.kind === 'document') blocks.push(fileBlock(attachment.name, attachment.dataUrl))
    else blocks.push(textAttachmentBlock(attachment))
  }
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
      if (part?.type === 'file') return `[file: ${part.file?.filename ?? ''}]`
      return ''
    })
    .filter(Boolean)
    .join(' ')
}
