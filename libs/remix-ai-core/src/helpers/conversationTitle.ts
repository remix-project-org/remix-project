export const MAX_TITLE_WORDS = 3

/** The placeholder a conversation carries until it has a real title. */
export const UNTITLED_CONVERSATION = 'New Conversation'

export function clampTitleWords(text: string): string {
  if (!text) return ''
  return text
    .replace(/^["'`\s]+|["'`\s.!?,;:]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TITLE_WORDS)
    .join(' ')
}

const FILLER = /^(can|could|would|will|you|please|pls|hi|hey|hello|i|we|my|me|the|a|an|to|do|does|is|are|it|how|what|why|when|help|need|want|let)$/i

export function titleFromPrompt(prompt: string): string {
  const cleaned = (prompt || '')
    .replace(/```[\s\S]*?```/g, ' ') // code fences say nothing about the topic
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return UNTITLED_CONVERSATION

  const words = cleaned.split(' ')
  let start = 0
  while (start < words.length - 1 && FILLER.test(words[start].replace(/[^a-zA-Z']/g, ''))) start++

  return clampTitleWords(words.slice(start).join(' ')) || clampTitleWords(cleaned) || UNTITLED_CONVERSATION
}

export function needsDerivedTitle(currentTitle: string | undefined, prompt: string): boolean {
  const current = (currentTitle || '').trim()
  if (!current || current === UNTITLED_CONVERSATION) return true
  if (current.split(/\s+/).length > MAX_TITLE_WORDS) return true
  return prompt.startsWith(current)
}
