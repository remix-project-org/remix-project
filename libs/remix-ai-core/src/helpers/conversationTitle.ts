export const MAX_TITLE_WORDS = 6

/** The placeholder a conversation carries until it has a real title. */
export const UNTITLED_CONVERSATION = 'New Conversation'

// Words a title should not end on once it is cut ("Add a guard to the")
const TRAILING_FILLER = /^(a|an|the|to|of|in|on|for|and|or|with|by|at|from|my|your|this|that)$/i

export function clampTitleWords(text: string): string {
  if (!text) return ''
  const words = text
    .replace(/^["'`\s]+|["'`\s.!?,;:]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TITLE_WORDS)
  while (words.length > 1 && TRAILING_FILLER.test(words[words.length - 1].replace(/[^a-zA-Z]/g, ''))) words.pop()
  const title = words.join(' ')
  return title.charAt(0).toUpperCase() + title.slice(1)
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
