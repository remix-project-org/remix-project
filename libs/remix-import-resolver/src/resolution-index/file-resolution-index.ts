import type { IOAdapter } from '../adapters/io-adapter'
import { Logger } from '../utils/logger'
import { BaseResolutionIndex } from './base-resolution-index'
import { DEPS_NPM_DIR } from '../constants/import-patterns'

/**
 * FileResolutionIndex (Node)
 *
 * Node-friendly implementation of the resolution index that persists mappings to
 * .deps/npm/.resolution-index.json for use by tooling (e.g., Go-to-Definition).
 */
export class FileResolutionIndex extends BaseResolutionIndex {
  constructor(private io: IOAdapter, private debug = false) {
    super(new Logger(undefined, debug))
  }

  protected log(message: string, ...args: any[]): void {
    this.logger.logIf('fileResolutionIndex', `[FileResolutionIndex] ${message}`, ...args)
  }

  /** Load the index from disk once per process (idempotent). */
  async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise
    if (this.isLoaded) return
    this.loadPromise = (async () => {
      try {
        if (await this.io.exists(this.indexPath)) {
          const content = await this.io.readFile(this.indexPath)
          this.index = JSON.parse(content)
          this.log(`Loaded ${Object.keys(this.index).length} files`)
        }
      } catch (err) {
        this.log(`Failed to load index:`, err)
        this.index = {}
      } finally {
        this.isLoaded = true
      }
    })()
    return this.loadPromise
  }

  /** Save the index to disk if it changed since the last save. */
  async save(): Promise<void> {
    if (!this.isDirty) return
    try {
      const dir = DEPS_NPM_DIR.slice(0, -1) // Remove trailing slash for directory
      if (!(await this.io.exists(dir))) await this.io.mkdir(dir)
      await this.io.writeFile(this.indexPath, JSON.stringify(this.index, null, 2))
      this.isDirty = false
      this.log(`Saved to ${this.indexPath}`)
    } catch (err) {
      this.log(`Failed to save index:`, err)
    }
  }
}
