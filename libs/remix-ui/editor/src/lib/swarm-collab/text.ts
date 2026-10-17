import * as Y from 'yjs'

export interface TextChange {
  index: number
  remove: number
  insert: string
}

/** Smallest single replacement that turns `from` into `to`, or `null` when they are equal. */
export function diffText(from: string, to: string): TextChange | null {
  if (from === to) return null

  const max = Math.min(from.length, to.length)
  let start = 0
  while (start < max && from.charCodeAt(start) === to.charCodeAt(start)) start++

  let endFrom = from.length
  let endTo = to.length
  while (endFrom > start && endTo > start && from.charCodeAt(endFrom - 1) === to.charCodeAt(endTo - 1)) {
    endFrom--
    endTo--
  }

  return { index: start, remove: endFrom - start, insert: to.slice(start, endTo) }
}

/** Rewrites `ytext` to `to` with a minimal edit, so concurrent edits elsewhere survive. */
export function setYText(ytext: Y.Text, to: string): void {
  const change = diffText(ytext.toString(), to)
  if (!change) return

  if (change.remove) ytext.delete(change.index, change.remove)
  if (change.insert) ytext.insert(change.index, change.insert)
}

/** Converts line endings to `\n`, so Monaco and Yjs offsets agree. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/** FNV-1a hash, for recognising echoes without keeping copies of the text. */
export function textHash(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

/** Remembers the last few versions of a text by hash. */
export class RecentTexts {
  private readonly hashes: number[] = []

  constructor(private readonly size: number) {}

  add(text: string): void {
    this.hashes.push(textHash(text))
    if (this.hashes.length > this.size) this.hashes.shift()
  }

  has(text: string): boolean {
    return this.hashes.includes(textHash(text))
  }
}
