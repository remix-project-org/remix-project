const FILLER = ['the', 'function', 'allows', 'a', 'caller', 'to', 'change', 'state', 'before', 'checking', 'the', 'balance', 'which', 'can', 'lead', 'to', 'loss', 'of', 'funds', 'in', 'this', 'contract']

/**
 * Stand-in for text shown blurred behind an upgrade overlay: same length, none of the content,
 * so it can't be read from the page (dev tools, screen readers, copy).
 */
export function gatedPlaceholder (text: string): string {
  const length = (text || '').length
  const words: string[] = []
  let size = 0
  for (let i = 0; size < length; i++) {
    const word = FILLER[i % FILLER.length]
    words.push(word)
    size += word.length + 1
  }
  return words.join(' ')
}
