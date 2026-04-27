/**
 * Tool Selection using Vector Embeddings
 * Selects relevant tools based on prompt similarity
 */

import type { DynamicStructuredTool } from '@langchain/core/tools'
import { Document } from '@langchain/core/documents'
import { z } from 'zod'

// Fallback type definitions for optional embeddings
interface EmbeddingsInterface {
  embedQuery(text: string): Promise<number[]>
  embedDocuments(texts: string[]): Promise<number[][]>
}

interface VectorStoreInterface {
  similaritySearch(query: string, k?: number): Promise<Document[]>
}

// Simple in-memory vector store fallback
class SimpleVectorStore implements VectorStoreInterface {
  private documents: Document[] = []
  private embeddings: number[][] = []

  constructor(docs: Document[], embeddings?: EmbeddingsInterface) {
    this.documents = docs
    // If no embeddings available, use simple text matching
    this.embeddings = docs.map(() => [])
  }

  async similaritySearch(query: string, k: number = 5): Promise<Document[]> {
    // Simple text-based matching fallback
    const queryLower = query.toLowerCase()
    const scores = this.documents.map((doc, index) => ({
      doc,
      score: this.calculateTextSimilarity(queryLower, doc.pageContent.toLowerCase()),
      index
    }))

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(item => item.doc)
  }

  private calculateTextSimilarity(query: string, content: string): number {
    const queryWords = query.split(/\s+/).filter(w => w.length > 2)
    if (queryWords.length === 0) return 0

    let score = 0
    for (const word of queryWords) {
      if (content.includes(word)) {
        score += 1
      }
    }
    return score / queryWords.length
  }
}

export interface ToolDocument {
  tool: DynamicStructuredTool
  document: Document
}

export interface ConversationAnalysis {
  phases: string[]
  currentPhase: string
  intentEvolution: string[]
  toolPatterns: Record<string, number>
  momentum: 'building' | 'stable' | 'declining'
  messageCount: number
  userMessageCount: number
}

export class ToolSelector {
  private vectorStore: VectorStoreInterface | null = null
  private toolDocuments: ToolDocument[] = []
  private initialized = false

  /**
   * Build vector index of tools
   */
  async buildToolIndex(tools: DynamicStructuredTool[]): Promise<void> {
    if (tools.length === 0) {
      console.warn('[ToolSelector] No tools provided for indexing')
      return
    }

    try {
      // Create documents from tools
      this.toolDocuments = tools.map((tool, index) => {
        const content = `${tool.name}: ${tool.description}`
        const document = new Document({
          pageContent: content,
          metadata: {
            index,
            toolName: tool.name,
            category: this.categorizeToolFromName(tool.name)
          }
        })

        return { tool, document }
      })

      // Build vector store
      const documents = this.toolDocuments.map(td => td.document)

      // For now, always use simple text-based matching as it's more reliable
      // TODO: Add proper vector embeddings when @langchain/openai is available
      this.vectorStore = new SimpleVectorStore(documents)
      this.initialized = true
      console.log(`[ToolSelector] Built text-based index for ${tools.length} tools`)
    } catch (error) {
      console.error('[ToolSelector] Failed to build tool index:', error)
      // Fallback: return all tools if everything fails
      this.toolDocuments = tools.map((tool, index) => ({
        tool,
        document: new Document({
          pageContent: `${tool.name}: ${tool.description}`,
          metadata: { index, toolName: tool.name, category: 'general' }
        })
      }))
      this.vectorStore = new SimpleVectorStore(this.toolDocuments.map(td => td.document))
      this.initialized = false
    }
  }

  /**
   * Get Etherscan-specific tools for the Etherscan subagent
   */
  getEtherscanTools(): DynamicStructuredTool[] {
    const etherscanTools = this.toolDocuments
      .filter(td => {
        // Check if tool comes from Etherscan MCP server
        const description = td.tool.description.toLowerCase()
        return description.includes('[etherscan]') ||
               td.tool.name.toLowerCase().includes('etherscan') ||
               description.includes('etherscan')
      })
      .map(td => td.tool)

    console.log(`[ToolSelector] Found ${etherscanTools.length} Etherscan tools`)
    return etherscanTools
  }

  /**
   * Get TheGraph-specific tools for the TheGraph subagent
   */
  getTheGraphTools(): DynamicStructuredTool[] {
    const theGraphTools = this.toolDocuments
      .filter(td => {
        // Check if tool comes from TheGraph MCP server
        const description = td.tool.description.toLowerCase()
        return description.includes('[the graph api]') ||
               description.includes('[thegraph]') ||
               td.tool.name.toLowerCase().includes('thegraph') ||
               td.tool.name.toLowerCase().includes('graph') ||
               description.includes('thegraph') ||
               description.includes('subgraph') ||
               description.includes('graphql')
      })
      .map(td => td.tool)

    console.log(`[ToolSelector] Found ${theGraphTools.length} TheGraph tools`)
    return theGraphTools
  }

  /**
   * Get Alchemy-specific tools for the Alchemy subagent
   */
  getAlchemyTools(): DynamicStructuredTool[] {
    const alchemyTools = this.toolDocuments
      .filter(td => {
        // Check if tool comes from Alchemy MCP server
        const description = td.tool.description.toLowerCase()
        return description.includes('[alchemy]') ||
               td.tool.name.toLowerCase().includes('alchemy') ||
               description.includes('alchemy')
      })
      .map(td => td.tool)

    console.log(`[ToolSelector] Found ${alchemyTools.length} Alchemy tools`)
    return alchemyTools
  }

  /**
   * Filter out Etherscan tools from a tool list
   */
  filterOutEtherscanTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
    const etherscanToolNames = new Set(this.getEtherscanTools().map(t => t.name))
    const filteredTools = tools.filter(tool => !etherscanToolNames.has(tool.name))

    console.log(`[ToolSelector] Filtered out ${tools.length - filteredTools.length} Etherscan tools from main agent`)
    return filteredTools
  }

  /**
   * Filter out TheGraph tools from a tool list
   */
  filterOutTheGraphTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
    const theGraphToolNames = new Set(this.getTheGraphTools().map(t => t.name))
    const filteredTools = tools.filter(tool => !theGraphToolNames.has(tool.name))

    console.log(`[ToolSelector] Filtered out ${tools.length - filteredTools.length} TheGraph tools from main agent`)
    return filteredTools
  }

  /**
   * Filter out Alchemy tools from a tool list
   */
  filterOutAlchemyTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
    const alchemyToolNames = new Set(this.getAlchemyTools().map(t => t.name))
    const filteredTools = tools.filter(tool => !alchemyToolNames.has(tool.name))

    console.log(`[ToolSelector] Filtered out ${tools.length - filteredTools.length} Alchemy tools from main agent`)
    return filteredTools
  }

  /**
   * Filter out all specialist tools (Etherscan, TheGraph, Alchemy) from a tool list
   */
  filterOutSpecialistTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
    const etherscanToolNames = new Set(this.getEtherscanTools().map(t => t.name))
    const theGraphToolNames = new Set(this.getTheGraphTools().map(t => t.name))
    const alchemyToolNames = new Set(this.getAlchemyTools().map(t => t.name))

    const filteredTools = tools.filter(tool =>
      !etherscanToolNames.has(tool.name) &&
      !theGraphToolNames.has(tool.name) &&
      !alchemyToolNames.has(tool.name)
    )

    const removedCount = tools.length - filteredTools.length
    console.log(`[ToolSelector] Filtered out ${removedCount} specialist tools (Etherscan + TheGraph + Alchemy) from main agent`)
    return filteredTools
  }

  /**
   * Categorize tool based on name patterns
   */
  private categorizeToolFromName(toolName: string): string {
    const name = toolName.toLowerCase()

    if (name.includes('compile') || name.includes('solidity')) return 'compilation'
    if (name.includes('debug') || name.includes('trace')) return 'debugging'
    if (name.includes('deploy') || name.includes('network')) return 'deployment'
    if (name.includes('analyze') || name.includes('security') || name.includes('audit')) return 'analysis'
    if (name.includes('file') || name.includes('read') || name.includes('write')) return 'file'

    return 'general'
  }

  /**
   * Generate system prompt addition with information about non-selected tools
   */
  generateToolInventoryPrompt(selectedTools: DynamicStructuredTool[]): string {
    const selectedToolNames = new Set(selectedTools.map(t => t.name))
    const etherscanToolNames = new Set(this.getEtherscanTools().map(t => t.name))
    const theGraphToolNames = new Set(this.getTheGraphTools().map(t => t.name))
    const alchemyToolNames = new Set(this.getAlchemyTools().map(t => t.name))
    console.log('Specialist tools:', { theGraphToolNames, etherscanToolNames, alchemyToolNames })

    const nonSelectedTools = this.toolDocuments
      .filter(td =>
        !selectedToolNames.has(td.tool.name) &&
        !etherscanToolNames.has(td.tool.name) && // Exclude Etherscan tools
        !theGraphToolNames.has(td.tool.name) && // Exclude TheGraph tools
        !alchemyToolNames.has(td.tool.name) // Exclude Alchemy tools
      )
      .map(td => td.tool)

    if (nonSelectedTools.length === 0) {
      return ""
    }

    const toolCategories: Record<string, Array<{name: string, description: string}>> = {}

    // Group non-selected tools by category
    for (const tool of nonSelectedTools) {
      const category = this.categorizeToolFromName(tool.name)
      if (!toolCategories[category]) {
        toolCategories[category] = []
      }
      toolCategories[category].push({
        name: tool.name,
        description: tool.description
      })
    }

    let prompt = "\n\n## ADDITIONAL AVAILABLE TOOLS\n"
    prompt += "These tools are available but not currently loaded. You can use them in two ways:\n"
    prompt += "1. Use 'get_tool_schema' to understand their schema\n"
    prompt += "2. Use 'call_tool' to execute them directly with proper arguments\n\n"

    for (const [category, tools] of Object.entries(toolCategories)) {
      if (tools.length > 0) {
        prompt += `### ${category.charAt(0).toUpperCase() + category.slice(1)} Tools:\n`
        for (const tool of tools) {
          prompt += `- **${tool.name}**: ${tool.description}\n`
        }
        prompt += "\n"
      }
    }

    prompt += "Examples:\n"
    prompt += "- To understand a tool: get_tool_schema({\"toolName\": \"tool_name_here\"})\n"
    prompt += "- To call a tool directly: call_tool({\"toolName\": \"tool_name_here\", \"arguments\": {\"param1\": \"value1\"}})\n"

    console.log(`[ToolSelector] Generated tool inventory prompt for ${nonSelectedTools.length} additional tools (Etherscan + TheGraph + Alchemy tools excluded)`)
    return prompt
  }

  /**
   * Create meta-tool for getting tool schemas
   */
  private createGetToolSchemaTool(): DynamicStructuredTool {
    const DynamicStructuredTool = require('@langchain/core/tools').DynamicStructuredTool

    return new DynamicStructuredTool({
      name: 'get_tool_schema',
      description: 'Get the schema and description of any available tool by name. Use this to understand how to call tools that are not currently loaded.',
      schema: z.object({
        toolName: z.string().describe('Name of the tool to get schema for')
      }),
      func: async (input: { toolName: string }) => {
        const tool = this.toolDocuments.find((td: ToolDocument) => td.tool.name === input.toolName)
        if (!tool) {
          const availableTools = this.toolDocuments.map(td => td.tool.name).join(', ')
          return `Tool '${input.toolName}' not found. Available tools: ${availableTools}`
        }

        return JSON.stringify({
          name: tool.tool.name,
          description: tool.tool.description,
          schema: tool.tool.schema,
          category: tool.document.metadata.category
        }, null, 2)
      }
    })
  }

  /**
   * Create meta-tool for calling any available tool
   */
  private createCallToolMetaTool(): DynamicStructuredTool {
    const DynamicStructuredTool = require('@langchain/core/tools').DynamicStructuredTool

    return new DynamicStructuredTool({
      name: 'call_tool',
      description: 'Call any available tool by name with the provided arguments. Use get_tool_schema first to understand the required arguments.',
      schema: z.object({
        toolName: z.string().describe('Name of the tool to call'),
        arguments: z.record(z.string(), z.any()).describe('Arguments to pass to the tool as a JSON object')
      }),
      func: async (input: { toolName: string; arguments: Record<string, any> }) => {
        const toolDoc = this.toolDocuments.find((td: ToolDocument) => td.tool.name === input.toolName)
        if (!toolDoc) {
          const availableTools = this.toolDocuments.map(td => td.tool.name).join(', ')
          return `Error: Tool '${input.toolName}' not found. Available tools: ${availableTools}`
        }

        try {
          // Call the actual tool with provided arguments
          // Note: Validation is handled by the tool itself
          const validatedArgs = input.arguments

          // Call the actual tool
          console.log(`[ToolSelector] Calling tool '${input.toolName}' with args:`, validatedArgs)
          const result = await toolDoc.tool.func(validatedArgs)

          return `Tool '${input.toolName}' executed successfully. Result: ${result}`
        } catch (error: any) {
          console.error(`[ToolSelector] Error calling tool '${input.toolName}':`, error)

          if (error.name === 'ZodError') {
            return `Error: Invalid arguments for tool '${input.toolName}'. ${error.message}. Use get_tool_schema to see the correct argument format.`
          }

          return `Error calling tool '${input.toolName}': ${error.message || error}`
        }
      }
    })
  }

  /**
   * Get essential tools that should always be available
   */
  public getEssentialTools(): DynamicStructuredTool[] {
    const essentialToolNames = [
      'get_current_file',
      'get_opened_files',
      'read_file'
    ]

    const essentialTools = this.toolDocuments
      .filter(td => essentialToolNames.includes(td.tool.name))
      .map(td => td.tool)

    // Add the meta-tools
    essentialTools.push(this.createGetToolSchemaTool())
    essentialTools.push(this.createCallToolMetaTool())

    return essentialTools
  }

  /**
   * Get all tools (for fallback scenarios)
   */
  getAllTools(): DynamicStructuredTool[] {
    return this.toolDocuments.map(td => td.tool)
  }

  /**
   * Check if selector is ready
   */
  isReady(): boolean {
    return this.toolDocuments.length > 0
  }
}