'use strict'

import { normalizeGithubBlobUrl, normalizeIpfsUrl, normalizeRawGithubUrl, normalizeSwarmUrl, rewriteNpmCdnUrl } from './url-normalizer'
import { Logger } from './logger'
import { ContentFetcher } from './content-fetcher'
import { isHttpUrl, isNpmProtocol, NPM_PROTOCOL } from '../constants/import-patterns'

export type RouteAction =
  | { action: 'none' }
  | { action: 'rewrite', url: string }
  | { action: 'content', content: string }

export interface RouteDeps {
  contentFetcher: ContentFetcher
  logger: Logger
  resolutions: Map<string, string>
  fetchGitHubPackageJson: (owner: string, repo: string, ref: string) => Promise<void>
}

/**
 * Route and normalize an incoming URL before the main resolver logic runs.
 *
 * Behaviors:
 * - npm: alias → rewrite to plain npm path
 * - http(s) CDN → rewrite to npm path and record mapping
 * - GitHub blob → convert to raw; raw → normalize to github/<org>/<repo>@<ref>/..., fetch + save
 * - IPFS/Swarm → normalize to ipfs/... or swarm/... and fetch + save
 * - Other http(s) → direct fetch + save
 *
 * Returns:
 * - { action: 'rewrite', url } to continue resolver pipeline with a new url
 * - { action: 'content', content } when the content has been handled and saved here
 * - { action: 'none' } when no routing occurred
 */
export async function routeUrl(originalUrl: string, url: string, targetPath: string | undefined, deps: RouteDeps): Promise<RouteAction> {
  const { contentFetcher, logger, resolutions, fetchGitHubPackageJson } = deps

  // Handle npm: alias prefix early
  if (isNpmProtocol(url)) {
    logger.log(`[ImportResolver] 🔗 Detected npm: alias in URL, normalizing: ${url}`)
    return { action: 'rewrite', url: url.substring(NPM_PROTOCOL.length) }
  }

  // External HTTP(S) handling + CDN/GitHub normalization
  if (isHttpUrl(url)) {
    logger.log(`[ImportResolver] 🌐 External URL detected: ${url}`)
    const blobToRaw = normalizeGithubBlobUrl(url)
    if (blobToRaw) {
      logger.log(`[ImportResolver]   🔄 Converting GitHub blob URL to raw: ${blobToRaw}`)
      url = blobToRaw
    }
    const npmRewrite = rewriteNpmCdnUrl(url)
    if (npmRewrite) {
      logger.log(`[ImportResolver]   🔄 CDN URL is serving npm package, normalizing:`)
      logger.log(`[ImportResolver]      From: ${url}`)
      logger.log(`[ImportResolver]      To:   ${npmRewrite.npmPath}`)
      if (!resolutions.has(originalUrl)) resolutions.set(originalUrl, npmRewrite.npmPath)
      return { action: 'rewrite', url: npmRewrite.npmPath }
    }
    const ghRaw = normalizeRawGithubUrl(url)
    if (ghRaw) {
      logger.log(`[ImportResolver]   🔄 Normalizing raw.githubusercontent.com URL:`)
      logger.log(`[ImportResolver]      From: ${url}`)
      logger.log(`[ImportResolver]      To:   ${ghRaw.normalizedPath}`)
      await fetchGitHubPackageJson(ghRaw.owner, ghRaw.repo, ghRaw.ref)
      const content = await contentFetcher.resolveAndSave(url, ghRaw.targetPath, false)
      logger.log(`[ImportResolver]   ✅ Received content: ${content ? content.length : 0} chars`)
      if (!resolutions.has(originalUrl)) resolutions.set(originalUrl, ghRaw.targetPath)
      return { action: 'content', content }
    }
    // Fallback direct fetch of arbitrary URL
    logger.log(`[ImportResolver]   ⬇️  Fetching directly from URL: ${url}`)
    const content = await contentFetcher.resolveAndSave(url, targetPath, true)
    logger.log(`[ImportResolver]   ✅ Received content: ${content ? content.length : 0} chars`)
    if (!content) logger.log(`[ImportResolver]   ⚠️  WARNING: Empty content returned from contentImport`)
    else if (content.length < 200) logger.log(`[ImportResolver]   ⚠️  WARNING: Suspiciously short content: "${content.substring(0, 100)}"`)
    if (!resolutions.has(originalUrl)) resolutions.set(originalUrl, url)
    return { action: 'content', content }
  }

  // IPFS
  if (url.startsWith('ipfs://')) {
    logger.log(`[ImportResolver] 🌐 IPFS URL detected: ${url}`)
    const ipfs = normalizeIpfsUrl(url)
    if (ipfs) {
      logger.log(`[ImportResolver]   🔄 Normalizing IPFS URL:`)
      logger.log(`[ImportResolver]      From: ${url}`)
      logger.log(`[ImportResolver]      To:   ${ipfs.normalizedPath}`)
      const content = await contentFetcher.resolveAndSave(url, ipfs.targetPath, false)
      logger.log(`[ImportResolver]   ✅ Received content: ${content ? content.length : 0} chars`)
      if (!resolutions.has(originalUrl)) resolutions.set(originalUrl, ipfs.normalizedPath)
      return { action: 'content', content }
    }
  }

  // Swarm
  if (url.startsWith('bzz-raw://') || url.startsWith('bzz://')) {
    logger.log(`[ImportResolver] 🌐 Swarm URL detected: ${url}`)
    const swarm = normalizeSwarmUrl(url)
    if (swarm) {
      logger.log(`[ImportResolver]   🔄 Normalizing Swarm URL:`)
      logger.log(`[ImportResolver]      From: ${url}`)
      logger.log(`[ImportResolver]      To:   ${swarm.normalizedPath}`)
      const content = await contentFetcher.resolveAndSave(url, swarm.targetPath, false)
      logger.log(`[ImportResolver]   ✅ Received content: ${content ? content.length : 0} chars`)
      if (!resolutions.has(originalUrl)) resolutions.set(originalUrl, swarm.normalizedPath)
      return { action: 'content', content }
    }
  }

  return { action: 'none' }
}
