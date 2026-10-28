import { remixAILogger } from '../../../helpers/logger'
import { Plugin } from '@remixproject/engine'
import EventEmitter from 'events'
import {
  AIFileChange,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolApprovalPolicy,
  ApprovalScope,
  ScreenCaptureConsentInfo,
  ScreenCapturePolicy,
  SCREEN_CAPTURE_SETTING,
  shouldRequireApproval,
  getToolMetadata,
  isSafeTool,
  isConsentTool,
  DIRECT_WRITE_TOOLS
} from '../../../types/humanInTheLoop'
import { screenshotConsent } from '../screenshotConsent'

// MCP tools whose effect on files is reported as 'onAIFileChanged' (for the AI mode changes panel)
const FILE_CHANGE_TOOLS = new Set(['file_create', 'file_write', 'file_replace', 'file_delete', 'file_move', 'file_copy'])

export class ToolApprovalGate {
  private eventEmitter: EventEmitter
  private policy: ToolApprovalPolicy
  private plugin: Plugin
  private pendingApprovals = new Map<string, { resolve: (approved: boolean, modified?: Record<string, any>, scope?: ApprovalScope) => void }>()

  constructor(plugin: Plugin, eventEmitter: EventEmitter, policy: ToolApprovalPolicy = 'ask_risky') {
    this.plugin = plugin
    this.eventEmitter = eventEmitter
    this.policy = policy

    this.eventEmitter.on('onToolApprovalResponse', (response: ToolApprovalResponse) => {

      const pending = this.pendingApprovals.get(response.requestId)
      remixAILogger.log('[ToolApprovalGate] onToolApprovalResponse', response.requestId, 'approved=', response.approved, 'pendingFound=', !!pending, 'pendingKeys=', Array.from(this.pendingApprovals.keys()))
      if (pending) {
        pending.resolve(response.approved, response.modifiedArgs, response.scope)
        this.pendingApprovals.delete(response.requestId)
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
    const gated = this.gate(toolName, originalFunc)
    if (!FILE_CHANGE_TOOLS.has(toolName)) return gated

    // Compare the files before and after the tool ran, whether it needed approval or not
    return async (args: Record<string, any>): Promise<string> => {
      const paths = this.fileChangePaths(toolName, args)
      const before = await Promise.all(paths.map((path) => this.readFileSnapshot(path)))
      const result = await gated(args)
      await this.reportFileChange(toolName, paths, before)
      return result
    }
  }

  private fileChangePaths(toolName: string, args: Record<string, any>): string[] {
    if (toolName === 'file_move' || toolName === 'file_copy') return [args.from, args.to]
    return [args.path || args.filePath]
  }

  /** File content, or null when there is no such file (directories included) */
  private async readFileSnapshot(path: string): Promise<string | null> {
    if (!path) return null
    try {
      if (!await this.plugin.call('fileManager', 'exists', path)) return null
      if (await this.plugin.call('fileManager', 'isDirectory', path)) return null
      return await this.plugin.call('fileManager', 'readFile', path)
    } catch {
      return null
    }
  }

  private async reportFileChange(toolName: string, paths: string[], before: (string | null)[]): Promise<void> {
    try {
      const after = await Promise.all(paths.map((path) => this.readFileSnapshot(path)))
      const timestamp = Date.now()
      let change: AIFileChange | null = null
      if (toolName === 'file_move') {
        const [fromBefore] = before
        const [fromAfter, toAfter] = after
        if (fromBefore !== null && fromAfter === null && toAfter !== null) {
          change = { path: paths[1], movedFrom: paths[0], existed: true, oldContent: fromBefore, newContent: toAfter, timestamp }
        }
      } else {
        const index = toolName === 'file_copy' ? 1 : 0
        const [path, oldContent, newContent] = [paths[index], before[index], after[index]]
        if (oldContent === newContent) return // rejected, failed or no-op
        change = newContent === null
          ? { path, existed: true, deleted: true, oldContent, newContent: '', timestamp }
          : { path, existed: oldContent !== null, oldContent: oldContent || '', newContent, timestamp }
      }
      if (change) this.eventEmitter.emit('onAIFileChanged', change)
    } catch (e) {
      remixAILogger.warn('[ToolApprovalGate] could not report file change', toolName, e)
    }
  }

  private gate(toolName: string, originalFunc: (args: Record<string, any>) => Promise<string>): (args: Record<string, any>) => Promise<string> {
    if (isSafeTool(toolName)) {

      return originalFunc
    }

    return async (args: Record<string, any>): Promise<string> => {
      if (isConsentTool(toolName)) {
        return this.runConsentTool(toolName, args, originalFunc)
      }

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
              remixAILogger.warn('[HITL][ApprovalGate] file_replace: regex failed:', regexErr)
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
          remixAILogger.log('[ToolApprovalGate] awaiting approval', toolName, requestId, 'listeners(onToolApprovalResponse)=', this.eventEmitter.listenerCount('onToolApprovalResponse'))
          this.eventEmitter.emit('onToolApprovalRequired', request)
        }
      )
      remixAILogger.log('[ToolApprovalGate] approval resolved', toolName, requestId, 'approved=', approved)

      if (!approved) {
        if (FILE_CHANGE_TOOLS.has(toolName)) {
          const rejected: AIFileChange = {
            path: filePath || args.to,
            existed: existingContent !== undefined || toolName === 'file_delete' || toolName === 'file_move',
            oldContent: existingContent || '',
            newContent: proposedContent || '',
            timestamp: Date.now(),
            status: 'rejected',
            ...(toolName === 'file_delete' ? { deleted: true } : {}),
            ...(toolName === 'file_move' ? { movedFrom: args.from } : {})
          }
          if (rejected.path) this.eventEmitter.emit('onAIFileChanged', rejected)
        }
        return JSON.stringify({ cancelled: true, reason: `REJECTED: The user explicitly rejected this ${toolName} operation. Do NOT retry this operation or use alternative tools/methods. Inform the user and move on.` })
      }

      const finalArgs = modifiedArgs || args

      // === DIRECT WRITE: For file-write MCP tools, write directly via fileManager ===
      // This bypasses the handler's execute() which would call showCustomDiff and
      // create a double-approval situation.
      if (DIRECT_WRITE_TOOLS.has(toolName) && filePath) {
        // Detect workspace name in path (folder duplication bug)
        try {
          const currentWs = await this.plugin.call('filePanel' as any, 'getCurrentWorkspace')
          if (currentWs?.name && filePath.startsWith(currentWs.name + '/')) {
            remixAILogger.warn(`[QuickDapp] MCP ${toolName}: workspace name in path detected: "${filePath}" (ws: "${currentWs.name}")`)
          }
        } catch (_) {}

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
          remixAILogger.error('[HITL][ApprovalGate][DirectWrite] Write failed:', writeErr)
          return JSON.stringify({ success: false, error: `Failed to write file: ${writeErr.message}` })
        }
      }

      // === FALLBACK: For non-file tools, call the original handler as before ===
      return originalFunc(finalArgs)
    }
  }

  /**
   * Runs a tool whose gate is consent rather than risk — today, the screen
   * capture. The flow is deliberately separate from the risk path above: the
   * question is not "is this dangerous?" but "may we send a picture of your
   * screen to a third party?", and the answer is remembered at a scope the
   * user picks.
   */
  private async runConsentTool(
    toolName: string,
    args: Record<string, any>,
    originalFunc: (args: Record<string, any>) => Promise<string>
  ): Promise<string> {
    // Nothing can answer a prompt in a headless context, so don't open one.
    // The handler's own DOM guard produces the real error message.
    if (typeof document === 'undefined') {
      screenshotConsent.setAllowed(true)
      return originalFunc(args)
    }

    const persisted = await this.readScreenCapturePolicy()
    const decision = screenshotConsent.decide(persisted)

    if (decision === 'deny') {
      screenshotConsent.setAllowed(false)
      return this.screenCaptureRefusal(persisted === 'never')
    }

    if (decision === 'allow') {
      screenshotConsent.setAllowed(true)
      return originalFunc(args)
    }

    const requestId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const request: ToolApprovalRequest = {
      requestId,
      toolName,
      toolArgs: args,
      category: 'screen_capture',
      risk: getToolMetadata(toolName).risk,
      timestamp: Date.now(),
      consent: this.describeCapture(args)
    }

    const { approved, scope } = await new Promise<{ approved: boolean; scope?: ApprovalScope }>((resolve) => {
      this.pendingApprovals.set(requestId, {
        resolve: (ok, _modified, chosenScope) => resolve({ approved: ok, scope: chosenScope })
      })
      remixAILogger.log('[ToolApprovalGate] awaiting screen-capture consent', requestId)
      this.eventEmitter.emit('onToolApprovalRequired', request)
    })

    // A cancelled run resolves with no scope. Recording that would turn
    // "the user pressed stop" into "the user said no", so only a real
    // decision is remembered.
    if (scope) screenshotConsent.record(scope)

    if (!approved) {
      screenshotConsent.setAllowed(false)
      return this.screenCaptureRefusal(false)
    }

    screenshotConsent.setAllowed(true)
    try {
      return await originalFunc(args)
    } finally {
      // "Allow once" covers exactly the capture it was granted for.
      screenshotConsent.consume()
    }
  }

  /** Reads the persisted screen-capture policy, defaulting to asking. */
  private async readScreenCapturePolicy(): Promise<ScreenCapturePolicy> {
    try {
      const value = await this.plugin.call('settings' as any, 'get' as any, `settings/${SCREEN_CAPTURE_SETTING}`)
      if (value === 'always' || value === 'never') return value
    } catch (e) {
      remixAILogger.warn('[ToolApprovalGate] could not read screen-capture policy, defaulting to ask', e)
    }
    return 'ask'
  }

  /**
   * Describes the capture in the user's terms. The model's `reason` argument
   * has always been documented as "shown to the user" — this is where that
   * finally becomes true.
   */
  private describeCapture(args: Record<string, any>): ScreenCaptureConsentInfo {
    const scoped = args?.ref || args?.selector
    return {
      reason: typeof args?.reason === 'string' ? args.reason : undefined,
      targetLabel: scoped ? String(scoped) : 'the whole Remix IDE window',
      wholeIde: !scoped
    }
  }

  /**
   * Tells the model it may not look, and points it at the cheap alternative
   * so it reports back instead of stalling or retrying.
   */
  private screenCaptureRefusal(disabledInSettings: boolean): string {
    const reason = disabledInSettings
      ? 'REJECTED: Screen capture is turned off in the user\'s settings.'
      : 'REJECTED: The user declined to share a picture of their screen.'
    return JSON.stringify({
      cancelled: true,
      reason: `${reason} Do NOT call capture_ui_screenshot again for this request. Use inspect_ui or get_ui_state to read the interface structure and labels instead, and tell the user what you can and cannot see.`
    })
  }

  /**
   * Settle every approval still waiting on the user as "rejected".
   */
  cancelPendingApprovals(): void {
    if (this.pendingApprovals.size === 0) return
    remixAILogger.log('[ToolApprovalGate] cancelling pending approvals:', Array.from(this.pendingApprovals.keys()))
    const pending = Array.from(this.pendingApprovals.values())
    this.pendingApprovals.clear()
    for (const entry of pending) {
      try {
        entry.resolve(false)
      } catch (e) {
        remixAILogger.warn('[ToolApprovalGate] failed to settle pending approval', e)
      }
    }
  }

  /**
   * Clean up resources
   */
  dispose() {
    // Settle before dropping the listener — otherwise the waiters can never
    // be resolved by anyone.
    this.cancelPendingApprovals()
    this.eventEmitter.removeAllListeners('onToolApprovalResponse')
  }
}
