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
  isSafeTool
} from '../../types/humanInTheLoop'

/**
 * Convert JSON Schema to Zod schema for LangChain
 */
function jsonSchemaToZod(schema: any): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {}

  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
      let zodType: z.ZodTypeAny

      switch (prop.type) {
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
      }
    })
  }

  setPolicy(policy: ToolApprovalPolicy) {
    this.policy = policy
  }

  /**
   * Wrap a tool's func so risky calls require user approval first.
   */
  wrap(toolName: string, originalFunc: (args: Record<string, any>) => Promise<string>): (args: Record<string, any>) => Promise<string> {
    if (isSafeTool(toolName)) return originalFunc

    return async (args: Record<string, any>): Promise<string> => {
      if (!shouldRequireApproval(toolName, this.policy)) {
        return originalFunc(args)
      }

      const meta = getToolMetadata(toolName)
      const requestId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      // For file writes, try to read existing content for diff
      let existingContent: string | undefined
      if (meta.category === 'file_write' && args.path) {
        try {
          existingContent = await this.plugin.call('fileManager', 'readFile', args.path)
        } catch {
          // file doesn't exist yet
        }
      }

      const request: ToolApprovalRequest = {
        requestId,
        toolName,
        toolArgs: args,
        category: meta.category,
        risk: meta.risk,
        existingContent,
        proposedContent: args.content || args.data,
        filePath: args.path || args.filePath,
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
        return JSON.stringify({ cancelled: true, reason: 'User rejected the action' })
      }

      return originalFunc(modifiedArgs || args)
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

        const langChainTool = new DynamicStructuredTool({
          name: tool.name,
          description: `[${serverName}] ${tool.description}`,
          schema: zodSchema,
          func: async (input: Record<string, any>) => {
            try {
              // Execute tool through MCPInferencer
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
        const result = await toolDef.handler.execute(input, this.plugin)
        return mcpResultToString(result)
      } catch (error) {
        return `Tool execution error: ${error.message}`
      }
    }

    if (this.approvalGate) {
      func = this.approvalGate.wrap(toolDef.name, func)
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

  // Get Solidity-specific tools from internal Remix MCP server
  const solidityTools = adapter.getSolidityTools()
  console.log('solidity tools:', solidityTools)

  // Get helper tools
  const helperTools = RemixToolAdapter.createSolidityHelperTools(plugin)
  console.log('helper tools:', helperTools)

  // Get all external MCP client tools if mcpInferencer is provided
  let externalTools: DynamicStructuredTool[] = []
  if (mcpInferencer) {
    try {
      const allMCPTools = await mcpInferencer.getAvailableToolsForLLM()
      externalTools = adapter.convertExternalMCPTools(allMCPTools, mcpInferencer)
      console.log(`[RemixToolAdapter] all tools  from MCPInferencer:`, externalTools)
      console.log(`[RemixToolAdapter] Added ${externalTools.length} tools from external MCP clients`)
    } catch (error) {
      console.warn('[RemixToolAdapter] Failed to get external MCP tools:', error)
    }
  }

  return [...externalTools]
  // return [...solidityTools, ...helperTools, ...externalTools]
}
