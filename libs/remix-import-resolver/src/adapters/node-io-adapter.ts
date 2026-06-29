import type { IOAdapter } from './io-adapter'
import { promises as fs } from 'fs'
import { dirname } from 'path'
import { toHttpUrl } from '../utils/to-http-url'
import {
  isHttpUrl,
  isDepsPath,
  DEPS_DIR,
  DEPS_HTTP_DIR,
  DEPS_NPM_DIR,
  sanitizeUrlToPath
} from '../constants/import-patterns'

export class NodeIOAdapter implements IOAdapter {
  private cacheEnabled = true

  setCacheEnabled(enabled: boolean): void { this.cacheEnabled = !!enabled }
  async readFile(path: string): Promise<string> {
    return await fs.readFile(path, 'utf8')
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, 'utf8')
  }

  async setFile(path: string, content: string): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true })
    await fs.writeFile(path, content, 'utf8')
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.stat(path)
      return true
    } catch {
      return false
    }
  }

  async mkdir(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true })
  }

  async fetch(url: string): Promise<string> {
    const finalUrl = toHttpUrl(url)
    const res = await fetch(finalUrl)
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${finalUrl}`)
    return await res.text()
  }

  async resolveAndSave(url: string, targetPath?: string, _useOriginal?: boolean): Promise<string> {
    let dest = targetPath
    if (!dest) {
      // Determine a deterministic destination under .deps
      if (isHttpUrl(url)) {
        try {
          const u = new URL(url)
          const cleanPath = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname
          dest = `${DEPS_HTTP_DIR}${u.hostname}/${cleanPath}`
        } catch {
          // Fallback to hashing or raw, but keep inside .deps/http
          const safe = sanitizeUrlToPath(url)
          dest = `${DEPS_HTTP_DIR}${safe}`
        }
      } else {
        // Treat as npm-like path (e.g., "@scope/pkg@ver/path")
        dest = `${DEPS_NPM_DIR}${url}`
      }
    } else if (!isDepsPath(dest)) {
      // Ensure all resolver-managed artifacts live under .deps
      dest = `${DEPS_DIR}${dest}`
    }

    // If cache is enabled and file exists, return cached content from disk
    if (this.cacheEnabled) {
      try {
        const exists = await this.exists(dest)
        if (exists) {
          return await this.readFile(dest)
        }
      } catch {
        // ignore and proceed to fetch
      }
    }

    const content = await this.fetch(url)
    await this.setFile(dest, content)
    return content
  }
}
