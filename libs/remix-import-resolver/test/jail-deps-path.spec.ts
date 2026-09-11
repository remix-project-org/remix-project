/// <reference types="mocha" />
import { expect } from 'chai'
import { jailDepsPath, normalizeRawGithubUrl } from '../src'

describe('jailDepsPath', () => {
  it('keeps a normal GitHub save path under .deps', () => {
    expect(jailDepsPath('.deps/github/openzeppelin/openzeppelin-contracts@v5.0.2/contracts/token/ERC20/ERC20.sol'))
      .to.equal('.deps/github/openzeppelin/openzeppelin-contracts@v5.0.2/contracts/token/ERC20/ERC20.sol')
  })

  it('rejects a GitHub filePath that walks out of .deps', () => {
    const raw = normalizeRawGithubUrl(
      'https://raw.githubusercontent.com/openzeppelin/openzeppelin-contracts/v5.0.2/../../../../tmp/remix-import-escape-probe.sol'
    )
    expect(raw?.targetPath).to.include('..')
    expect(() => jailDepsPath(raw!.targetPath)).to.throw('escapes .deps')
  })

  it('rejects an HTTP pathname that walks out of .deps', () => {
    expect(() => jailDepsPath('.deps/http/example.com/../../../tmp/remix-import-escape-probe.sol'))
      .to.throw('escapes .deps')
  })

  it('rejects an absolute save path', () => {
    expect(() => jailDepsPath('/tmp/remix-import-escape-probe.sol')).to.throw('must be relative')
  })
})
