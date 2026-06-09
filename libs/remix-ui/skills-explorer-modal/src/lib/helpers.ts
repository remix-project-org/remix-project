import type { Plugin } from '@remixproject/engine'

export interface SkillData {
  id: string
  name: string
  description: string
  content: string
  resources: Record<string, string>
}

/**
 * Parse the `name` field from a SKILL.md YAML frontmatter block.
 * Convention: SKILL.md starts with ---\nname: <skill-name>\ndescription: ...\n---
 * The name value is used as the parent directory name under skills/
 */
export function parseSkillNameFromContent(content: string): string | null {
  const match = content.match(/^---[\s\S]*?^name:\s*([^\n]+)/m)
  if (!match) return null
  return match[1].trim()
}

/**
 * Validate file extension
 */
export function getFileType(filename: string): 'md' | 'zip' | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.md')) return 'md'
  if (lower.endsWith('.zip') || lower.endsWith('.skill')) return 'zip'
  return null
}

// Resolve the skills endpoint — works in both local dev and production.
// There is no dedicated `ethskills` service in the discovery document; it
// is always derived from the `mcp` base + '/ethskills'.
export function getSkillsBaseUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { endpointUrls } = require('@remix-endpoints-helper')
    console.log('Resolved endpointUrls in getSkillsBaseUrl:', endpointUrls)
    const mcp = endpointUrls?.mcp
    if (mcp && String(mcp).startsWith('http')) {
      return `${String(mcp).replace(/\/$/, '')}/ethskills`
    }
    const proxy = endpointUrls?.mcpCorsProxy
    if (proxy && String(proxy).startsWith('http')) {
      return `${String(proxy).replace(/\/$/, '')}/ethskills`
    }
  } catch (_) { /* ignore */ }
  // Fallback: direct ethskills server
  return 'https://api.remix.live/mcp/ethskills'
}

export const fetchSkillData = async (url: string): Promise<SkillData> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  const data = await response.json()
  if (!data.id || !data.name || !data.content || !data.resources) {
    throw new Error('Invalid skill data format - missing required fields')
  }
  return {
    id: data.id,
    name: data.name,
    description: data.description || '',
    content: data.content,
    resources: data.resources || {}
  }
}

export const ensureDirectoryExists = async (dirPath: string, plugin: Plugin) => {
  try {
    await plugin.call('fileManager', 'mkdir', dirPath)
  } catch (e) {
    // Directory may already exist
  }
}