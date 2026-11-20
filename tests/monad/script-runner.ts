import type { Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const revision = '8777d3c194f32602bd61a898f30b33d993873f67'
const directory = `tmp/monad-script-runner/${revision}`
const files = {
  'index.html': 'f30c6d9394f1f3e7573683ef4ea7f5b46abefa5b8c2e3e159efc809690d5a42d',
  'projects.json': '0e893ff4670d048af2cbfa14f43bb6b9299f7c63224f57a27a1e1e5f1b6cfca9',
  'projects/ethers6/script-runner.js': 'e5ae7ec63ccb545ee4115383b401f77e502fe5bcddd79745abe8a68b9088f536',
  'projects/ethers6/script-runner.js.LICENSE.txt': '9004c6480217c948d3e773b72fad7f20322d00e6be58630bfcc6620bcd9bb6b5'
}
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

export async function prepareScriptRunner() {
  // Use the published runner unchanged, pinned independently of its moving Pages deployment.
  await Promise.all(Object.entries(files).map(async ([file, checksum]) => {
    const path = `${directory}/${file}`
    if (existsSync(path) && sha256(readFileSync(path)) === checksum) return
    const response = await fetch(`https://raw.githubusercontent.com/remix-project-org/script-runner-generator/${revision}/${file}`, {
      signal: AbortSignal.timeout(60_000)
    })
    if (!response.ok) throw new Error(`Script runner download failed for ${file}: HTTP ${response.status}`)
    const data = new Uint8Array(await response.arrayBuffer())
    if (sha256(data) !== checksum) throw new Error(`Script runner checksum mismatch: ${file}`)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, data)
  }))
}

export async function routeScriptRunner(page: Page) {
  await page.route('https://remix-project-org.github.io/script-runner-generator**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/script-runner-generator') {
      url.pathname += '/'
      return route.fulfill({ status: 301, headers: { location: url.href } })
    }
    const file = url.pathname.slice('/script-runner-generator/'.length) || 'index.html'
    if (!(file in files)) throw new Error(`Unexpected script runner asset: ${file}`)
    const contentType = file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : file.endsWith('.js') ? 'application/javascript' : 'text/plain'
    await route.fulfill({ path: `${directory}/${file}`, contentType, headers: { 'access-control-allow-origin': '*' } })
  })
}
