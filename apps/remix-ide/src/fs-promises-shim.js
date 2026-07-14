/**
 * Browser shim for the 'fs/promises' module.
 * All three packages that import it (slang, deepagents, langsmith) do so in
 * Node.js-only code paths; stubs here prevent webpack bundle errors.
 * readFile uses fetch() so the slang WASM loader keeps working in the browser.
 */

async function readFile(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch: ' + url)
  return new Uint8Array(await response.arrayBuffer())
}

async function writeFile() { throw new Error('fs/promises.writeFile not available in browser') }
async function readdir() { throw new Error('fs/promises.readdir not available in browser') }
async function stat() { throw new Error('fs/promises.stat not available in browser') }
async function mkdir() { throw new Error('fs/promises.mkdir not available in browser') }
async function rm() { throw new Error('fs/promises.rm not available in browser') }
async function unlink() { throw new Error('fs/promises.unlink not available in browser') }
async function rename() { throw new Error('fs/promises.rename not available in browser') }
async function access() { throw new Error('fs/promises.access not available in browser') }
async function copyFile() { throw new Error('fs/promises.copyFile not available in browser') }

module.exports = { readFile, writeFile, readdir, stat, mkdir, rm, unlink, rename, access, copyFile }
