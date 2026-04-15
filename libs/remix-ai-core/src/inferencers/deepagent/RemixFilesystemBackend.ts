/**
 * Remix Filesystem Backend for DeepAgent
 * Implements BackendProtocol to bridge DeepAgent with Remix FileManager
 */

import { Plugin } from '@remixproject/engine'
import EventEmitter from 'events'
import { ToolApprovalRequest, ToolApprovalResponse } from '../../types/humanInTheLoop'

// File size limit for auto-summarization (100KB)
const MAX_FILE_SIZE = 100 * 1024

interface EditInstruction {
  oldText: string
  newText: string
}

/**
 * RemixFilesystemBackend implements the BackendProtocol interface
 * to allow DeepAgent to interact with Remix's filesystem
 */
export class RemixFilesystemBackend {
  private plugin: Plugin
  private workspaceRoot: string = '/'
  private eventEmitter: EventEmitter | null = null
  private pendingApprovals = new Map<string, (result: { approved: boolean; modifiedContent?: string }) => void>()

  constructor(plugin: Plugin, eventEmitter?: EventEmitter) {
    this.plugin = plugin
    console.log('[HITL][Backend] Constructor called, eventEmitter:', !!eventEmitter)
    if (eventEmitter) {
      this.eventEmitter = eventEmitter
      this.eventEmitter.on('onToolApprovalResponse', (response: ToolApprovalResponse) => {
        console.log('[HITL][Backend][Step 7] Received approval response:', response.requestId, 'approved:', response.approved, 'hasModifiedArgs:', !!response.modifiedArgs)
        const resolve = this.pendingApprovals.get(response.requestId)
        if (resolve) {
          console.log('[HITL][Backend][Step 8] Resolving pending promise for:', response.requestId)
          resolve({
            approved: response.approved,
            modifiedContent: response.modifiedArgs?.content
          })
          this.pendingApprovals.delete(response.requestId)
        } else {
          console.warn('[HITL][Backend] WARNING: No pending approval found for requestId:', response.requestId, 'pendingKeys:', [...this.pendingApprovals.keys()])
        }
      })
    }
  }

  // deepagents library calls edit(path, old_string, new_string, replace_all)
  async edit(
    filePath: string, oldString: string, newString: string, replaceAll = false
  ): Promise<{ error?: string; occurrences?: number; metadata?: any; filesUpdate?: any }> {

    console.log('[HITL][Backend] edit() called:', filePath, 'replaceAll:', replaceAll)
    try {
      const content = await this.read_file(filePath)
      if (typeof content !== 'string') {
        console.log('[HITL][Backend] edit() read_file returned error:', content)
        return { error: `Failed to read file: ${(content as any).error || 'unknown error'}` }
      }
      if (!content.includes(oldString)) {
        console.log('[HITL][Backend] edit() oldString not found in file')
        return { error: `Text not found in file: "${oldString.substring(0, 50)}..."` }
      }
      const updated = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString)
      const occurrences = replaceAll
        ? (content.split(oldString).length - 1)
        : 1
      console.log('[HITL][Backend] edit() applied', occurrences, 'replacement(s), requesting approval as edit_file')

      const result = await this.requestWriteApproval(filePath, content, updated, 'edit_file')
      if (!result.approved) {

        return { error: `REJECTED: The user explicitly rejected editing ${filePath}. Do NOT retry or use alternative methods to edit this file. Ask the user what they want instead.` }
      }
      const finalContent = result.modifiedContent || updated
      console.log('[HITL][Backend] edit() approved, hasModifiedContent:', !!result.modifiedContent, '→ writeFileInternal')
      await this.writeFileInternal(filePath, finalContent)
      return { occurrences }
    } catch (err) {
      console.error('[HITL][Backend] edit() error:', err)
      return { error: err.message }
    }
  }

  /**
   * Get current working directory
   */
  async cwd(): Promise<string> {
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

  /**
   * Read file contents
   * Auto-summarizes files larger than 100KB
   */
  async read_file(path: string): Promise<string | { error: string }> {
    try {
      console.log('[HITL][Backend] read_file:', path)
      const normalizedPath = path
      const exists = await this.plugin.call('fileManager', 'exists', normalizedPath)

      if (!exists) {
        console.log('[HITL][Backend] read_file: file not found:', path)
        throw new Error(`File not found: ${path}`)
      }

      const content = await this.plugin.call('fileManager', 'readFile', normalizedPath)
      console.log('[HITL][Backend] read_file: OK, length:', content.length)

      if (content.length > MAX_FILE_SIZE) {
        return this.summarizeFile(normalizedPath, content)
      }

      return content
    } catch (error) {
      console.error('[HITL][Backend] read_file error:', path, error.message)
      return `Failed to read file ${path}: ${error.message}`
    }
  }

  async read(file_path: string, offset?: number, limit?: number): Promise<string | { error: string }> {
    try {
      const content = await this.read_file(file_path)
      if (typeof content !== 'string') {
        return content
      }
      // Default to full content if offset/limit not specified (Ref: Yann PR #7080)
      if (offset === undefined) offset = 0
      if (limit === undefined) limit = content.length
      return content.substring(offset, offset + limit)
    } catch (error) {
      return { error: `Failed to read file ${file_path} with offset and limit: ${error.message}` }
    }
  }

  /**
   * Write file contents — goes through HITL approval before writing.
   * Called by deepagents built-in write_file tool and our write() alias.
   */
  async write_file(path: string, content: string): Promise<{ success?: boolean, error?: string }> {
    console.log('[HITL][Backend][Step 1] write_file called:', path, 'contentLength:', content.length)

    try {
      const normalizedPath = path
      const exists = await this.plugin.call('fileManager', 'exists', normalizedPath)
      console.log('[HITL][Backend][Step 1] file exists:', exists)

      let oldContent = ''
      if (exists) {
        oldContent = await this.plugin.call('fileManager', 'readFile', normalizedPath)
        console.log('[HITL][Backend][Step 1] old content length:', oldContent.length)
      }

      console.log('[HITL][Backend][Step 2] Requesting approval as write_file...')
      const result = await this.requestWriteApproval(normalizedPath, oldContent, content, 'write_file')
      console.log('[HITL][Backend][Step 9] Approval result:', result.approved, 'hasModifiedContent:', !!result.modifiedContent)

      if (!result.approved) {
        return { error: `REJECTED: The user rejected writing to ${path}.` }
      }

      const finalContent = result.modifiedContent || content
      console.log('[HITL][Backend][Step 10] Writing file via writeFileInternal:', path, 'finalLength:', finalContent.length)
      await this.writeFileInternal(normalizedPath, finalContent)
      console.log('[HITL][Backend][Step 11] File written successfully:', path)
      return { success: true }
    } catch (error) {
      console.error('[HITL][Backend] write_file ERROR:', path, error)
      return { error: `Failed to write file ${path}: ${error.message}` }
    }
  }

  async write(file_path: string, content: string): Promise<any> {
    console.log('[HITL][Backend] write() alias called → delegating to write_file:', file_path)
    return await this.write_file(file_path, content)
  }

  /**
   * Internal write — bypasses approval (used after approval has already been granted).
   */
  private async writeFileInternal(path: string, content: string): Promise<void> {
    console.log('[HITL][Backend] writeFileInternal (no approval):', path)
    await this.plugin.call('fileManager', 'writeFile', path, content)
  }

  /**
   * Edit file with search/replace operations.
   * Goes through HITL approval showing the full before/after diff.
   */
  async edit_file(path: string, edits: EditInstruction[]): Promise<{ success?: boolean, error?: string }> {
    console.log('[HITL][Backend] edit_file() called:', path, 'edits:', edits.length)

    try {
      const normalizedPath = this.normalizePath(path)
      const originalContent = await this.read_file(normalizedPath)

      if (typeof originalContent !== 'string') {
        console.log('[HITL][Backend] edit_file(): read failed:', originalContent)
        return { error: `Failed to read file: ${(originalContent as any).error}` }
      }

      let content = originalContent
      for (const edit of edits) {
        const { oldText, newText } = edit
        if (!content.includes(oldText)) {
          console.log('[HITL][Backend] edit_file(): oldText not found:', oldText.substring(0, 50))
          return { error: `Text not found in file: "${oldText.substring(0, 50)}..."` }
        }
        content = content.replace(oldText, newText)
      }

      console.log('[HITL][Backend] edit_file(): all edits applied, requesting approval as edit_file')
      const result = await this.requestWriteApproval(normalizedPath, originalContent, content, 'edit_file')
      if (!result.approved) {
        return { error: `REJECTED: The user rejected editing ${path}.` }
      }

      const finalContent = result.modifiedContent || content
      console.log('[HITL][Backend] edit_file(): approved, writing...')
      await this.writeFileInternal(normalizedPath, finalContent)
      console.log('[HITL][Backend] edit_file(): done')
      return { success: true }
    } catch (error) {
      console.error('[HITL][Backend] edit_file() ERROR:', error)
      return { error: `Failed to edit file ${path}: ${error.message}` }
    }
  }

  /**
   * List directory contents
   */
  async ls(path?: string): Promise<string[]> {
    try {
      console.log('[HITL][Backend] ls:', path || 'cwd')
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
        path: `${targetPath}/${name}`.replace('//', '/'),
        is_dir: files[name].isDirectory
      }))
      return res
    } catch (error) {
      return []
    }
  }

  /**
   * Create a new directory
   */
  async mkdir(path: string): Promise<void> {
    try {
      const normalizedPath = this.normalizePath(path)
      await this.plugin.call('fileManager', 'mkdir', normalizedPath)
    } catch (error) {
    }
  }

  async globInfo(pattern: string, path?: string): Promise<{ name: string, path: string, is_dir: boolean }[]> {
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

  /**
   * Normalize file path to Remix workspace format
   */
  private normalizePath(path: string): string {
    // Remove leading ./ or ../
    let normalized = path.replace(/^\.\//, '').replace(/^\.\.\//, '')

    // Ensure path starts with /browser or is absolute
    if (!normalized.startsWith('/')) {
      normalized = `${this.workspaceRoot}/${normalized}`
    }

    // Remove double slashes
    normalized = normalized.replace(/\/\//g, '/')

    return normalized
  }

  /**
   * Summarize large files to prevent context overflow
   */
  private summarizeFile(path: string, content: string): string {
    const ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase()

    // Special handling for Solidity files
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

  /**
   * Smart summarization for Solidity files
   * Extracts contracts, functions, events, and key structures
   */
  private summarizeSolidityFile(content: string): string {
    const lines = content.split('\n')
    const summary: string[] = [
      '[Solidity file summary - large file auto-summarized]',
      ''
    ]

    // Extract pragma and imports
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

  /**
   * Request user approval before writing a file.
   * If no eventEmitter is connected, auto-approves (backwards-compatible).
   * @param toolName — displayed in the modal so user knows if this is a write or edit
   */
  private async requestWriteApproval(
    path: string,
    oldContent: string,
    newContent: string,
    toolName: string = 'write_file'
  ): Promise<{ approved: boolean; modifiedContent?: string }> {
    if (!this.eventEmitter) {
      console.log('[HITL][Backend] No eventEmitter — auto-approving')
      return { approved: true }
    }

    const requestId = `fs_approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    console.log('[HITL][Backend][Step 3] requestWriteApproval:', requestId, 'toolName:', toolName, 'path:', path, 'oldLen:', oldContent.length, 'newLen:', newContent.length)

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

    console.log('[HITL][Backend][Step 4] Emitting onToolApprovalRequired, waiting for response...')
    return new Promise<{ approved: boolean; modifiedContent?: string }>((resolve) => {
      this.pendingApprovals.set(requestId, resolve)
      this.eventEmitter.emit('onToolApprovalRequired', request)
    })
  }
}
