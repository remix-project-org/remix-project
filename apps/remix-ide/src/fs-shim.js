/**
 * Browser shim for Node.js 'fs' module.
 * Used by prettier-plugin-solidity's slang parser to load WASM files.
 * readFile uses fetch() to load files in the browser environment.
 */

export const constants = {
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 64,
  O_EXCL: 128,
  O_NOCTTY: 256,
  O_TRUNC: 512,
  O_APPEND: 1024,
  O_DIRECTORY: 65536,
  O_NOATIME: 262144,
  O_NOFOLLOW: 131072,
  O_SYNC: 1052672,
  O_SYMLINK: 2097152,
  O_DIRECT: 16384,
  O_NONBLOCK: 2048,
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1
}

// Async readFile that uses fetch for browser compatibility
export async function readFile(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch: ' + url)
  }
  return new Uint8Array(await response.arrayBuffer())
}

// Stub implementations for other fs functions
export async function writeFile() {
  throw new Error('fs.writeFile not available in browser')
}

export async function readdir() {
  throw new Error('fs.readdir not available in browser')
}

export async function stat() {
  throw new Error('fs.stat not available in browser')
}

export async function mkdir() {
  throw new Error('fs.mkdir not available in browser')
}

export async function rm() {
  throw new Error('fs.rm not available in browser')
}

export async function unlink() {
  throw new Error('fs.unlink not available in browser')
}

// promises namespace (same functions)
export const promises = {
  readFile,
  writeFile,
  readdir,
  stat,
  mkdir,
  rm,
  unlink
}

// Default export with all functions
export default {
  constants,
  promises,
  readFile,
  writeFile,
  readdir,
  stat,
  mkdir,
  rm,
  unlink
}
