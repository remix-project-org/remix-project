import { Plugin } from '@remixproject/engine'
import EventEmitter from 'events'
import { ToolApprovalRequest, ToolApprovalResponse } from '../../types/humanInTheLoop'

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
      console.error('[HITL][Backend] edit() error:', err)
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

    // Request ONE approval for the combined diff
    const result = await this.requestWriteApproval(filePath, batch.originalContent, batch.virtualContent, 'edit_file')

    if (!result.approved) {

      // Revert: the file still has original content (we never wrote during batching)
      return
    }

    const finalContent = result.modifiedContent || batch.virtualContent

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
      const batch = this.editBatches.get(path)
      if (batch) {
        return batch.virtualContent
      }

      const normalizedPath = path
      const exists = await this.plugin.call('fileManager', 'exists', normalizedPath)

      if (!exists) {

        throw new Error(`File not found: ${path}`)
      }

      const content = await this.plugin.call('fileManager', 'readFile', normalizedPath)

      if (content.length > MAX_FILE_SIZE) {
        return this.summarizeFile(normalizedPath, content)
      }

      return content
    } catch (error) {
      return `Failed to read file ${path}: ${error.message}`
    }
  }

  async read(file_path: string, offset?: number, limit?: number): Promise<string | { error: string }> {
    try {
      const content = await this.read_file(file_path)
      if (typeof content !== 'string') {
        return content
      }
      if (offset === undefined) offset = 0
      if (limit === undefined) limit = content.length
      return content.substring(offset, offset + limit)
    } catch (error) {
      return { error: `Failed to read file ${file_path} with offset and limit: ${error.message}` }
    }
  }

  async write_file(path: string, content: string): Promise<{ success?: boolean, error?: string }> {
    await this.flushAllPendingBatches()

    try {
      const normalizedPath = path
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

      await this.writeFileInternal(normalizedPath, finalContent)

      return { success: true }
    } catch (error) {
      console.error('[HITL][Backend] write_file ERROR:', path, error)
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

      await this.writeFileInternal(normalizedPath, finalContent)

      return { success: true }
    } catch (error) {
      console.error('[HITL][Backend] edit_file() ERROR:', error)
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
        throw new Error(`Path not found: ${targetPath}`)
      }

      const isDir = await this.plugin.call('fileManager', 'isDirectory', targetPath)
      if (!isDir) {
        throw new Error(`Not a directory: ${targetPath}`)
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
      throw new Error(`Failed to glob directory ${path || 'cwd'} with pattern "${pattern}": ${error.message}`)
    }
  }

  async grepRaw(pattern: string, path?: string): Promise<{ file: string, line: number, text: string }[]> {
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
      const regex = new RegExp(pattern)

      const results: { file: string, line: number, text: string }[] = []

      for (const name of Object.keys(files)) {
        if (!files[name].isDirectory) {
          // Remix readdir returns full paths as keys (Ref: Yann PR #7080)
          const content = await this.plugin.call('fileManager', 'readFile', name)
          const lines = content.split('\n')
          lines.forEach((line, index) => {
            if (regex.test(line)) {
              results.push({ file: name, line: index + 1, text: line })
            }
          })
        }
      }
      return results
    } catch (error) {
      throw new Error(`Failed to grep directory ${path || 'cwd'} with pattern "${pattern}": ${error.message}`)
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
