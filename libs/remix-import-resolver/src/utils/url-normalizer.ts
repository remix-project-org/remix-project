export type NpmCdnRewrite = { npmPath: string }
export type GithubRawNormalization = { owner: string; repo: string; ref: string; filePath: string; normalizedPath: string; targetPath: string }
export type IpfsNormalization = { normalizedPath: string; targetPath: string }
export type SwarmNormalization = { normalizedPath: string; targetPath: string }

export function normalizeGithubBlobUrl(url: string): string | null {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/)
  if (!match) return null
  const [, owner, repo, ref, filePath] = match
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`
}

export function rewriteNpmCdnUrl(url: string): NpmCdnRewrite | null {
  let match = url.match(/^https?:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net\/npm)\/(@?[^/]+(?:\/[^/@]+)?)@([^/]+)\/(.+)$/)
  if (match) {
    const [, packageName, version, filePath] = match
    return { npmPath: `${packageName}@${version}/${filePath}` }
  }
  match = url.match(/^https?:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net\/npm)\/(@?[^/]+(?:\/[^/@]+)?)\/(.+)$/)
  if (match) {
    const [, packageName, filePath] = match
    return { npmPath: `${packageName}/${filePath}` }
  }
  return null
}

export function normalizeRawGithubUrl(url: string): GithubRawNormalization | null {
  const rawGithubMatch = url.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(.+)$/)
  if (!rawGithubMatch) return null

  const owner = rawGithubMatch[1]
  const repo = rawGithubMatch[2]
  const restOfPath = rawGithubMatch[3]

  let ref: string
  let filePath: string

  if (restOfPath.startsWith('refs/heads/') || restOfPath.startsWith('refs/tags/')) {
    const parts = restOfPath.split('/')
    if (restOfPath.startsWith('refs/heads/')) {
      ref = parts[2]
      filePath = parts.slice(3).join('/')
    } else {
      ref = parts[2]
      filePath = parts.slice(3).join('/')
    }
  } else {
    const firstSlash = restOfPath.indexOf('/')
    ref = restOfPath.substring(0, firstSlash)
    filePath = restOfPath.substring(firstSlash + 1)
  }

  const normalizedPath = `github/${owner}/${repo}@${ref}/${filePath}`
  // Save under .deps while keeping canonical normalizedPath for mapping/markers
  return { owner, repo, ref, filePath, normalizedPath, targetPath: `.deps/${normalizedPath}` }
}

export function normalizeIpfsUrl(url: string): IpfsNormalization | null {
  if (!url.startsWith('ipfs://')) return null
  const match = url.match(/^ipfs:\/\/(?:ipfs\/)?([^/]+)(?:\/(.+))?$/)
  if (!match) return null
  const hash = match[1]
  const filePath = match[2] || ''
  const normalizedPath = filePath ? `ipfs/${hash}/${filePath}` : `ipfs/${hash}`
  return { normalizedPath, targetPath: normalizedPath }
}

export function normalizeSwarmUrl(url: string): SwarmNormalization | null {
  if (!url.startsWith('bzz-raw://') && !url.startsWith('bzz://')) return null
  const match = url.match(/^(bzz-raw?):\/\/([^/]+)(?:\/(.+))?$/)
  if (!match) return null
  const hash = match[2]
  const filePath = match[3] || ''
  const normalizedPath = filePath ? `swarm/${hash}/${filePath}` : `swarm/${hash}`
  return { normalizedPath, targetPath: normalizedPath }
}
