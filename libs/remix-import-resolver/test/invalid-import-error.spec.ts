import { expect } from 'chai'
import { DependencyResolver } from '../src/resolvers/dependency-resolver'
import { NodeIOAdapter } from '../src/adapters/node-io-adapter'
import { promises as fs } from 'fs'
import { join } from 'path'
import * as os from 'os'

describe('Invalid import error handling', () => {
  let testDir: string
  let originalCwd: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    testDir = await fs.mkdtemp(join(os.tmpdir(), 'invalid-import-test-'))
    process.chdir(testDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch { }
  })

  it('should throw error when importing package.json', async () => {
    const io = new NodeIOAdapter()
    const resolver = new DependencyResolver(io as any, 'Test.sol', true)

    await fs.writeFile('Test.sol', `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/package.json";
contract Test {}
    `.trim())

    try {
      await resolver.buildDependencyTree('Test.sol')
      expect.fail('Should have thrown error for package.json import')
    } catch (err: any) {
      expect(err.message).to.include('does not end with .sol extension')
      expect(err.message).to.include('package.json')
    }
  })

  it('should throw error when importing .md file', async () => {
    const io = new NodeIOAdapter()
    const resolver = new DependencyResolver(io as any, 'Test.sol', true)

    await fs.writeFile('Test.sol', `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v4.8.0/README.md";
contract Test {}
    `.trim())

    try {
      await resolver.buildDependencyTree('Test.sol')
      expect.fail('Should have thrown error for .md import')
    } catch (err: any) {
      expect(err.message).to.include('does not end with .sol extension')
      expect(err.message).to.include('README.md')
    }
  })

  it('should throw error when importing .txt file', async () => {
    const io = new NodeIOAdapter()
    const resolver = new DependencyResolver(io as any, 'Test.sol', true)

    await fs.writeFile('Test.sol', `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "https://unpkg.com/@openzeppelin/contracts@4.8.0/LICENSE.txt";
contract Test {}
    `.trim())

    try {
      await resolver.buildDependencyTree('Test.sol')
      expect.fail('Should have thrown error for .txt import')
    } catch (err: any) {
      expect(err.message).to.include('does not end with .sol extension')
      expect(err.message).to.include('LICENSE.txt')
    }
  })
})
