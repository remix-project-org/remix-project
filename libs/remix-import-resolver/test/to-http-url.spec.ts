/// <reference types="mocha" />
import { expect } from 'chai'
import { toHttpUrl } from '../src'

// Pure function tests for the simple URL → HTTP translator used by adapters.
// This utility intentionally avoids RemixURLResolver/contentImport and keeps logic local.

describe('toHttpUrl translator', () => {
  it('passes through http(s) URLs', () => {
    expect(toHttpUrl('http://example.com/x.sol')).to.equal('http://example.com/x.sol')
    expect(toHttpUrl('https://example.com/x.sol')).to.equal('https://example.com/x.sol')
  })

  it('maps npm paths to jsDelivr', () => {
    expect(toHttpUrl('@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol'))
      .to.equal('https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol')
    expect(toHttpUrl('@openzeppelin/contracts/token/ERC20/ERC20.sol'))
      .to.equal('https://cdn.jsdelivr.net/npm/@openzeppelin/contracts/token/ERC20/ERC20.sol')
    expect(toHttpUrl('openzeppelin-solidity/contracts/math/SafeMath.sol'))
      .to.equal('https://cdn.jsdelivr.net/npm/openzeppelin-solidity/contracts/math/SafeMath.sol')
  })

  it('maps ipfs:// URIs to ipfs.io gateway', () => {
    expect(toHttpUrl('ipfs://QmHash/path/file.sol'))
      .to.equal('https://ipfs.io/ipfs/QmHash/path/file.sol')
    expect(toHttpUrl('ipfs://ipfs/QmAnother'))
      .to.equal('https://ipfs.io/ipfs/QmAnother')
  })

  it('maps swarm bzz:// and bzz-raw:// to swarm gateways', () => {
    expect(toHttpUrl('bzz://abcdef/path/file.sol'))
      .to.equal('https://swarm-gateways.net/bzz:/abcdef/path/file.sol')
    expect(toHttpUrl('bzz-raw://deadbeef')).to.equal('https://swarm-gateways.net/bzz-raw:/deadbeef')
  })
})
