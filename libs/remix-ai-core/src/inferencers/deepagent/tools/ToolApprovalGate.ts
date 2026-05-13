import { Plugin } from '@remixproject/engine'
import EventEmitter from 'events'
import {
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolApprovalPolicy,
  shouldRequireApproval,
  getToolMetadata,
  isSafeTool,
  DIRECT_WRITE_TOOLS
} from '../../../types/humanInTheLoop'

export class ToolApprovalGate {
  private eventEmitter: EventEmitter
  private policy: ToolApprovalPolicy
  private plugin: Plugin
  private pendingApprovals = new Map<string, { resolve: (approved: boolean, modified?: Record<string, any>) => void }>()

  constructor(plugin: Plugin, eventEmitter: EventEmitter, policy: ToolApprovalPolicy = 'ask_risky') {
    this.plugin = plugin
    this.eventEmitter = eventEmitter
    this.policy = policy

    this.eventEmitter.on('onToolApprovalResponse', (response: ToolApprovalResponse) => {

      const pending = this.pendingApprovals.get(response.requestId)
      if (pending) {
        pending.resolve(response.approved, response.modifiedArgs)
        this.pendingApprovals.delete(response.requestId)
      } else {

      }
    })
  }

  /**
   * Set the approval policy
   */
  setPolicy(policy: ToolApprovalPolicy) {
    this.policy = policy
  }

  /**
   * Get the current approval policy
   */
  getPolicy(): ToolApprovalPolicy {
    return this.policy
  }

  /**
   * Wrap a tool function with approval gate
   * @param toolName - Name of the tool
   * @param originalFunc - Original tool execution function
   * @returns Wrapped function with approval gate
   */
  wrap(toolName: string, originalFunc: (args: Record<string, any>) => Promise<string>): (args: Record<string, any>) => Promise<string> {
    if (isSafeTool(toolName)) {

      return originalFunc
    }

    return async (args: Record<string, any>): Promise<string> => {
      if (!shouldRequireApproval(toolName, this.policy)) {

        return originalFunc(args)
      }

      const meta = getToolMetadata(toolName)
      const requestId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const filePath = args.path || args.filePath

      let existingContent: string | undefined
      let proposedContent: string | undefined

      if (meta.category === 'file_write' && filePath) {
        try {
          existingContent = await this.plugin.call('fileManager', 'readFile', filePath)

        } catch {
          // File doesn't exist yet — that's fine for file_create / file_write on new files

        }

        if (toolName === 'file_replace') {
          // file_replace uses regEx + contentToReplace, NOT content.
          // Compute the full resulting file content so the user sees a proper diff.
          if (existingContent && args.regEx && args.contentToReplace !== undefined) {
            try {
              proposedContent = existingContent.replace(new RegExp(args.regEx, 'g'), args.contentToReplace)

            } catch (regexErr) {
              console.warn('[HITL][ApprovalGate] file_replace: regex failed:', regexErr)
              proposedContent = undefined
            }
          }
        } else {
          // file_write, file_create: content is in args.content or args.data
          proposedContent = args.content || args.data

        }
      } else {
        // Non-file tools — just use content/data if present
        proposedContent = args.content || args.data
      }

      const request: ToolApprovalRequest = {
        requestId,
        toolName,
        toolArgs: args,
        category: meta.category,
        risk: meta.risk,
        existingContent,
        proposedContent,
        filePath,
        timestamp: Date.now()
      }

      // Wait for user decision
      const { approved, modifiedArgs } = await new Promise<{ approved: boolean; modifiedArgs?: Record<string, any> }>(
        (resolve) => {
          this.pendingApprovals.set(requestId, {
            resolve: (approved, modified) => resolve({ approved, modifiedArgs: modified })
          })
          this.eventEmitter.emit('onToolApprovalRequired', request)
        }
      )

      if (!approved) {
        return JSON.stringify({ cancelled: true, reason: `REJECTED: The user explicitly rejected this ${toolName} operation. Do NOT retry this operation or use alternative tools/methods. Inform the user and move on.` })
      }

      const finalArgs = modifiedArgs || args

      // === DIRECT WRITE: For file-write MCP tools, write directly via fileManager ===
      // This bypasses the handler's execute() which would call showCustomDiff and
      // create a double-approval situation.
      if (DIRECT_WRITE_TOOLS.has(toolName) && filePath) {

        try {
          if (toolName === 'file_replace') {
            // Re-compute the replacement with (possibly modified) args
            const currentContent = await this.plugin.call('fileManager', 'readFile', filePath)
            const resultContent = currentContent.replace(
              new RegExp(finalArgs.regEx, 'g'),
              finalArgs.contentToReplace
            )
            await this.plugin.call('fileManager', 'writeFile', filePath, resultContent)

            return JSON.stringify({ success: true, path: filePath, message: 'File replaced successfully' })

          } else {
            // file_write or file_create
            const content = finalArgs.content || finalArgs.data || ''
            const exists = await this.plugin.call('fileManager', 'exists', filePath)
            if (!exists) {
              // Ensure parent directory structure is created (writeFile handles this)

            }
            await this.plugin.call('fileManager', 'writeFile', filePath, content)

            return JSON.stringify({ success: true, path: filePath, message: 'File written successfully' })
          }
        } catch (writeErr) {
          console.error('[HITL][ApprovalGate][DirectWrite] Write failed:', writeErr)
          return JSON.stringify({ success: false, error: `Failed to write file: ${writeErr.message}` })
        }
      }

      // === FALLBACK: For non-file tools, call the original handler as before ===
      return originalFunc(finalArgs)
    }
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.eventEmitter.removeAllListeners('onToolApprovalResponse')
    this.pendingApprovals.clear()
  }
}
