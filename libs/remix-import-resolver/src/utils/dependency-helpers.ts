'use strict'

import { isHttpUrl, isNpmProtocol, isRelativeImport } from '../constants/import-patterns'

export type LogFn = (message: string, ...args: any[]) => void

const noop: LogFn = () => {}

export function resolveRelativeImport(currentFile: string, importPath: string, log: LogFn = noop): string {
  if (!isRelativeImport(importPath)) return importPath

  // Check if currentFile is a URL (has protocol like https://)
  const protocolMatch = currentFile.match(/^([a-zA-Z]+:\/\/)/)
  const protocol = protocolMatch ? protocolMatch[1] : ''

  // Remove protocol temporarily for path manipulation
  const currentFileWithoutProtocol = protocol ? currentFile.substring(protocol.length) : currentFile
  const currentDir = currentFileWithoutProtocol.substring(0, currentFileWithoutProtocol.lastIndexOf('/'))
  const currentParts = currentDir.split('/').filter(p => p) // Filter out empty strings
  const importParts = importPath.split('/')

  for (const part of importParts) {
    if (part === '..') currentParts.pop()
    else if (part !== '.' && part !== '') currentParts.push(part) // Also filter empty strings
  }

  // Join parts and restore protocol if it existed
  const resolvedPath = protocol + currentParts.join('/')
  log(`[DependencyResolver]   🔗 Resolved relative import: ${importPath} → ${resolvedPath}`)
  return resolvedPath
}

export function applyRemappings(importPath: string, remappings: Array<{ from: string; to: string }>, log: LogFn = noop): string {
  if (isRelativeImport(importPath)) return importPath

  // Skip remapping if the path already looks like it was remapped (has npm: prefix or is already in target form)
  // This prevents infinite loops from remappings like: @pkg@1.0.0/=npm:@pkg@1.0.0/
  if (isNpmProtocol(importPath)) {
    log(`[DependencyResolver]   ⏭️  Skipping remapping for already-prefixed path: ${importPath}`)
    return importPath
  }

  for (const { from, to } of remappings || []) {
    if (!from) continue
    if (importPath === from || importPath.startsWith(from)) {
      const replaced = to + importPath.substring(from.length)
      log(`[DependencyResolver]   🔁 Remapped import: ${importPath} → ${replaced}`)
      return replaced
    }
  }
  return importPath
}

export function extractImports(content: string, log: LogFn = noop): string[] {
  log(`[DependencyResolver]   📝 Extracting imports from content (${content.length} chars)`)
  const imports: string[] = []
  let cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '')
  const lines = cleanContent.split('\n')
  const cleanedLines = lines.map(line => {
    const stringMatches: Array<{ start: number; end: number }> = []
    let inString = false
    let stringChar = ''
    let escaped = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (escaped) { escaped = false; continue }
      if (char === '\\') { escaped = true; continue }
      if ((char === '"' || char === "'") && !inString) {
        inString = true
        stringChar = char
        stringMatches.push({ start: i, end: -1 })
      } else if (char === stringChar && inString) {
        inString = false
        stringMatches[stringMatches.length - 1].end = i
      }
    }
    const commentIndex = line.indexOf('//')
    if (commentIndex === -1) return line
    const isInsideString = stringMatches.some(match => match.start < commentIndex && (match.end === -1 || match.end > commentIndex))
    if (isInsideString) return line
    return line.substring(0, commentIndex)
  })
  cleanContent = cleanedLines.join('\n')

  const importPatterns = [
    /import\s+["']([^"']+)["']\s*;/g,
    /import\s+["']([^"']+)["']\s+as\s+\w+\s*;/g,
    /import\s*{\s*[^}]*}\s*from\s+["']([^"']+)["']\s*;/g,
    /import\s+\*\s+as\s+\w+\s+from\s+["']([^"']+)["']\s*;/g,
    /import\s+\w+\s+from\s+["']([^"']+)["']\s*;/g,
    /import\s+\w+\s*,\s*{\s*[^}]*}\s*from\s+["']([^"']+)["']\s*;/g
  ]
  for (const pattern of importPatterns) {
    let match
    while ((match = pattern.exec(cleanContent)) !== null) {
      const ip = match[1]
      if (ip && !imports.includes(ip)) imports.push(ip)
    }
    pattern.lastIndex = 0
  }
  if (imports.length > 0) log(`[DependencyResolver]   📝 Extracted ${imports.length} imports:`, imports)
  else log(`[DependencyResolver]   📝 No imports found`)
  return imports
}

export function extractUrlContext(path: string, log: LogFn = noop): string | null {
  if (path.startsWith('ipfs://')) {
    const ipfsMatch = path.match(/^ipfs:\/\/(?:ipfs\/)?([^/]+)/)
    if (ipfsMatch) {
      const hash = ipfsMatch[1]
      log(`[DependencyResolver]   🌐 Extracted IPFS context: ipfs://${hash}`)
      return `ipfs://${hash}`
    }
  }
  if (path.startsWith('bzz-raw://') || path.startsWith('bzz://')) {
    const swarmMatch = path.match(/^(bzz-raw?:\/\/[^/]+)/)
    if (swarmMatch) {
      const baseUrl = swarmMatch[1]
      log(`[DependencyResolver]   🌐 Extracted Swarm context: ${baseUrl}`)
      return baseUrl
    }
  }
  if (!isHttpUrl(path)) return null
  const unpkgMatch = path.match(/^(https?:\/\/unpkg\.com\/@?[^/]+(?:\/[^@/]+)?@[^/]+)\//)
  if (unpkgMatch) {
    const baseUrl = unpkgMatch[1]
    log(`[DependencyResolver]   🌐 Extracted unpkg context: ${baseUrl}`)
    return baseUrl
  }
  const jsDelivrNpmMatch = path.match(/^(https?:\/\/cdn\.jsdelivr\.net\/npm\/@?[^/]+(?:\/[^@/]+)?@[^/]+)\//)
  if (jsDelivrNpmMatch) {
    const baseUrl = jsDelivrNpmMatch[1]
    log(`[DependencyResolver]   🌐 Extracted jsDelivr npm context: ${baseUrl}`)
    return baseUrl
  }
  const jsDelivrGhMatch = path.match(/^(https?:\/\/cdn\.jsdelivr\.net\/gh\/[^/]+\/[^/@]+@[^/]+)\//)
  if (jsDelivrGhMatch) {
    const baseUrl = jsDelivrGhMatch[1]
    log(`[DependencyResolver]   🌐 Extracted jsDelivr GitHub context: ${baseUrl}`)
    return baseUrl
  }
  const rawMatch = path.match(/^(https?:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+)\//)
  if (rawMatch) {
    const baseUrl = rawMatch[1]
    log(`[DependencyResolver]   🌐 Extracted raw.githubusercontent.com context: ${baseUrl}`)
    return baseUrl
  }
  const githubBlobMatch = path.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\//)
  if (githubBlobMatch) {
    const owner = githubBlobMatch[1]
    const repo = githubBlobMatch[2]
    const ref = githubBlobMatch[3]
    const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}`
    log(`[DependencyResolver]   🌐 Converted GitHub blob to raw context: ${baseUrl}`)
    return baseUrl
  }
  log(`[DependencyResolver]   ⚠️  Could not extract URL context from: ${path}`)
  return null
}

export function extractPackageContext(path: string): string | null {
  // 1) Match at the beginning (npm-style import strings)
  let m = path.match(/^(@[^/]+\/[^/@]+)@([^/]+)/)
  if (m) return `${m[1]}@${m[2]}`
  m = path.match(/^([^/@]+)@([^/]+)/)
  if (m) return `${m[1]}@${m[2]}`

  // 2) Match anywhere inside the path (e.g. .deps/npm/@scope/name@version/..., or name@version/...)
  // Scoped package inside a path
  m = path.match(/\/(?:deps\/npm\/)?(@[^/]+\/[^/@]+)@([^/]+)(?:\/|$)/)
  if (m) return `${m[1]}@${m[2]}`
  // Unscoped package inside a path
  m = path.match(/\/(?:deps\/npm\/)?([^/@]+)@([^/]+)(?:\/|$)/)
  if (m) return `${m[1]}@${m[2]}`

  return null
}
