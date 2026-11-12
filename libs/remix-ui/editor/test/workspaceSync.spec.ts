import * as assert from 'assert'
import { afterEach, describe, it } from 'mocha'
import * as Y from 'yjs'
import { WorkspaceFiles, WorkspaceSync } from '../src/lib/swarm-collab/workspaceSync'

function entries(paths: string[], isDirectory = false): Record<string, { isDirectory: boolean }> {
  return Object.fromEntries(paths.map((path) => [path, { isDirectory }]))
}

describe('WorkspaceSync seeding', () => {
  const cleanups: (() => Promise<void>)[] = []

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })

  function workspace(directories: Record<string, Record<string, { isDirectory: boolean }>>) {
    const doc = new Y.Doc()
    const reads: string[] = []
    const listings: string[] = []
    const content = 'contract Z {}\n'
    const files: WorkspaceFiles = {
      async readdir(path) {
        listings.push(path)
        assert.ok(directories[path], `Unexpected directory: ${path}`)
        return directories[path]
      },
      async readFile(path) {
        reads.push(path)
        return content
      },
      async writeFile() {},
      async exists() { return true },
      async remove() {}
    }
    const sync = new WorkspaceSync(doc, files, {}, () => {}, () => {})
    cleanups.push(async () => {
      await sync.dispose()
      doc.destroy()
    })
    return { doc, sync, reads, listings, content }
  }

  it('seeds a Solidity file after 500 unsupported files', async () => {
    const images = Array.from({ length: 500 }, (_, i) => `${String(i).padStart(3, '0')}.png`)
    const { doc, sync, reads, content } = workspace({ '/': entries([...images, 'Z.sol']) })

    assert.strictEqual(await sync.start(true), 1)
    assert.deepStrictEqual([...doc.getMap('remix:files').keys()], ['Z.sol'])
    assert.strictEqual(doc.getText('file:Z.sol').toString(), content)
    assert.deepStrictEqual(reads, ['Z.sol'])
  })

  it('does not let unsupported files in a nested directory consume the limit', async () => {
    const images = Array.from({ length: 500 }, (_, i) => `/images/${i}.png`)
    const { sync, reads, listings } = workspace({
      '/': { ...entries(['/images'], true), ...entries(['/Z.sol']) },
      images: entries(images)
    })

    assert.strictEqual(await sync.start(true), 1)
    assert.strictEqual(sync.has('Z.sol'), true)
    assert.deepStrictEqual(reads, ['Z.sol'])
    assert.deepStrictEqual(listings, ['/', 'images'])
  })

  it('does not let secret files consume the limit', async () => {
    const secrets = Array.from({ length: 500 }, (_, i) => `.env.${i}`)
    const { sync, reads } = workspace({ '/': entries([...secrets, 'Z.sol']) })

    assert.strictEqual(await sync.start(true), 1)
    assert.strictEqual(sync.has('Z.sol'), true)
    assert.deepStrictEqual(reads, ['Z.sol'])
  })

  it('keeps excluded directories out of the traversal', async () => {
    const { sync, reads, listings } = workspace({
      '/': { ...entries(['node_modules', '.deps', 'artifacts', 'contracts'], true) },
      contracts: { ...entries(['contracts/build'], true), ...entries(['contracts/Z.sol']) }
    })

    assert.strictEqual(await sync.start(true), 1)
    assert.strictEqual(sync.has('contracts/Z.sol'), true)
    assert.deepStrictEqual(reads, ['contracts/Z.sol'])
    assert.deepStrictEqual(listings, ['/', 'contracts'])
  })

  it('seeds exactly 500 shareable files', async () => {
    const paths = Array.from({ length: 500 }, (_, i) => `${i}.sol`)
    const { doc, sync, reads } = workspace({ '/': entries(paths) })

    assert.strictEqual(await sync.start(true), 500)
    assert.strictEqual(sync.size, 500)
    assert.deepStrictEqual([...doc.getMap('remix:files').keys()], paths)
    assert.deepStrictEqual(reads, paths)
  })

  it('caps shareable files at 500 across directories', async () => {
    const root = Array.from({ length: 250 }, (_, i) => `${i}.sol`)
    const nested = Array.from({ length: 251 }, (_, i) => `contracts/${i}.sol`)
    const { doc, sync, reads, listings } = workspace({
      '/': { ...entries(root), ...entries(['contracts', 'later'], true) },
      contracts: entries(nested)
    })
    const expected = [...root, ...nested.slice(0, 250)]

    assert.strictEqual(await sync.start(true), 500)
    assert.strictEqual(sync.size, 500)
    assert.deepStrictEqual([...doc.getMap('remix:files').keys()], expected)
    assert.deepStrictEqual(reads, expected)
    assert.strictEqual(sync.has('contracts/250.sol'), false)
    assert.deepStrictEqual(listings, ['/', 'contracts'])
  })
})
