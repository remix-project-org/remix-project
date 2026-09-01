import { remixAILogger } from '../../helpers/logger'
import { Plugin } from '@remixproject/engine'
import EventEmitter from 'events'
import { ToolApprovalRequest, ToolApprovalResponse } from '../../types/humanInTheLoop'
import {
  getActiveQuickDappGenerationContext,
  getQuickDappGenerationContext
} from '../../helpers/quickDappGenerationContext'
import { clearQuickDappDocsContext, getQuickDappDocsContext } from '../../helpers/quickDappDocsContext'

const MAX_FILE_SIZE = 100 * 1024
const MAX_WALK_ENTRIES = 20000
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', '.nx', 'dist'])

interface FileInfo {
  name: string
  path: string
  is_dir: boolean
}

interface BackendError {
  error: string
}

interface GrepMatch {
  path: string
  file: string
  line: number
  text: string
}

/** Path of `absolute` relative to `root`, with no leading slash. */
const relativeTo = (root: string, absolute: string): string => {
  const base = root.endsWith('/') ? root : `${root}/`
  const relative = absolute.startsWith(base) ? absolute.slice(base.length) : absolute
  return relative.replace(/^\//, '')
}

/**
 * Translate a glob into a regex: a double star crosses directories, `*` and `?`
 * do not, `{a,b}` alternates, `[abc]` / `[!abc]` are character classes. A
 * leading double-star segment is optional so a recursive pattern also matches
 * files sitting at the search root. Case-insensitive, since a workspace search
 * that misses on capitalisation just reads as "file not found".
 */
const globToRegExp = (pattern: string): RegExp => {
  let out = ''
  let braceDepth = 0

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        i++
        if (pattern[i + 1] === '/') {
          i++
          out += '(?:[^\0]*/)?'
        } else {
          out += '[^\0]*'
        }
      } else {
        out += '[^/]*'
      }
    } else if (char === '?') {
      out += '[^/]'
    } else if (char === '[') {
      // Character class — pass it through, mapping the glob negation marker.
      const close = pattern.indexOf(']', i + 1)
      if (close === -1) {
        out += '\\['
      } else {
        const body = pattern.slice(i + 1, close)
        out += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`
        i = close
      }
    } else if (char === '{') {
      braceDepth++
      out += '(?:'
    } else if (char === '}' && braceDepth > 0) {
      braceDepth--
      out += ')'
    } else if (char === ',' && braceDepth > 0) {
      // A comma only separates alternatives inside braces; elsewhere it is
      // part of the filename.
      out += '|'
    } else {
      out += char.replace(/[.+^$()|[\]\\{}]/g, '\\$&')
    }
  }

  return new RegExp(`^${out}$`, 'i')
}

const matchesGlob = (relativePath: string, name: string, pattern: string): boolean => {
  const cleaned = pattern.replace(/^\.\//, '').replace(/^\//, '')
  if (!cleaned || cleaned === '*' || cleaned === '**') return true
  let regex: RegExp
  try {
    regex = globToRegExp(cleaned)
  } catch (e) {
    return false
  }
  if (regex.test(relativePath)) return true
  return !cleaned.includes('/') && regex.test(name)
}

const buildContentMatcher = (pattern: string): (line: string) => boolean => {
  let regex: RegExp | null = null
  try {
    regex = new RegExp(pattern)
  } catch (e) {
    regex = null
  }
  return (line: string) => line.includes(pattern) || (regex ? regex.test(line) : false)
}

interface EditInstruction {
  oldText: string
  newText: string
}

export class RemixFilesystemBackend {
  private plugin: Plugin
  private workspaceRoot: string = '/'
  private eventEmitter: EventEmitter | null = null
  private pendingApprovals = new Map<string, (result: { approved: boolean; modifiedContent?: string; timedOut?: boolean }) => void>()

  private editBatches = new Map<string, {
    originalContent: string
    virtualContent: string
    totalEdits: number
  }>()

  constructor(plugin: Plugin, eventEmitter?: EventEmitter) {
    this.plugin = plugin

    if (eventEmitter) {
      this.eventEmitter = eventEmitter
      this.eventEmitter.on('onToolApprovalResponse', (response: ToolApprovalResponse) => {
        const resolve = this.pendingApprovals.get(response.requestId)
        if (resolve) {
          resolve({
            approved: response.approved,
            modifiedContent: response.modifiedArgs?.content,
            timedOut: response.timedOut
          })
          this.pendingApprovals.delete(response.requestId)
        } else {

        }
      })
    }
  }

  async edit(
    filePath: string, oldString: string, newString: string, replaceAll = false
  ): Promise<{ error?: string; occurrences?: number; metadata?: any; filesUpdate?: any }> {

    try {
      const managedConfigWrite = this.getQuickDappManagedConfigWriteError(this.normalizePath(filePath))
      if (managedConfigWrite) return managedConfigWrite

      // If there are pending edits for a DIFFERENT file, flush them first
      for (const [batchFile] of this.editBatches) {
        if (batchFile !== filePath) {

          await this.flushEditBatch(batchFile)
        }
      }

      // Get content — either from an existing batch or from the filesystem
      let batch = this.editBatches.get(filePath)
      let content: string

      if (batch) {
        // Use virtual content from previous edits in this batch
        content = batch.virtualContent

      } else {
        // First edit — read from filesystem and start a new batch
        const readResult = await this.read_file(filePath)
        if (typeof readResult !== 'string') {
          return { error: `Failed to read file: ${(readResult as any).error || 'unknown error'}` }
        }
        content = readResult
        batch = {
          originalContent: content,
          virtualContent: content,
          totalEdits: 0
        }
        this.editBatches.set(filePath, batch)

      }

      // Check if oldString exists in the virtual content
      if (!content.includes(oldString)) {

        return { error: `Text not found in file: "${oldString.substring(0, 50)}..."` }
      }

      // Apply replacement to virtual content
      const updated = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString)
      const occurrences = replaceAll
        ? (content.split(oldString).length - 1)
        : 1

      batch.virtualContent = updated
      batch.totalEdits += occurrences

      // Return success immediately — approval will come later via flush
      return { occurrences }
    } catch (err) {
      remixAILogger.error('[HITL][Backend] edit() error:', err)
      return { error: err.message }
    }
  }

  /**
   * Flush accumulated edits for a file: show combined diff, request ONE approval.
   */
  private async flushEditBatch(filePath: string): Promise<void> {
    const batch = this.editBatches.get(filePath)
    if (!batch) return
    this.editBatches.delete(filePath)

    const normalizedPath = this.normalizePath(filePath)
    const managedConfigWrite = this.getQuickDappManagedConfigWriteError(normalizedPath)
    if (managedConfigWrite) {
      return
    }
    const workspaceMismatch = await this.getQuickDappWorkspaceMismatch(normalizedPath, this.isQuickDappCandidatePath(normalizedPath))
    if (workspaceMismatch) {
      remixAILogger.warn('[QuickDapp][WorkspaceLock] blocked pending edit flush in wrong workspace', {
        filePath,
        normalizedPath,
        error: workspaceMismatch.error
      })
      return
    }
    const pathMismatch = this.getQuickDappPathMismatch(normalizedPath, this.isQuickDappCandidatePath(normalizedPath))
    if (pathMismatch) {
      remixAILogger.warn('[QuickDapp][WorkspaceLock] blocked pending edit flush at wrong DApp source root', {
        filePath,
        normalizedPath,
        error: pathMismatch.error
      })
      return
    }

    // Request ONE approval for the combined diff
    const result = await this.requestWriteApproval(filePath, batch.originalContent, batch.virtualContent, 'edit_file')

    if (!result.approved) {

      // Revert: the file still has original content (we never wrote during batching)
      return
    }

    const finalContent = result.modifiedContent || batch.virtualContent
    const graphGatewayWrite = this.getQuickDappGraphGatewayWriteError(normalizedPath, finalContent)
    if (graphGatewayWrite) {
      return
    }

    await this.writeFileInternal(filePath, finalContent)
  }

  /**
   * Settle every write approval still waiting on the user as "rejected" and
   * drop any unflushed edit batch.
   */
  public cancelPendingApprovals(): void {
    const pending = Array.from(this.pendingApprovals.values())
    this.pendingApprovals.clear()
    this.editBatches.clear()
    if (pending.length === 0) return
    remixAILogger.log('[RemixFilesystemBackend] cancelling pending write approvals:', pending.length)
    for (const resolve of pending) {
      try {
        resolve({ approved: false })
      } catch (e) {
        remixAILogger.warn('[RemixFilesystemBackend] failed to settle pending approval', e)
      }
    }
  }

  public async flushAllPendingBatches(): Promise<void> {
    const files = [...this.editBatches.keys()]
    if (files.length === 0) return

    // Trigger all flush operations synchronously and wait for all to complete
    await Promise.all(files.map(file => this.flushEditBatch(file)))
  }

  /** Always absolute: `getCurrentFile` returns a workspace-relative path. */
  async cwd(): Promise<string> {
    await this.flushAllPendingBatches()
    try {
      // Try to get the current file's directory
      const currentFile = await this.plugin.call('fileManager', 'getCurrentFile')
      if (currentFile) {
        const lastSlash = currentFile.lastIndexOf('/')
        if (lastSlash > 0) {
          return this.normalizePath(currentFile.substring(0, lastSlash))
        }
      }
    } catch (e) {
      // Fallback to workspace root
    }
    return this.workspaceRoot
  }

  async read_file(path: string): Promise<string | { error: string }> {
    try {
      const guardPath = this.normalizePath(path)
      const isQuickDappCandidatePath = this.isQuickDappCandidatePath(guardPath)
      const workspaceMismatch = await this.getQuickDappWorkspaceMismatch(guardPath, this.isQuickDappCandidatePath(guardPath))
      if (workspaceMismatch) return workspaceMismatch
      const pathMismatch = this.getQuickDappPathMismatch(guardPath, isQuickDappCandidatePath)
      if (pathMismatch) return pathMismatch

      const batch = this.editBatches.get(path) || this.editBatches.get(guardPath)
      if (batch) {
        return batch.virtualContent
      }

      const exists = await this.plugin.call('fileManager', 'exists', path)

      if (!exists) {

        throw new Error(`File not found: ${path}`)
      }

      const content = await this.plugin.call('fileManager', 'readFile', path)

      if (content.length > MAX_FILE_SIZE) {
        return this.summarizeFile(path, content)
      }

      return content
    } catch (error) {
      return `Failed to read file ${path}: ${error.message}`
    }
  }

  async read(file_path: string, _offset?: number, _limit?: number): Promise<string | { error: string }> {
    try {
      const content = await this.read_file(file_path)
      if (typeof content !== 'string') return content

      if (_offset !== undefined || _limit !== undefined) {
        const lines = content.split('\n')
        const start = _offset ?? 0
        const end = _limit !== undefined ? start + _limit : undefined
        return lines.slice(start, end).join('\n')
      }

      return content
    } catch (error) {
      return { error: `Failed to read file ${file_path}: ${error.message}` }
    }
  }

  async write_file(path: string, content: string): Promise<{ success?: boolean, error?: string }> {
    await this.flushAllPendingBatches()

    try {
      // Defensive: strip workspace name prefix if the agent accidentally includes it
      // e.g. "dapp-storage-abc/src/App.jsx" → "/src/App.jsx"
      let normalizedPath = path
      let currentWorkspaceName = ''
      try {
        const currentWs = await this.plugin.call('filePanel' as any, 'getCurrentWorkspace')
        currentWorkspaceName = currentWs?.name || ''
        if (currentWs?.name && normalizedPath.startsWith(currentWs.name + '/')) {
          remixAILogger.warn(`[QuickDapp] Stripping workspace prefix from path: ${normalizedPath}`)
          normalizedPath = normalizedPath.substring(currentWs.name.length)
        }
      } catch (e) { /* ignore workspace check failure */ }
      if (!normalizedPath.startsWith('/')) normalizedPath = '/' + normalizedPath
      const isQuickDappDocsWrite = this.isQuickDappDocumentationPath(normalizedPath)
      const docsContext = isQuickDappDocsWrite ? getQuickDappDocsContext() : undefined
      if (docsContext && currentWorkspaceName !== docsContext.workspaceName) {
        clearQuickDappDocsContext()
        return {
          error:
            `DAPP_DOCS_WORKSPACE_MISMATCH: Refusing to write ${normalizedPath} in workspace ` +
            `"${currentWorkspaceName || 'unknown'}". Expected "${docsContext.workspaceName}". ` +
            `Run generate_dapp_docs again for the intended workspace.`
        }
      }
      const activeQuickDappContext = getActiveQuickDappGenerationContext()
      const activeWorkspacePrefix = activeQuickDappContext?.workspaceName ? `/${activeQuickDappContext.workspaceName}/` : ''
      if (activeWorkspacePrefix && normalizedPath.startsWith(activeWorkspacePrefix)) {
        remixAILogger.warn(`[QuickDapp] Stripping target workspace prefix from path: ${normalizedPath}`)
        normalizedPath = normalizedPath.substring(activeQuickDappContext.workspaceName.length + 1)
        if (!normalizedPath.startsWith('/')) normalizedPath = '/' + normalizedPath
      }
      const managedConfigWrite = this.getQuickDappManagedConfigWriteError(normalizedPath)
      if (managedConfigWrite) return managedConfigWrite
      const isQuickDappCandidatePath = this.isQuickDappCandidatePath(normalizedPath)
      const hasWeb3DappContent = !this.isQuickDappDocumentationPath(normalizedPath) && this.hasQuickDappWeb3Content(content)
      const shouldEnforceQuickDappRouting =
        (isQuickDappCandidatePath && hasWeb3DappContent) ||
        normalizedPath.startsWith('/frontend/') ||
        normalizedPath.startsWith('/dapp/') ||
        /[-_.]dapp\.(html|jsx?|tsx?|css)$/i.test(normalizedPath)
      const workspaceMismatch = await this.getQuickDappWorkspaceMismatch(normalizedPath, isQuickDappCandidatePath)
      if (workspaceMismatch) return workspaceMismatch
      const pathMismatch = this.getQuickDappPathMismatch(normalizedPath, shouldEnforceQuickDappRouting)
      if (pathMismatch) return pathMismatch
      if (isQuickDappCandidatePath) {
        const activeQuickDappContext = currentWorkspaceName
          ? getQuickDappGenerationContext(currentWorkspaceName)
          : undefined
        if (shouldEnforceQuickDappRouting && !activeQuickDappContext) {
          return {
            error:
              `QUICKDAPP_ROUTING_REQUIRED: This looks like a DApp frontend file, but generate_dapp/update_dapp has not prepared a QuickDapp workspace. ` +
              `Do NOT write this file directly. Ask the setup options if needed, then call generate_dapp with setupOptionsConfirmed=true and setupOptionsSummary. ` +
              `After generate_dapp returns file instructions, write only the paths it specifies.`
          }
        }
      }
      const exists = await this.plugin.call('fileManager', 'exists', normalizedPath)

      let oldContent = ''
      if (exists) {
        oldContent = await this.plugin.call('fileManager', 'readFile', normalizedPath)

      }

      const result = await this.requestWriteApproval(normalizedPath, oldContent, content, 'write_file')

      if (!result.approved) {
        if (isQuickDappDocsWrite) clearQuickDappDocsContext()
        if (result.timedOut) {
          return { error: `TIMEOUT: No user input within 60 seconds for writing to ${path}. The user did not respond to the approval request. You may decide what to do next — retry, try a different approach, or skip this operation.` }
        }
        return { error: `REJECTED: The user explicitly rejected writing to ${path}. Do NOT retry this operation or use alternative tools/methods to write this file. Inform the user and move on.` }
      }

      const finalContent = result.modifiedContent || content
      const graphGatewayWrite = this.getQuickDappGraphGatewayWriteError(normalizedPath, finalContent)
      if (graphGatewayWrite) {
        if (isQuickDappDocsWrite) clearQuickDappDocsContext()
        return graphGatewayWrite
      }
      if (docsContext) {
        const writeWorkspaceName = await this.getCurrentWorkspaceName()
        if (writeWorkspaceName !== docsContext.workspaceName) {
          clearQuickDappDocsContext()
          return {
            error:
              `DAPP_DOCS_WORKSPACE_MISMATCH: Refusing to write ${normalizedPath} in workspace ` +
              `"${writeWorkspaceName || 'unknown'}". Expected "${docsContext.workspaceName}". ` +
              `Run generate_dapp_docs again for the intended workspace.`
          }
        }
      }

      await this.writeFileInternal(normalizedPath, finalContent)
      if (isQuickDappDocsWrite) {
        clearQuickDappDocsContext()
        if (docsContext) {
          try {
            await this.plugin.call('fileManager', 'open', normalizedPath)
          } catch (error) {
            remixAILogger.warn(`[QuickDapp] Failed to open ${normalizedPath} after generation`, error)
          }
        }
      }

      return { success: true }
    } catch (error) {
      if (this.isQuickDappDocumentationPath(path)) clearQuickDappDocsContext()
      remixAILogger.error('[HITL][Backend] write_file ERROR:', path, error)
      return { error: `Failed to write file ${path}: ${error.message}` }
    }
  }

  async write(file_path: string, content: string): Promise<any> {

    return await this.write_file(file_path, content)
  }

  private async writeFileInternal(path: string, content: string): Promise<void> {

    await this.plugin.call('fileManager', 'writeFile', path, content)
  }

  async edit_file(path: string, edits: EditInstruction[]): Promise<{ success?: boolean, error?: string }> {
    await this.flushAllPendingBatches()

    try {
      const normalizedPath = this.normalizePath(path)
      const managedConfigWrite = this.getQuickDappManagedConfigWriteError(normalizedPath)
      if (managedConfigWrite) return managedConfigWrite
      const workspaceMismatch = await this.getQuickDappWorkspaceMismatch(normalizedPath, this.isQuickDappCandidatePath(normalizedPath))
      if (workspaceMismatch) return workspaceMismatch
      const pathMismatch = this.getQuickDappPathMismatch(normalizedPath, this.isQuickDappCandidatePath(normalizedPath))
      if (pathMismatch) return pathMismatch

      const originalContent = await this.read_file(normalizedPath)

      if (typeof originalContent !== 'string') {

        return { error: `Failed to read file: ${(originalContent as any).error}` }
      }

      let content = originalContent
      for (const edit of edits) {
        const { oldText, newText } = edit
        if (!content.includes(oldText)) {

          return { error: `Text not found in file: "${oldText.substring(0, 50)}..."` }
        }
        content = content.replace(oldText, newText)
      }

      const result = await this.requestWriteApproval(normalizedPath, originalContent, content, 'edit_file')
      if (!result.approved) {
        if (result.timedOut) {
          return { error: `TIMEOUT: No user input within 60 seconds for editing ${path}. The user did not respond to the approval request. You may decide what to do next — retry, try a different approach, or skip this operation.` }
        }
        return { error: `REJECTED: The user explicitly rejected editing ${path}. Do NOT retry this operation or use alternative tools/methods to edit this file. Inform the user and move on.` }
      }

      const finalContent = result.modifiedContent || content
      const graphGatewayWrite = this.getQuickDappGraphGatewayWriteError(normalizedPath, finalContent)
      if (graphGatewayWrite) return graphGatewayWrite

      await this.writeFileInternal(normalizedPath, finalContent)

      return { success: true }
    } catch (error) {
      remixAILogger.error('[HITL][Backend] edit_file() ERROR:', error)
      return { error: `Failed to edit file ${path}: ${error.message}` }
    }
  }

  async ls(path?: string): Promise<FileInfo[] | BackendError> {
    return this.lsInfo(path)
  }

  async lsInfo(path?: string): Promise<FileInfo[] | BackendError> {
    await this.flushAllPendingBatches()
    try {
      const targetPath = path ? this.normalizePath(path) : await this.cwd()
      const exists = await this.plugin.call('fileManager', 'exists', targetPath)
      if (!exists) return { error: `Path not found: ${targetPath}` }

      const isDir = await this.plugin.call('fileManager', 'isDirectory', targetPath)
      if (!isDir) return { error: `Not a directory: ${targetPath}` }

      return await this.readEntries(targetPath)
    } catch (error) {
      remixAILogger.warn('[Backend] ls failed', path, error)
      return { error: `Failed to list ${path || 'cwd'}: ${error.message}` }
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.flushAllPendingBatches()
    try {
      const normalizedPath = this.normalizePath(path)
      await this.plugin.call('fileManager', 'mkdir', normalizedPath)
    } catch (error) {
    }
  }

  async globInfo(pattern: string, path?: string): Promise<FileInfo[] | BackendError> {
    await this.flushAllPendingBatches()
    try {
      const targetPath = path ? this.normalizePath(path) : this.workspaceRoot
      const exists = await this.plugin.call('fileManager', 'exists', targetPath)
      if (!exists) return { error: `Path not found: ${targetPath}` }

      const isDir = await this.plugin.call('fileManager', 'isDirectory', targetPath)
      if (!isDir) {
        const name = targetPath.split('/').pop() || targetPath
        return matchesGlob(name, name, pattern) ? [{ name, path: targetPath, is_dir: false }] : []
      }

      const entries = await this.walk(targetPath)
      return entries
        .filter(entry => !entry.is_dir && matchesGlob(relativeTo(targetPath, entry.path), entry.name, pattern))
        .sort((a, b) => a.path.localeCompare(b.path))
    } catch (error) {
      remixAILogger.warn('[Backend] glob failed', pattern, path, error)
      return { error: `Failed to glob '${pattern}': ${error.message}` }
    }
  }

  async grepRaw(
    pattern: string, path?: string, glob?: string | null, maxCount?: number | null
  ): Promise<GrepMatch[] | BackendError> {
    await this.flushAllPendingBatches()
    try {
      const targetPath = path ? this.normalizePath(path) : this.workspaceRoot
      const exists = await this.plugin.call('fileManager', 'exists', targetPath)
      if (!exists) return { error: `Path not found: ${targetPath}` }

      const isDir = await this.plugin.call('fileManager', 'isDirectory', targetPath)
      const matcher = buildContentMatcher(pattern)

      // `path` is the field deepagents groups matches by (`buildGrepResultsDict`);
      // returning `file` instead is what produced tool output that read
      // literally "undefined" with every match collapsed under one key.
      const files: FileInfo[] = isDir
        ? (await this.walk(targetPath)).filter(entry => !entry.is_dir)
        : [{ name: targetPath.split('/').pop() || targetPath, path: targetPath, is_dir: false }]

      const results: GrepMatch[] = []
      const limit = maxCount && maxCount > 0 ? maxCount : Infinity

      for (const file of files) {
        if (results.length >= limit) break
        if (glob && !matchesGlob(relativeTo(targetPath, file.path), file.name, glob)) continue

        let content: string
        try {
          content = await this.plugin.call('fileManager', 'readFile', file.path)
        } catch (e) {
          continue
        }
        if (typeof content !== 'string') continue

        const lines = content.split('\n')
        for (let i = 0; i < lines.length && results.length < limit; i++) {
          if (matcher(lines[i])) {
            results.push({ path: file.path, file: file.path, line: i + 1, text: lines[i] })
          }
        }
      }
      return results
    } catch (error) {
      remixAILogger.warn('[Backend] grep failed', pattern, path, error)
      return { error: `Failed to grep '${pattern}': ${error.message}` }
    }
  }

  /** One directory level, as absolute paths. */
  private async readEntries(dir: string): Promise<FileInfo[]> {
    const entries = await this.plugin.call('fileManager', 'readdir', dir)
    return Object.keys(entries || {}).map(key => {
      const absolute = key.startsWith('/') ? key : `/${key}`
      return {
        name: absolute.split('/').pop() || absolute,
        path: absolute,
        is_dir: !!entries[key]?.isDirectory
      }
    })
  }

  /** Every entry under `root`, depth-first. */
  private async walk(root: string): Promise<FileInfo[]> {
    const collected: FileInfo[] = []
    const queue = [root]
    const seen = new Set<string>([root])

    while (queue.length > 0 && collected.length < MAX_WALK_ENTRIES) {
      const dir = queue.shift() as string
      let entries: FileInfo[]
      try {
        entries = await this.readEntries(dir)
      } catch (e) {
        continue
      }

      for (const entry of entries) {
        collected.push(entry)
        if (entry.is_dir && !SKIPPED_DIRECTORIES.has(entry.name) && !seen.has(entry.path)) {
          seen.add(entry.path)
          queue.push(entry.path)
        }
      }
    }

    if (collected.length >= MAX_WALK_ENTRIES) {
      remixAILogger.warn(`[Backend] walk of ${root} hit the ${MAX_WALK_ENTRIES}-entry cap`)
    }
    return collected
  }

  private normalizePath(path: string): string {
    let normalized = path.replace(/^\.\//, '').replace(/^\.\.\//, '')
    if (!normalized.startsWith('/')) {
      normalized = `${this.workspaceRoot}/${normalized}`
    }

    normalized = normalized.replace(/\/\//g, '/')

    return normalized
  }

  private isQuickDappCandidatePath(path: string): boolean {
    return path === '/index.html' ||
      path.startsWith('/src/') ||
      path.startsWith('/frontend/') ||
      path.startsWith('/dapp/') ||
      /[-_.]dapp\.(html|jsx?|tsx?|css)$/i.test(path)
  }

  private isQuickDappDocumentationPath(path: string): boolean {
    const normalizedPath = path.startsWith('/') ? path : this.normalizePath(path)
    return normalizedPath === '/dapp-docs.md'
  }

  private getQuickDappManagedConfigWriteError(path: string): { error: string } | undefined {
    const normalizedPath = path.startsWith('/') ? path : this.normalizePath(path)
    if (normalizedPath !== '/dapp.config.json' && normalizedPath !== '/frontend/dapp.config.json') return undefined

    const activeQuickDappContext = getActiveQuickDappGenerationContext()
    if (!activeQuickDappContext) return undefined

    const error =
      `QUICKDAPP_MANAGED_CONFIG: "${normalizedPath}" is managed by QuickDapp. ` +
      `Do not write or edit dapp.config.json. Write only source files, then call finalize_dapp_generation.`

    return { error }
  }

  private getQuickDappGraphGatewayWriteError(path: string, content: string): { error: string } | undefined {
    const activeQuickDappContext = getActiveQuickDappGenerationContext()
    if (!activeQuickDappContext) return undefined

    const normalizedPath = path.startsWith('/') ? path : this.normalizePath(path)
    if (!this.isQuickDappCandidatePath(normalizedPath)) return undefined
    const unkeyedGatewayEndpointPattern =
      /(?:fetch\s*\(\s*|(?:const|let|var)\s+[A-Za-z0-9_$]*(?:GRAPH|GRAPHQL|SUBGRAPH|ENDPOINT|URL|GATEWAY)[A-Za-z0-9_$]*\s*=\s*)['"`]https:\/\/gateway\.thegraph\.com\/api\/subgraphs\/id\//i
    if (!unkeyedGatewayEndpointPattern.test(content)) return undefined

    const error =
      `QUICKDAPP_GRAPH_GATEWAY_API_KEY_REQUIRED: "${normalizedPath}" contains a The Graph gateway URL without an API key. ` +
      `Do not fetch https://gateway.thegraph.com/api/subgraphs/id/... directly. ` +
      `Read window.__QUICK_DAPP_GRAPH_CONFIG__, prefer graphConfig.proxyEndpoint plus source.proxyToken for deployed DApps, ` +
      `and use graphConfig.apiKey only for Remix preview. Do not add a The Graph API key input or localStorage key fallback.`

    return { error }
  }

  private hasQuickDappWeb3Content(content: string): boolean {
    return typeof content === 'string' &&
      /0x[a-fA-F0-9]{40}/.test(content) &&
      /ethers|window\.ethereum|BrowserProvider|eth_requestAccounts|new Contract|contract ABI/i.test(content)
  }

  private async getCurrentWorkspaceName(): Promise<string> {
    try {
      const currentWs = await this.plugin.call('filePanel' as any, 'getCurrentWorkspace')
      return currentWs?.name || ''
    } catch {
      return ''
    }
  }

  private getQuickDappPathMismatch(path: string, shouldCheck: boolean): { error: string } | undefined {
    if (!shouldCheck) return undefined

    const activeQuickDappContext = getActiveQuickDappGenerationContext()
    if (!activeQuickDappContext) return undefined

    const normalizedPath = path.startsWith('/') ? path : this.normalizePath(path)
    const isInlinePath = normalizedPath.startsWith('/frontend/')
    const isWrongRoot = activeQuickDappContext.isInlineMode
      ? !isInlinePath
      : isInlinePath || normalizedPath.startsWith('/dapp/')

    if (!isWrongRoot) return undefined

    const expectedExample = activeQuickDappContext.isInlineMode
      ? '/frontend/src/App.jsx'
      : '/src/App.jsx'
    const rejectedExample = activeQuickDappContext.isInlineMode
      ? '/src/App.jsx'
      : '/frontend/src/App.jsx'
    const error =
      `QUICKDAPP_PATH_MISMATCH: QuickDapp ${activeQuickDappContext.operation} is targeting ` +
      `${activeQuickDappContext.isInlineMode ? 'inline mode under /frontend' : 'workspace mode at the workspace root'}, ` +
      `but the requested path "${normalizedPath}" is in the wrong DApp source root. ` +
      `Use paths like "${expectedExample}", not "${rejectedExample}".`

    remixAILogger.warn('[QuickDapp][WorkspaceLock] blocked file tool at wrong DApp source root', {
      operation: activeQuickDappContext.operation,
      workspaceName: activeQuickDappContext.workspaceName,
      isInlineMode: activeQuickDappContext.isInlineMode,
      sourceRoot: activeQuickDappContext.sourceRoot,
      path: normalizedPath
    })

    return { error }
  }

  private async getQuickDappWorkspaceMismatch(path: string, shouldCheck: boolean): Promise<{ error: string } | undefined> {
    if (!shouldCheck) return undefined

    const activeQuickDappContext = getActiveQuickDappGenerationContext()
    if (!activeQuickDappContext) return undefined

    const currentWorkspaceName = await this.getCurrentWorkspaceName()
    if (currentWorkspaceName === activeQuickDappContext.workspaceName) return undefined

    const currentWorkspaceLabel = currentWorkspaceName || 'unknown'
    const error =
      `QUICKDAPP_WORKSPACE_MISMATCH: QuickDapp ${activeQuickDappContext.operation} is targeting workspace ` +
      `"${activeQuickDappContext.workspaceName}", but the current workspace is "${currentWorkspaceLabel}" while accessing "${path}". ` +
      `Do not read, edit, or write DApp frontend files in the current workspace. Switch back to "${activeQuickDappContext.workspaceName}" or wait for the QuickDapp operation to finish.`

    remixAILogger.warn('[QuickDapp][WorkspaceLock] blocked file tool in wrong workspace', {
      operation: activeQuickDappContext.operation,
      lockedWorkspace: activeQuickDappContext.workspaceName,
      currentWorkspace: currentWorkspaceLabel,
      path
    })

    return { error }
  }

  private summarizeFile(path: string, content: string): string {
    const ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase()
    if (ext === 'sol') {
      return this.summarizeSolidityFile(content)
    }

    // Generic summarization
    const lines = content.split('\n')
    const summary = [
      `[File too large (${content.length} bytes), showing summary]`,
      '',
      `Total lines: ${lines.length}`,
      '',
      '=== First 50 lines ===',
      ...lines.slice(0, 50),
      '',
      '=== Last 50 lines ===',
      ...lines.slice(-50)
    ]

    return summary.join('\n')
  }

  private summarizeSolidityFile(content: string): string {
    const lines = content.split('\n')
    const summary: string[] = [
      '[Solidity file summary - large file auto-summarized]',
      ''
    ]

    const pragmas = lines.filter(line => line.trim().startsWith('pragma'))
    const imports = lines.filter(line => line.trim().startsWith('import'))

    if (pragmas.length > 0) {
      summary.push('=== Pragma ===')
      summary.push(...pragmas)
      summary.push('')
    }

    if (imports.length > 0) {
      summary.push('=== Imports ===')
      summary.push(...imports)
      summary.push('')
    }

    // Extract contracts, interfaces, and libraries
    const contractRegex = /^\s*(contract|interface|library)\s+(\w+)/
    const functionRegex = /^\s*function\s+(\w+)/
    const eventRegex = /^\s*event\s+(\w+)/

    let currentContract = ''
    const contracts: Record<string, { functions: string[], events: string[] }> = {}

    for (const line of lines) {
      const contractMatch = line.match(contractRegex)
      if (contractMatch) {
        currentContract = contractMatch[2]
        contracts[currentContract] = { functions: [], events: []}
        summary.push(`=== ${contractMatch[1]} ${currentContract} ===`)
      }

      if (currentContract) {
        const functionMatch = line.match(functionRegex)
        if (functionMatch) {
          contracts[currentContract].functions.push(line.trim())
        }

        const eventMatch = line.match(eventRegex)
        if (eventMatch) {
          contracts[currentContract].events.push(line.trim())
        }
      }
    }

    // Add functions and events to summary
    for (const [contractName, data] of Object.entries(contracts)) {
      if (data.functions.length > 0) {
        summary.push(`Functions in ${contractName}:`)
        summary.push(...data.functions)
        summary.push('')
      }
      if (data.events.length > 0) {
        summary.push(`Events in ${contractName}:`)
        summary.push(...data.events)
        summary.push('')
      }
    }

    summary.push(`[Total size: ${content.length} bytes, ${lines.length} lines]`)

    return summary.join('\n')
  }

  private async requestWriteApproval(
    path: string,
    oldContent: string,
    newContent: string,
    toolName: string = 'write_file'
  ): Promise<{ approved: boolean; modifiedContent?: string; timedOut?: boolean }> {
    if (!this.eventEmitter) {

      return { approved: true }
    }

    const requestId = `fs_approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const request: ToolApprovalRequest = {
      requestId,
      toolName,
      toolArgs: { path, content: newContent },
      category: 'file_write',
      risk: 'high',
      existingContent: oldContent || undefined,
      proposedContent: newContent,
      filePath: path,
      timestamp: Date.now()
    }

    return new Promise<{ approved: boolean; modifiedContent?: string; timedOut?: boolean }>((resolve) => {
      this.pendingApprovals.set(requestId, resolve)
      this.eventEmitter.emit('onToolApprovalRequired', request)
    })
  }
}
