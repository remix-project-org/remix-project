/// <reference types="mocha" />
import { expect } from 'chai'
import { toHttpUrl } from '../src'

// Tests for runtime gateway overrides: window.REMIX_COMPILER_URLS or window.__REMIX_COMPILER_URLS__
// We simulate browser globals in Node by assigning to global.window.

describe('toHttpUrl translator - runtime overrides', () => {
  const originalWindow = (global as any).window

  afterEach(() => {
    (global as any).window = originalWindow
  })

  it('uses overridden npmURL base for npm paths', () => {
    (global as any).window = { REMIX_COMPILER_URLS: { npmURL: 'https://mycdn.example/npm/' } }
    expect(toHttpUrl('@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol'))
      .to.equal('https://mycdn.example/npm/@openzeppelin/contracts@5.0.2/token/ERC20/ERC20.sol')
    expect(toHttpUrl('@openzeppelin/contracts/token/ERC20/ERC20.sol'))
      .to.equal('https://mycdn.example/npm/@openzeppelin/contracts/token/ERC20/ERC20.sol')
  })

  it('uses overridden ipfsGateway for ipfs:// URIs', () => {
    (global as any).window = { REMIX_COMPILER_URLS: { ipfsGateway: 'https://ipfs.localhost/ipfs' } }
    expect(toHttpUrl('ipfs://QmHash/path/file.sol'))
      .to.equal('https://ipfs.localhost/ipfs/QmHash/path/file.sol')
    expect(toHttpUrl('ipfs://ipfs/QmAnother'))
      .to.equal('https://ipfs.localhost/ipfs/QmAnother')
  })

  it('uses overridden swarmGateway for bzz and bzz-raw', () => {
    (global as any).window = { REMIX_COMPILER_URLS: { swarmGateway: 'https://swarm.localhost' } }
    expect(toHttpUrl('bzz://abcdef/path/file.sol'))
      .to.equal('https://swarm.localhost/bzz:/abcdef/path/file.sol')
    expect(toHttpUrl('bzz-raw://deadbeef'))
      .to.equal('https://swarm.localhost/bzz-raw:/deadbeef')
  })

  it('supports legacy __REMIX_COMPILER_URLS__ key for compatibility', () => {
    (global as any).window = { __REMIX_COMPILER_URLS__: { npmURL: 'https://legacy.example/npm' } }
    expect(toHttpUrl('openzeppelin-solidity/contracts/math/SafeMath.sol'))
      .to.equal('https://legacy.example/npm/openzeppelin-solidity/contracts/math/SafeMath.sol')
  })
})
