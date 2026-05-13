import { Plugin } from '@remixproject/engine'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { IMCPTool, IMCPToolCall, IMCPToolResult } from '../../../types/mcp'
import { RemixToolDefinition, ToolRegistry } from '../../../remix-mcp-server/types/mcpTools'
import { ToolApprovalGate } from './ToolApprovalGate'
import { jsonSchemaToZod, mcpResultToString } from './schemaConverters'

export class RemixToolAdapter {
  private plugin: Plugin
  private toolRegistry: ToolRegistry
  private approvalGate?: ToolApprovalGate

  constructor(plugin: Plugin, toolRegistry: ToolRegistry, approvalGate?: ToolApprovalGate) {
    this.plugin = plugin
    this.toolRegistry = toolRegistry
    this.approvalGate = approvalGate
  }

  getAllTools(): DynamicStructuredTool[] {
    const tools: DynamicStructuredTool[] = []
    const allToolDefs = this.toolRegistry.list()

    for (const toolDef of allToolDefs) {
      tools.push(this.convertToLangChainTool(toolDef))
    }

    return tools
  }

  getTools(toolNames: string[]): DynamicStructuredTool[] {
    return toolNames
      .map(name => {
        const toolDef = this.toolRegistry.get(name)
        return toolDef ? this.convertToLangChainTool(toolDef) : null
      })
      .filter((tool): tool is DynamicStructuredTool => tool !== null)
  }

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

        const description = serverName.toLowerCase().includes('remix') ? tool.description : `[${serverName}] ${tool.description}` // Prefix description with server name for non-Remix tools to provide context to the LLM.
        const langChainTool = new DynamicStructuredTool({
          name: tool.name,
          description,
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

export async function createRemixTools(
  plugin: Plugin,
  toolRegistry: ToolRegistry,
  mcpInferencer?: any,
  approvalGate?: ToolApprovalGate
): Promise<DynamicStructuredTool[]> {
  const adapter = new RemixToolAdapter(plugin, toolRegistry, approvalGate)

  const solidityTools = adapter.getSolidityTools()
  console.log('solidity tools:', solidityTools)

  const helperTools = RemixToolAdapter.createSolidityHelperTools(plugin)
  console.log('helper tools:', helperTools)

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
}
