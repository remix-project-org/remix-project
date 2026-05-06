/**
 * Remix Tool Adapter for DeepAgent
 * Converts Remix MCP tools to LangChain tool format
 */

import { Plugin } from '@remixproject/engine'
import { IMCPToolResult, IMCPTool, IMCPToolCall } from '../../types/mcp'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { RemixToolDefinition, ToolRegistry } from '../../remix-mcp-server/types/mcpTools'
import EventEmitter from 'events'
import {
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolApprovalPolicy,
  shouldRequireApproval,
  getToolMetadata,
  isSafeTool,
  DIRECT_WRITE_TOOLS
} from '../../types/humanInTheLoop'

/**
 * Convert JSON Schema to Zod schema for LangChain
 */
function jsonSchemaToZod(schema: any): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {}

  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
      let zodType: z.ZodTypeAny

      // Handle union types like type: ['number', 'string']
      const propType = Array.isArray(prop.type) ? prop.type : [prop.type]

      if (propType.length > 1) {
        // Union type — use z.union
        zodType = z.union([z.string(), z.number()] as any)
        if (prop.description) zodType = zodType.describe(prop.description)
      } else {
        switch (propType[0]) {
        case 'string':
          zodType = z.string()
          if (prop.description) zodType = zodType.describe(prop.description)
          if (prop.enum) zodType = z.enum(prop.enum)
          break
        case 'number':
          zodType = z.number()
          if (prop.description) zodType = zodType.describe(prop.description)
          break
        case 'boolean':
          zodType = z.boolean()
          if (prop.description) zodType = zodType.describe(prop.description)
          break
        case 'array':
          zodType = z.array(z.any())
          if (prop.description) zodType = zodType.describe(prop.description)
          break
        case 'object':
          zodType = z.record(z.string(), z.any())
          if (prop.description) zodType = zodType.describe(prop.description)
          break
        default:
          zodType = z.any()
        }
      }

      // Make optional if not required
      if (!schema.required?.includes(key)) {
        zodType = zodType.optional()
      }

      shape[key] = zodType
    }
  }

  return z.object(shape)
}

/**
 * Convert IMCPToolResult to string for LangChain
 */
function mcpResultToString(result: IMCPToolResult): string {
  if (result.isError) {
    const errorText = result.content.find(c => c.type === 'text')?.text || 'Unknown error'
    return `Error: ${errorText}`
  }

  return result.content
    .map(c => {
      if (c.type === 'text') return c.text
      if (c.type === 'image') return `[Image: ${c.mimeType}]`
      if (c.type === 'resource') return `[Resource: ${c.mimeType}]`
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * Wraps tool execution with user approval when the tool is risky.
 * Emits 'onToolApprovalRequired' and waits for 'onToolApprovalResponse'.
 */
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

  setPolicy(policy: ToolApprovalPolicy) {
    this.policy = policy
  }

  /**
   * Wrap a tool's func so risky calls require user approval first.
   * For file-write MCP tools, after approval, writes directly to avoid
   * the handler's internal showCustomDiff (which would cause double-approval).
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

      const isFileCategory = meta.category === 'file_write' || meta.category === 'file_delete'
      const filePath = isFileCategory ? (args.path || args.filePath) : undefined

      // === Compute existingContent and proposedContent for the approval modal ===
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
      } else if (toolName === 'update_dapp') {
        // For DApp updates, show a human-readable summary
        const desc = typeof args.description === 'string' ? args.description : JSON.stringify(args.description)
        proposedContent = `Update DApp: ${args.workspaceName || 'unknown'}\n\nModification request:\n${desc}`
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

      // For DApp updates, open the target DApp for user review
      if (toolName === 'update_dapp' && args.workspaceName) {
        try {
          console.log('[QuickDapp] Opening DApp for confirmation:', args.workspaceName)

          // Activate plugin and open DApp detail page
          await this.plugin.call('filePanel' as any, 'switchToWorkspace', {
            name: args.workspaceName,
            isLocalhost: false,
          })
          await this.plugin.call('manager' as any, 'activatePlugin', 'quick-dapp-v2')
          await this.plugin.call('quick-dapp-v2' as any, 'openDapp', args.workspaceName)
          await new Promise(r => setTimeout(r, 500))
          await this.plugin.call('tabs' as any, 'focus', 'quick-dapp-v2')

          console.log('[QuickDapp] DApp detail page opened for:', args.workspaceName)
        } catch (e: any) {
          console.warn('[QuickDapp] Failed to open DApp for confirmation (non-critical):', e?.message)
        }
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

  dispose() {
    this.eventEmitter.removeAllListeners('onToolApprovalResponse')
    this.pendingApprovals.clear()
  }
}

/**
 * RemixToolAdapter converts Remix MCP tools to LangChain format
 */
export class RemixToolAdapter {
  private plugin: Plugin
  private toolRegistry: ToolRegistry
  private approvalGate?: ToolApprovalGate
  /** Tracks whether list_dapps was called in this session. update_dapp is blocked until this is true. */
  private listDappsCalled = false

  constructor(plugin: Plugin, toolRegistry: ToolRegistry, approvalGate?: ToolApprovalGate) {
    this.plugin = plugin
    this.toolRegistry = toolRegistry
    this.approvalGate = approvalGate
  }

  /**
   * Get all Remix tools as LangChain tools
   */
  getAllTools(): DynamicStructuredTool[] {
    const tools: DynamicStructuredTool[] = []
    const allToolDefs = this.toolRegistry.list()

    for (const toolDef of allToolDefs) {
      tools.push(this.convertToLangChainTool(toolDef))
    }

    return tools
  }

  /**
   * Get specific tools by name
   */
  getTools(toolNames: string[]): DynamicStructuredTool[] {
    return toolNames
      .map(name => {
        const toolDef = this.toolRegistry.get(name)
        return toolDef ? this.convertToLangChainTool(toolDef) : null
      })
      .filter((tool): tool is DynamicStructuredTool => tool !== null)
  }

  /**
   * Get Solidity-specific tools
   */
  getSolidityTools(): DynamicStructuredTool[] {
    const solidityToolNames = [
      'solidity_compile',
      'get_compiler_config',
      'set_compiler_config',
      'analyze_contract',
      'deploy_contract',
      'debug_transaction'
    ]

    return this.getTools(solidityToolNames)
  }

  /**
   * Convert external MCP client tools to LangChain format
   * @param mcpTools Array of MCP tools from external MCP clients (with _mcpServer property)
   * @param mcpInferencer MCPInferencer instance to execute tools
   */
  convertExternalMCPTools(
    mcpTools: Array<IMCPTool & { _mcpServer?: string; _mcpCategory?: string }>,
    mcpInferencer: any
  ): DynamicStructuredTool[] {
    const tools: DynamicStructuredTool[] = []

    for (const tool of mcpTools) {
      try {
        const serverName = tool._mcpServer || 'Unknown'

        // Convert inputSchema to Zod schema
        const zodSchema = jsonSchemaToZod(tool.inputSchema)

        let func = async (input: Record<string, any>): Promise<string> => {
          try {
            const toolCall: IMCPToolCall = {
              name: tool.name,
              arguments: input
            }

            const result: IMCPToolResult = await mcpInferencer.executeTool(serverName, toolCall)
            return mcpResultToString(result)
          } catch (error) {
            return `Tool execution error: ${error.message}`
          }
        }

        // Wrap risky MCP tools with approval gate (file_write, file_create, etc.)
        if (this.approvalGate) {

          func = this.approvalGate.wrap(tool.name, func)
        }

        const langChainTool = new DynamicStructuredTool({
          name: tool.name,
          description: `[${serverName}] ${tool.description}`,
          schema: zodSchema,
          func
        })

        tools.push(langChainTool)
      } catch (error) {
        console.warn(`[RemixToolAdapter] Failed to convert tool ${tool.name}:`, error)
      }
    }

    return tools
  }

  /**
   * Convert a Remix MCP tool definition to LangChain tool
   */
  private convertToLangChainTool(toolDef: RemixToolDefinition): DynamicStructuredTool {
    const zodSchema = jsonSchemaToZod(toolDef.inputSchema)

    let func = async (input: Record<string, any>): Promise<string> => {
      try {
        if (toolDef.name === 'list_dapps') {
          this.listDappsCalled = true
        }
        const result = await toolDef.handler.execute(input, this.plugin)
        return mcpResultToString(result)
      } catch (error) {
        return `Tool execution error: ${error.message}`
      }
    }

    if (this.approvalGate) {
      func = this.approvalGate.wrap(toolDef.name, func)
    }

    // Guard runs BEFORE approval gate — blocks without showing modal
    if (toolDef.name === 'update_dapp') {
      const innerFunc = func
      func = async (input: Record<string, any>): Promise<string> => {
        if (!this.listDappsCalled) {
          console.warn('[RemixToolAdapter] BLOCKED update_dapp — list_dapps not called yet')
          return 'ERROR: You MUST call list_dapps first and present the numbered workspace list to the user. The user must explicitly choose which DApp to update. Call list_dapps now and show the results as a numbered list.'
        }
        return innerFunc(input)
      }
    }

    return new DynamicStructuredTool({
      name: toolDef.name,
      description: toolDef.description,
      schema: zodSchema,
      func
    })
  }

  /**
   * Create additional Solidity-specific helper tools
   */
  static createSolidityHelperTools(plugin: Plugin): DynamicStructuredTool[] {
    return [
      // Get current file
      new DynamicStructuredTool({
        name: 'get_current_file',
        description: 'Get the currently open file in the editor',
        schema: z.object({}),
        func: async () => {
          try {
            const currentFile = await plugin.call('fileManager', 'getCurrentFile')
            return currentFile || 'No file currently open'
          } catch (error) {
            return `Error: ${error.message}`
          }
        }
      }),

      // Get opened files
      new DynamicStructuredTool({
        name: 'get_opened_files',
        description: 'Get list of all opened files in tabs',
        schema: z.object({}),
        func: async () => {
          try {
            const files = await plugin.call('fileManager', 'getOpenedFiles')
            return files.length > 0 ? files.join('\n') : 'No files currently open'
          } catch (error) {
            return `Error: ${error.message}`
          }
        }
      }),

      // Open file in editor
      new DynamicStructuredTool({
        name: 'open_file',
        description: 'Open a file in the editor',
        schema: z.object({
          path: z.string().describe('Path to the file to open')
        }),
        func: async (input: { path: string }) => {
          try {
            await plugin.call('fileManager', 'open', input.path)
            return `Opened file: ${input.path}`
          } catch (error) {
            return `Error opening file: ${error.message}`
          }
        }
      }),

      // Get contract ABI
      new DynamicStructuredTool({
        name: 'get_contract_abi',
        description: 'Get the ABI for a compiled contract',
        schema: z.object({
          contractName: z.string().describe('Name of the contract')
        }),
        func: async (input: { contractName: string }) => {
          try {
            const compilationResult = await plugin.call('solidity' as any, 'getCompilationResult')
            if (!compilationResult) {
              return 'No compilation result available. Please compile the contract first.'
            }

            const contracts = compilationResult.data?.contracts || {}
            for (const [fileName, fileContracts] of Object.entries(contracts)) {
              if (fileContracts[input.contractName]) {
                const abi = fileContracts[input.contractName].abi
                return JSON.stringify(abi, null, 2)
              }
            }

            return `Contract ${input.contractName} not found in compilation results`
          } catch (error) {
            return `Error: ${error.message}`
          }
        }
      })
    ]
  }
}

/**
 * Factory function to create Remix tools for DeepAgent
 * @param plugin Plugin instance
 * @param toolRegistry Internal Remix MCP tool registry
 * @param mcpInferencer Optional MCPInferencer to gather external MCP client tools
 */
export async function createRemixTools(
  plugin: Plugin,
  toolRegistry: ToolRegistry,
  mcpInferencer?: any,
  approvalGate?: ToolApprovalGate
): Promise<DynamicStructuredTool[]> {
  const adapter = new RemixToolAdapter(plugin, toolRegistry, approvalGate)

  // Get ALL internal Remix MCP tools (generate_dapp, update_dapp, compile, deploy, etc.)
  const internalTools = adapter.getAllTools()
  console.log(`[RemixToolAdapter] Internal Remix MCP tools (${internalTools.length}):`, internalTools.map(t => t.name))

  // Get helper tools (get_current_file, get_opened_files, etc.)
  const helperTools = RemixToolAdapter.createSolidityHelperTools(plugin)
  console.log(`[RemixToolAdapter] Helper tools (${helperTools.length}):`, helperTools.map(t => t.name))

  // Get all external MCP client tools if mcpInferencer is provided
  let externalTools: DynamicStructuredTool[] = []
  if (mcpInferencer) {
    try {
      const allMCPTools = await mcpInferencer.getAvailableToolsForLLM()
      externalTools = adapter.convertExternalMCPTools(allMCPTools, mcpInferencer)
      console.log(`[RemixToolAdapter] External MCP tools (${externalTools.length}):`, externalTools.map(t => t.name))
    } catch (error) {
      console.warn('[RemixToolAdapter] Failed to get external MCP tools:', error)
    }
  }

  const allTools = [...internalTools, ...helperTools, ...externalTools]
  console.log(`[RemixToolAdapter] Total tools registered: ${allTools.length}`)
  return allTools
}
