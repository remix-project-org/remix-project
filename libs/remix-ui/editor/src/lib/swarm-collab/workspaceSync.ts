import * as Y from 'yjs'
import { normalizeEol, RecentTexts, setYText } from './text'

/** The subset of Remix's `fileManager` this module uses. Paths are workspace-relative. */
export interface WorkspaceFiles {
  readdir(path: string): Promise<Record<string, { isDirectory: boolean }>>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  remove(path: string): Promise<void>
}

const INDEX_KEY = 'remix:files'
const TEXT_PREFIX = 'file:'
const MAX_FILE_CHARS = 512 * 1024
const MAX_FILES = 500
const WRITE_DEBOUNCE_MS = 400
const ECHO_HISTORY = 16

// Build output, caches and dependencies: large and regenerated locally.
const EXCLUDED_SEGMENTS = new Set(['.deps', 'artifacts', '.states', '.git', 'node_modules', '.cache', 'cache', 'build', 'out', 'typechain-types'])
const TEXT_EXTENSIONS = new Set([
  'sol', 'yul', 'vy', 'py', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'json', 'md', 'txt', 'toml', 'yml', 'yaml', 'circom', 'nr', 'cairo', 'move', 'zok', 'rs', 'lex', 'sql', 'html', 'css', 'subgraph', 'graphql', 'gitignore', 'sh', 'prettierrc', 'solhint'
])

const SECRET_FILE = /^\.env(\..*)?$|\.(env|pem|key)$/i

export function normalizePath(path: string): string {
  return path.replace(/^\/+/, '')
}

function isExcluded(path: string): boolean {
  return normalizePath(path).split('/').some((segment) => EXCLUDED_SEGMENTS.has(segment))
}

/** Whether a workspace file takes part in a session. */
export function isShareable(path: string): boolean {
  if (isExcluded(path)) return false

  const segments = normalizePath(path).split('/')

  const name = segments[segments.length - 1]
  if (SECRET_FILE.test(name)) return false

  const dot = name.lastIndexOf('.')

  return dot === -1 || TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

/** Keeps a Remix workspace and the shared document in step: a `Y.Map` index of paths plus one root-level `Y.Text` per file. */
export class WorkspaceSync {
  private readonly index: Y.Map<boolean>
  private readonly writeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly pendingWrites = new Set<Promise<void>>()
  private readonly recent = new Map<string, RecentTexts>()
  private readonly textObservers = new Map<string, (event: Y.YTextEvent, transaction: Y.Transaction) => void>()
  private live = false
  private boundPath: string | null = null

  constructor(private readonly doc: Y.Doc, private readonly files: WorkspaceFiles, private readonly origin: object, private readonly onPathsChanged: () => void, private readonly log: (message: string) => void) {
    this.index = doc.getMap<boolean>(INDEX_KEY)
  }

  text(path: string): Y.Text {
    return this.doc.getText(TEXT_PREFIX + normalizePath(path))
  }

  has(path: string): boolean {
    return this.index.has(normalizePath(path))
  }

  get size(): number {
    return this.index.size
  }

  /** Starts mirroring once the document is synced; seeds from the workspace if `seed` and the index is empty. */
  async start(seed: boolean): Promise<number> {
    const seeded = seed && this.index.size === 0 ? await this.seedFromWorkspace() : 0

    this.index.observe(this.onIndexChange)
    for (const path of this.index.keys()) {
      this.watch(path)
      this.scheduleWrite(path)
    }

    return seeded
  }

  /** Starts reacting to local file events; until then, Remix's replayed events are ignored. */
  goLive(): void {
    this.live = true
  }

  setBoundPath(path: string | null): void {
    const previous = this.boundPath
    this.boundPath = path ? normalizePath(path) : null

    // Autosave may not have caught the last remote edits to a file that just lost the editor.
    if (previous && previous !== this.boundPath && this.index.has(previous)) this.scheduleWrite(previous)
  }

  async onFileAdded(rawPath: string): Promise<void> {
    const path = normalizePath(rawPath)
    if (!this.live || !isShareable(path) || this.index.has(path)) return

    const content = await this.readText(path)
    if (content === null || this.index.has(path)) return

    this.recentOf(path).add(content)
    this.doc.transact(() => {
      setYText(this.text(path), content)
      this.index.set(path, true)
    }, this.origin)
  }

  onFileRemoved(rawPath: string): void {
    const path = normalizePath(rawPath)
    if (!this.live) return

    const removed = [...this.index.keys()].filter((key) => key === path || key.startsWith(path + '/'))
    if (removed.length === 0) return

    this.doc.transact(() => removed.forEach((key) => this.forget(key)), this.origin)
  }

  async onFileRenamed(rawOld: string, rawNew: string): Promise<void> {
    const oldPath = normalizePath(rawOld)
    const newPath = normalizePath(rawNew)
    if (!this.live) return

    const moved = [...this.index.keys()].filter((key) => key === oldPath || key.startsWith(oldPath + '/'))
    const targets = await Promise.all(moved.map(async (key) => {
      const target = newPath + key.slice(oldPath.length)
      return { key, target, content: isShareable(target) ? await this.readText(target) : null }
    }))

    this.doc.transact(() => {
      for (const { key, target, content } of targets) {
        this.forget(key)
        if (content !== null) {
          this.recentOf(target).add(content)
          setYText(this.text(target), content)
          this.index.set(target, true)
        }
      }
    }, this.origin)
  }

  /** A file was written by autosave, another plugin, or remixd. */
  async onFileSaved(rawPath: string): Promise<void> {
    const path = normalizePath(rawPath)
    if (!this.live || !isShareable(path)) return
    if (!this.index.has(path)) return this.onFileAdded(path)
    if (path === this.boundPath) return

    const content = await this.readText(path)
    const text = this.text(path)
    if (content === null || content === text.toString() || this.recentOf(path).has(content)) return

    this.recentOf(path).add(content)
    this.doc.transact(() => setYText(text, content), this.origin)
  }

  /** Stops mirroring and waits for scheduled disk writes. */
  async dispose(): Promise<void> {
    this.live = false
    this.index.unobserve(this.onIndexChange)
    for (const path of [...this.textObservers.keys()]) this.unwatch(path)

    const scheduled = [...this.writeTimers.keys()]
    this.writeTimers.forEach((timer) => clearTimeout(timer))
    this.writeTimers.clear()
    scheduled.forEach((path) => this.track(this.writeToDisk(path)))

    // Writes and removals catch their own errors.
    await Promise.all([...this.pendingWrites])
  }

  private forget(path: string): void {
    this.index.delete(path)
    const text = this.text(path)
    if (text.length) text.delete(0, text.length)
  }

  private async seedFromWorkspace(): Promise<number> {
    const paths = (await this.listFiles('/')).filter(isShareable).slice(0, MAX_FILES)
    const contents = await Promise.all(paths.map(async (path) => ({ path, content: await this.readText(path) })))
    const seedable = contents.filter((entry) => entry.content !== null)

    this.doc.transact(() => {
      for (const { path, content } of seedable) {
        const text = this.text(path)
        if (text.length === 0) text.insert(0, content as string)
        this.index.set(path, true)
      }
    }, this.origin)
    this.log(`seeded ${seedable.length} file(s) from the workspace`)

    return seedable.length
  }

  private async listFiles(dir: string, found: string[] = []): Promise<string[]> {
    const entries = await this.files.readdir(dir)
    for (const [key, entry] of Object.entries(entries)) {
      const path = normalizePath(key)
      if (found.length >= MAX_FILES) break
      if (!entry.isDirectory) {
        found.push(path)
      } else if (!isExcluded(path)) {
        await this.listFiles(path, found)
      }
    }

    return found
  }

  private onIndexChange = (event: Y.YMapEvent<boolean>): void => {
    const remote = event.transaction.origin !== this.origin
    event.changes.keys.forEach((change, path) => {
      if (change.action === 'delete') {
        this.unwatch(path)
        if (remote) this.track(this.removeFromDisk(path))
      } else if (change.action === 'add') {
        this.watch(path)
        if (remote) this.scheduleWrite(path)
      }
    })
    this.onPathsChanged()
  }

  private watch(path: string): void {
    if (this.textObservers.has(path)) return

    const observer = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
      // Our own writes came from disk, so disk already has them.
      if (transaction.origin !== this.origin) this.scheduleWrite(path)
    }
    this.text(path).observe(observer)
    this.textObservers.set(path, observer)
  }

  private unwatch(path: string): void {
    const observer = this.textObservers.get(path)
    if (observer) this.text(path).unobserve(observer)
    this.textObservers.delete(path)

    const timer = this.writeTimers.get(path)
    if (timer) clearTimeout(timer)
    this.writeTimers.delete(path)
  }

  private scheduleWrite(path: string): void {
    if (path === this.boundPath) return

    const existing = this.writeTimers.get(path)
    if (existing) clearTimeout(existing)
    this.writeTimers.set(path, setTimeout(() => {
      this.writeTimers.delete(path)
      this.track(this.writeToDisk(path))
    }, WRITE_DEBOUNCE_MS))
  }

  private async writeToDisk(path: string): Promise<void> {
    if (path === this.boundPath || !this.index.has(path)) return

    const content = this.text(path).toString()
    try {
      if (await this.files.exists(path)) {
        const disk = await this.readText(path)
        if (disk === content) return
      }
      this.recentOf(path).add(content)
      await this.files.writeFile(path, content)
    } catch (err) {
      this.log(`could not write ${path}: ${(err as Error).message}`)
    }
  }

  private async removeFromDisk(path: string): Promise<void> {
    try {
      if (await this.files.exists(path)) await this.files.remove(path)
    } catch (err) {
      this.log(`could not remove ${path}: ${(err as Error).message}`)
    }
  }

  private async readText(path: string): Promise<string | null> {
    try {
      const content = await this.files.readFile(path)
      if (typeof content !== 'string' || content.length > MAX_FILE_CHARS) return null

      return normalizeEol(content)
    } catch {
      return null
    }
  }

  private recentOf(path: string): RecentTexts {
    let recent = this.recent.get(path)
    if (!recent) {
      recent = new RecentTexts(ECHO_HISTORY)
      this.recent.set(path, recent)
    }

    return recent
  }

  private track(write: Promise<void>): void {
    this.pendingWrites.add(write)
    write.finally(() => this.pendingWrites.delete(write))
  }
}
