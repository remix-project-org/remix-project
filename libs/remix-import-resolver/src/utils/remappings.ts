export type Remapping = { from: string; to: string }

/**
 * Parse a remappings file (Foundry-style remappings.txt):
 * Each non-empty, non-comment line in the form `prefix=target`.
 * Adds trailing slash to `from` if not present, and ensures `to` ends with a slash.
 */
export function parseRemappingsFileContent(content: string): Remapping[] {
  const lines = content.split(/\r?\n/)
  const result: Remapping[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    let from = line.slice(0, idx).trim()
    let to = line.slice(idx + 1).trim()
    if (!from || !to) continue
    if (!from.endsWith('/')) from += '/'
    if (!to.endsWith('/')) to += '/'
    result.push({ from, to })
  }
  return result
}

/** Normalize remappings provided as string array of `prefix=target`. */
export function normalizeRemappings(remaps: Array<string | Remapping>): Remapping[] {
  const out: Remapping[] = []
  for (const r of remaps) {
    if (typeof r === 'string') {
      const idx = r.indexOf('=')
      if (idx === -1) continue
      let from = r.slice(0, idx).trim()
      let to = r.slice(idx + 1).trim()
      if (!from || !to) continue
      if (!from.endsWith('/')) from += '/'
      if (!to.endsWith('/')) to += '/'
      out.push({ from, to })
    } else if (r && (r as Remapping).from && (r as Remapping).to) {
      let from = (r as Remapping).from
      let to = (r as Remapping).to
      if (!from.endsWith('/')) from += '/'
      if (!to.endsWith('/')) to += '/'
      out.push({ from, to })
    }
  }
  return out
}
