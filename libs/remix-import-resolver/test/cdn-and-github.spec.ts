/// <reference types="mocha" />
import { expect } from 'chai'
import { mkdtemp, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promises as fs } from 'fs'

import { NodeIOAdapter, SourceFlattener } from '../src'

function readJson<T = any>(path: string): Promise<T> {
  return fs.readFile(path, 'utf8').then((d) => JSON.parse(d))
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

// End-to-end flows that combine normalization and flattening. These validate that
// CDN and GitHub imports integrate correctly with the SourceFlattener and that
// the resolution index captures the original → normalized mapping as users would expect.
describe('import-resolver: cdn + github flows', () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = await mkdtemp(join(tmpdir(), 'import-resolver-cases-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    await rm(tempDir, { recursive: true, force: true })
  })

  // Scenario: a Solidity file imports from jsDelivr (versioned). We expect the flattener to
  // normalize to an npm path, resolve and save files, and write an index mapping the CDN URL
  // to the versioned npm path for Go-to-Definition.
  it('flattens an entry importing from jsDelivr CDN (versioned path)', async function () {
    this.timeout(90000)
    const io = new NodeIOAdapter()
    const flattener = new SourceFlattener(io, true)
    const entry = 'CdnEntry.sol'
    const src = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\nimport "https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol";\n\ncontract C is ERC20 {\n  constructor() ERC20("C","C") {}\n}`
    await fs.writeFile(entry, src, 'utf8')
    const result = await flattener.flatten(entry)
    expect(result.flattened).to.be.a('string')
    // resolution index should record that the CDN path was normalized to the npm path
    const idxPath = '.deps/npm/.resolution-index.json'
    expect(await exists(idxPath)).to.equal(true)
    const idx = await readJson<Record<string, Record<string, string>>>(idxPath)
    // look for entry for our root file
    expect(idx[entry]).to.be.ok
    const mappings = idx[entry]
    const key = 'https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@4.8.0/token/ERC20/ERC20.sol'
    expect(mappings[key]).to.match(/^\.deps\/npm\/@openzeppelin\/contracts@4\.8\.0\/token\/ERC20\/ERC20\.sol$/)
  })

  // Scenario: a Solidity file imports a GitHub "blob" URL. We expect it to be rewritten to
  // raw.githubusercontent.com, saved under github/<org>/<repo>@<ref>/..., and indexed.
  it('rewrites GitHub blob URL to raw and persists normalized path in index', async function () {
    this.timeout(120000)
    const io = new NodeIOAdapter()
    const flattener = new SourceFlattener(io, true)
    const entry = 'GhBlobEntry.sol'
    const blobUrl = 'https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/v5.4.0/contracts/token/ERC1155/ERC1155Upgradeable.sol'
    const src = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\nimport "${blobUrl}";\n\ncontract G {}`
    await fs.writeFile(entry, src, 'utf8')
    const result = await flattener.flatten(entry)
    expect(result.flattened).to.be.a('string')

    const idxPath = '.deps/npm/.resolution-index.json'
    expect(await exists(idxPath)).to.equal(true)
    const idx = await readJson<Record<string, Record<string, string>>>(idxPath)
    expect(idx[entry]).to.be.ok
    const mappings = idx[entry]
    expect(mappings[blobUrl]).to.equal('.deps/github/OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0/contracts/token/ERC1155/ERC1155Upgradeable.sol')
  })
})
