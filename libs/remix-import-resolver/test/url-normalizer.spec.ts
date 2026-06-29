/// <reference types="mocha" />
import { expect } from 'chai'
import {
  normalizeGithubBlobUrl,
  normalizeRawGithubUrl,
  rewriteNpmCdnUrl,
  normalizeIpfsUrl,
  normalizeSwarmUrl
} from '../src'

// Pure function tests for URL normalization helpers. These are fast, side-effect-free checks
// that document how various external URL shapes are rewritten into deterministic save paths.
describe('url-normalizer', () => {
  // GitHub web "blob" URLs should convert to their raw content counterpart.
  it('converts GitHub blob to raw', () => {
    const out = normalizeGithubBlobUrl('https://github.com/openzeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/token/ERC20/ERC20.sol')
    expect(out).to.equal('https://raw.githubusercontent.com/openzeppelin/openzeppelin-contracts/v5.0.2/contracts/token/ERC20/ERC20.sol')
  })

  // Raw GitHub URLs produce a target save path under github/<org>/<repo>@<ref>/...
  it('normalizes raw.githubusercontent.com', () => {
    const out = normalizeRawGithubUrl('https://raw.githubusercontent.com/openzeppelin/openzeppelin-contracts/v5.0.2/contracts/token/ERC20/ERC20.sol')
    // targetPath is where we save on disk (under .deps), normalizedPath is the canonical key used in indices/markers
    expect(out?.targetPath).to.equal('.deps/github/openzeppelin/openzeppelin-contracts@v5.0.2/contracts/token/ERC20/ERC20.sol')
    expect(out?.normalizedPath).to.equal('github/openzeppelin/openzeppelin-contracts@v5.0.2/contracts/token/ERC20/ERC20.sol')
  })

  // CDN URLs (jsDelivr/unpkg) should rewrite to their npm path so they integrate with npm resolution.
  it('rewrites npm CDN to npm path', () => {
    const out = rewriteNpmCdnUrl('https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol')
    expect(out?.npmPath).to.equal('@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol')
  })

  // ipfs:// URIs normalize to ipfs/<hash>/...
  it('normalizes ipfs', () => {
    const out = normalizeIpfsUrl('ipfs://QmHash/path/file.sol')
    expect(out?.targetPath).to.match(/^ipfs\/QmHash\//)
  })

  // Swarm bzz:// and bzz-raw:// URIs normalize to swarm/<hash>/...
  it('normalizes swarm', () => {
    const out = normalizeSwarmUrl('bzz-raw://abcdef/path/file.sol')
    expect(out?.targetPath).to.match(/^swarm\/abcdef\//)
  })
})
