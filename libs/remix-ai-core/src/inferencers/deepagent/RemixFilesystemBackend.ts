import { remixAILogger } from '../../helpers/logger'
import { Plugin } from '@remixproject/engine'
import EventEmitter from 'events'
import { ToolApprovalRequest, ToolApprovalResponse } from '../../types/humanInTheLoop'
import {
  getActiveQuickDappGenerationContext,
  getQuickDappGenerationContext
} from '../../helpers/quickDappGenerationContext'

// File size limit for auto-summarization (100KB)
const MAX_FILE_SIZE = 100 * 1024

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

  public async flushAllPendingBatches(): Promise<void> {
    const files = [...this.editBatches.keys()]
    if (files.length === 0) return

    // Trigger all flush operations synchronously and wait for all to complete
    await Promise.all(files.map(file => this.flushEditBatch(file)))
  }

  async cwd(): Promise<string> {
    await this.flushAllPendingBatches()
    try {
      // Try to get the current file's directory
      const currentFile = await this.plugin.call('fileManager', 'getCurrentFile')
      if (currentFile) {
        const lastSlash = currentFile.lastIndexOf('/')
        if (lastSlash > 0) {
          return currentFile.substring(0, lastSlash)
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
    // NOTE: offset and limit parameters are ignored - always return full file content
    // This prevents the AI from making multiple turns to read a file in chunks
    try {
      return await this.read_file(file_path)
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
      const hasWeb3DappContent = this.hasQuickDappWeb3Content(content)
      const shouldEnforceQuickDappRouting =
        hasWeb3DappContent ||
        normalizedPath.startsWith('/frontend/') ||
        normalizedPath.startsWith('/dapp/') ||
        /[-_.]dapp\.(html|jsx?|tsx?|css)$/i.test(normalizedPath)
      const workspaceMismatch = await this.getQuickDappWorkspaceMismatch(normalizedPath, isQuickDappCandidatePath || hasWeb3DappContent)
      if (workspaceMismatch) return workspaceMismatch
      const pathMismatch = this.getQuickDappPathMismatch(normalizedPath, shouldEnforceQuickDappRouting)
      if (pathMismatch) return pathMismatch
      if (isQuickDappCandidatePath || hasWeb3DappContent) {
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
        if (result.timedOut) {
          return { error: `TIMEOUT: No user input within 60 seconds for writing to ${path}. The user did not respond to the approval request. You may decide what to do next — retry, try a different approach, or skip this operation.` }
        }
        return { error: `REJECTED: The user explicitly rejected writing to ${path}. Do NOT retry this operation or use alternative tools/methods to write this file. Inform the user and move on.` }
      }

      const finalContent = result.modifiedContent || content
      const graphGatewayWrite = this.getQuickDappGraphGatewayWriteError(normalizedPath, finalContent)
      if (graphGatewayWrite) return graphGatewayWrite

      await this.writeFileInternal(normalizedPath, finalContent)

      return { success: true }
    } catch (error) {
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

  async ls(path?: string): Promise<string[]> {
    await this.flushAllPendingBatches()
    try {

      const targetPath = path ? this.normalizePath(path) : await this.cwd()

      const exists = await this.plugin.call('fileManager', 'exists', targetPath)
      if (!exists) {
        throw new Error(`Path not found: ${targetPath}`)
      }

      const isDir = await this.plugin.call('fileManager', 'isDirectory', targetPath)
      if (!isDir) {
        throw new Error(`Not a directory: ${targetPath}`)
      }

      const files = await this.plugin.call('fileManager', 'readdir', targetPath)
      return Object.keys(files).map(name => {
        const fullPath = `${targetPath}/${name}`.replace('//', '/')
        return files[name].isDirectory ? `${name}/` : name
      })
    } catch (error) {
      return [`Failed to list directory ${path || 'cwd'}: ${error.message}`]
    }
  }

  async lsInfo(path?: string): Promise<{ name: string, path: string, is_dir: boolean }[]> {
    await this.flushAllPendingBatches()
    try {
      const targetPath = path ? this.normalizePath(path) : await this.cwd()
      const exists = await this.plugin.call('fileManager', 'exists', targetPath)
      if (!exists) {
        throw new Error(`Path not found: ${targetPath}`)
      }

      const isDir = await this.plugin.call('fileManager', 'isDirectory', targetPath)
      if (!isDir) {
        throw new Error(`Not a directory: ${targetPath}`)
      }

      const files = await this.plugin.call('fileManager', 'readdir', targetPath)

      const res = Object.keys(files).map(name => ({
        name,
        path: `${name}`.replace('//', '/'),
        is_dir: files[name].isDirectory
      }))
      return res
    } catch (error) {
      return []
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

  async globInfo(pattern: string, path?: string): Promise<{ name: string, path: string, is_dir: boolean }[]> {
    await this.flushAllPendingBatches()
    try {
      const targetPath = path ? this.normalizePath(path) : await this.cwd()
      const exists = await this.plugin.call('fileManager', 'exists', targetPath)
      if (!exists) {
        return []
      }

      const isDir = await this.plugin.call('fileManager', 'isDirectory', targetPath)
      if (!isDir) {
        // Not a directory — return the file itself if it matches the pattern
        const name = targetPath.split('/').pop() || targetPath
        const regex = new RegExp(pattern.replace(/\*/g, '.*'))
        if (regex.test(name)) {
          return [{ name, path: targetPath, is_dir: false }]
        }
        return []
      }

      const files = await this.plugin.call('fileManager', 'readdir', targetPath)
      const regex = new RegExp(pattern.replace(/\*/g, '.*')) // Simple glob to regex conversion

      return Object.keys(files)
        .filter(name => regex.test(name))
        .map(name => ({
          name,
          path: `${name}`.replace('//', '/'),
          is_dir: files[name].isDirectory
        }))
    } catch (error) {
      return []
    }
  }

  async grepRaw(pattern: string, path?: string): Promise<{ file: string, line: number, text: string }[]> {
    try {
      const targetPath = path ? this.normalizePath(path) : await this.cwd()
      const exists = await this.plugin.call('fileManager', 'exists', targetPath)
      if (!exists) {
        return [{ file: targetPath, line: 0, text: `[Error] Path not found: ${targetPath}` }]
      }

      const isDir = await this.plugin.call('fileManager', 'isDirectory', targetPath)

      // If a file path was given, search just that single file
      if (!isDir) {
        const content = await this.plugin.call('fileManager', 'readFile', targetPath)
        const regex = new RegExp(pattern)
        const results: { file: string, line: number, text: string }[] = []
        const lines = content.split('\n')
        lines.forEach((line: string, index: number) => {
          if (regex.test(line)) {
            results.push({ file: targetPath, line: index + 1, text: line })
          }
        })
        return results
      }

      const files = await this.plugin.call('fileManager', 'readdir', targetPath)
      const regex = new RegExp(pattern)

      const results: { file: string, line: number, text: string }[] = []

      for (const name of Object.keys(files)) {
        if (!files[name].isDirectory) {
          // Remix readdir returns full paths as keys (Ref: Yann PR #7080)
          const content = await this.plugin.call('fileManager', 'readFile', name)
          const lines = content.split('\n')
          lines.forEach((line: string, index: number) => {
            if (regex.test(line)) {
              results.push({ file: name, line: index + 1, text: line })
            }
          })
        }
      }
      return results
    } catch (error) {
      // Return error as result instead of throwing — prevents fatal agent crash
      return [{ file: path || 'unknown', line: 0, text: `[Error] grep failed: ${error.message}` }]
    }
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
