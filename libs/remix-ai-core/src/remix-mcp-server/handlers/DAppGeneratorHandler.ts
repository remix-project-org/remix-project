/**
 * DApp Generator Tool Handlers for Remix MCP Server
 *
 * Provides tools for generating and updating React-based DApp frontends
 * that integrate with deployed smart contracts using the DeepAgent workflow.
 */

import { IMCPToolResult } from '../../types/mcp'
import { BaseToolHandler } from '../registry/RemixToolRegistry'
import { ToolCategory, RemixToolDefinition } from '../types/mcpTools'
import { Plugin } from '@remixproject/engine'
import {
  DAppPromptContext,
  DAppContractInfo,
  DAppUserMessageOptions,
  buildDAppSystemPrompt,
  buildDAppUserMessage,
  parsePages,
  findMissingImports,
  isLocalVMChainId,
  REQUIRED_DAPP_FILES
} from '../../inferencers/deepagent/DAppGeneratorPrompts'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface GenerateDAppArgs {
  description: string
  contractAddress: string
  contractAbi: any[]
  chainId: number | string
  contractName: string
  imageBase64?: string
  isBaseMiniApp?: boolean
  workspaceName?: string
}

export interface UpdateDAppArgs {
  description: string | any[]
  currentFiles: Record<string, string>
  contractAddress: string
  contractAbi: any[]
  chainId: number | string
  hasImage?: boolean
  workspaceName?: string
}

export interface DAppGenerationResult {
  success: boolean
  files: Record<string, string>
  fileCount: number
  contractAddress: string
  message?: string
}

// ──────────────────────────────────────────────
// Generate DApp Tool Handler
// ──────────────────────────────────────────────

export class GenerateDAppHandler extends BaseToolHandler {
  name = 'generate_dapp'
  description = 'Generate a new DApp frontend from a description and smart contract ABI. Creates a multi-file React application with ethers.js integration.'
  inputSchema = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Description of the DApp to generate, including design preferences and features'
      },
      contractAddress: {
        type: 'string',
        description: 'Deployed contract address',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      contractAbi: {
        type: 'array',
        description: 'Contract ABI (Application Binary Interface)',
        items: { type: 'object' }
      },
      chainId: {
        type: ['number', 'string'],
        description: 'Target chain ID (e.g., 1 for mainnet, 11155111 for Sepolia, 0 for Remix VM)'
      },
      contractName: {
        type: 'string',
        description: 'Name of the contract'
      },
      imageBase64: {
        type: 'string',
        description: 'Optional base64-encoded image to use as design reference (vision mode)'
      },
      isBaseMiniApp: {
        type: 'boolean',
        description: 'Whether to generate as a Base Mini App',
        default: false
      },
      workspaceName: {
        type: 'string',
        description: 'Target workspace name to write files to'
      }
    },
    required: ['description', 'contractAddress', 'contractAbi', 'chainId', 'contractName']
  }

  getPermissions(): string[] {
    return ['dapp:generate', 'file:write']
  }

  validate(args: GenerateDAppArgs): boolean | string {
    const required = this.validateRequired(args, ['description', 'contractAddress', 'contractAbi', 'chainId', 'contractName'])
    if (required !== true) return required

    if (!args.contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format'
    }

    if (!Array.isArray(args.contractAbi)) {
      try {
        args.contractAbi = JSON.parse(args.contractAbi as any)
        if (!Array.isArray(args.contractAbi)) {
          return 'Contract ABI must be an array'
        }
      } catch (e) {
        return 'Contract ABI must be a valid JSON array'
      }
    }

    return true
  }

  async execute(args: GenerateDAppArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const hasImage = !!args.imageBase64

      // Build prompt context
      const contractInfo: DAppContractInfo = {
        address: args.contractAddress,
        abi: args.contractAbi,
        chainId: args.chainId,
        name: args.contractName
      }

      const ctx: DAppPromptContext = {
        contract: contractInfo,
        isBaseMiniApp: args.isBaseMiniApp,
        hasImage,
        isLocalVM: isLocalVMChainId(args.chainId)
      }

      // Build system prompt and user message
      const systemPrompt = buildDAppSystemPrompt(ctx)
      const msgOptions: DAppUserMessageOptions = {
        description: args.description,
        image: args.imageBase64
      }
      const userMessage = buildDAppUserMessage(ctx, msgOptions)

      // Emit progress event
      plugin.emit('generationProgress', { status: 'preparing', contractAddress: args.contractAddress })

      await plugin.call('manager', 'activatePlugin', 'quick-dapp-v2')
      plugin.call('tabs', 'focus', 'quick-dapp-v2')
      // Call the AI model to generate the DApp
      plugin.emit('generationProgress', { status: 'calling_llm', contractAddress: args.contractAddress })

      const response = await this.callAIModel(plugin, systemPrompt, userMessage, hasImage)

      // Parse the response into files
      plugin.emit('generationProgress', { status: 'parsing', contractAddress: args.contractAddress })
      let pages = parsePages(response)

      if (Object.keys(pages).length === 0) {
        return this.createErrorResult('AI failed to generate valid file structure. Please try again with a different description.')
      }

      // Validate required files and retry if needed
      plugin.emit('generationProgress', { status: 'validating', contractAddress: args.contractAddress })
      pages = await this.validateAndRetryMissingFiles(plugin, pages, response, systemPrompt, userMessage, hasImage)

      // Write files to workspace if specified
      if (args.workspaceName) {
        await this.writeFilesToWorkspace(plugin, args.workspaceName, pages)
      }

      const result: DAppGenerationResult = {
        success: true,
        files: pages,
        fileCount: Object.keys(pages).length,
        contractAddress: args.contractAddress,
        message: `Generated ${Object.keys(pages).length} files for DApp`
      }

      plugin.emit('dappGenerated', {
        address: args.contractAddress,
        content: pages,
        isUpdate: false
      })

      return this.createSuccessResult(result)

    } catch (error: any) {
      return this.createErrorResult(`DApp generation failed: ${error.message}`)
    }
  }

  private async callAIModel(
    plugin: Plugin,
    systemPrompt: string,
    userMessage: string | any[],
    hasImage: boolean
  ): Promise<string> {
    // Use the remixAI plugin to call the AI model with the DApp Generator context
    // This routes through DeepAgent with the appropriate subagent
    try {
      const messages = [{ role: 'user', content: userMessage }]

      // Call remixAI with the DApp generation context
      const response = await plugin.call('remixAI' as any, 'generateDAppContent', {
        messages,
        systemPrompt,
        hasImage,
        isUpdate: false
      })

      return response
    } catch (error: any) {
      throw new Error(`AI model call failed: ${error.message}`)
    }
  }

  private async validateAndRetryMissingFiles(
    plugin: Plugin,
    pages: Record<string, string>,
    originalResponse: string,
    systemPrompt: string,
    userMessage: string | any[],
    hasImage: boolean
  ): Promise<Record<string, string>> {
    const missing = REQUIRED_DAPP_FILES.filter(f => !pages[f])

    if (missing.length === 0) return pages

    console.warn(`[DAppGenerator] Missing required files: ${missing.join(', ')}. Requesting retry...`)

    try {
      const retryMessages = [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: originalResponse },
        {
          role: 'user',
          content: `The following required files were missing from your response: ${missing.join(', ')}. Please generate ONLY these missing files using the START_TITLE format. Do not regenerate files that were already provided.`
        }
      ]

      const additionalResponse = await plugin.call('remixAI' as any, 'generateDAppContent', {
        messages: retryMessages,
        systemPrompt,
        hasImage: false,
        isUpdate: false
      })

      const additionalPages = parsePages(additionalResponse)
      Object.assign(pages, additionalPages)
    } catch (retryErr: any) {
      console.warn('[DAppGenerator] Retry for missing files failed:', retryErr.message)
    }

    return pages
  }

  private async writeFilesToWorkspace(
    plugin: Plugin,
    workspaceName: string,
    pages: Record<string, string>
  ): Promise<void> {
    for (const [filename, content] of Object.entries(pages)) {
      const normalizedPath = filename.startsWith('/') ? filename : `/${filename}`
      try {
        // Ensure directory exists
        const dirPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'))
        if (dirPath && dirPath !== '/') {
          try {
            await plugin.call('fileManager', 'mkdir', dirPath)
          } catch (e) {
            // Directory may already exist
          }
        }
        await plugin.call('fileManager', 'writeFile', normalizedPath, content)
      } catch (error: any) {
        console.error(`[DAppGenerator] Failed to write file ${normalizedPath}:`, error.message)
      }
    }
  }
}

// ──────────────────────────────────────────────
// Update DApp Tool Handler
// ──────────────────────────────────────────────

export class UpdateDAppHandler extends BaseToolHandler {
  name = 'update_dapp'
  description = 'Update an existing DApp with new instructions while preserving blockchain logic. Returns modified and new files.'
  inputSchema = {
    type: 'object',
    properties: {
      description: {
        type: ['string', 'array'],
        description: 'Update instructions (text or multipart with image)'
      },
      currentFiles: {
        type: 'object',
        description: 'Current DApp files as key-value pairs (filename: content)',
        additionalProperties: { type: 'string' }
      },
      contractAddress: {
        type: 'string',
        description: 'Contract address',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      contractAbi: {
        type: 'array',
        description: 'Contract ABI',
        items: { type: 'object' }
      },
      chainId: {
        type: ['number', 'string'],
        description: 'Target chain ID'
      },
      hasImage: {
        type: 'boolean',
        description: 'Whether the description includes an image',
        default: false
      },
      workspaceName: {
        type: 'string',
        description: 'Target workspace name to write files to'
      }
    },
    required: ['description', 'currentFiles', 'contractAddress', 'contractAbi', 'chainId']
  }

  getPermissions(): string[] {
    return ['dapp:update', 'file:write']
  }

  validate(args: UpdateDAppArgs): boolean | string {
    const required = this.validateRequired(args, ['description', 'currentFiles', 'contractAddress', 'contractAbi', 'chainId'])
    if (required !== true) return required

    if (!args.contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format'
    }

    if (!Array.isArray(args.contractAbi)) {
      try {
        args.contractAbi = JSON.parse(args.contractAbi as any)
        if (!Array.isArray(args.contractAbi)) {
          return 'Contract ABI must be an array'
        }
      } catch (e) {
        return 'Contract ABI must be a valid JSON array'
      }
    }

    if (typeof args.currentFiles !== 'object' || args.currentFiles === null) {
      return 'currentFiles must be an object with filename: content pairs'
    }

    return true
  }

  async execute(args: UpdateDAppArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const hasImage = args.hasImage || (Array.isArray(args.description) && args.description.some((p: any) => p.type === 'image_url'))

      // Build prompt context
      const contractInfo: DAppContractInfo = {
        address: args.contractAddress,
        abi: args.contractAbi,
        chainId: args.chainId
      }

      const ctx: DAppPromptContext = {
        contract: contractInfo,
        isUpdate: true,
        hasImage,
        isLocalVM: isLocalVMChainId(args.chainId)
      }

      // Build system prompt and user message
      const systemPrompt = buildDAppSystemPrompt(ctx)
      const msgOptions: DAppUserMessageOptions = {
        description: args.description,
        currentFiles: args.currentFiles
      }
      const userMessage = buildDAppUserMessage(ctx, msgOptions)

      // Emit progress event
      plugin.emit('generationProgress', { status: 'preparing', contractAddress: args.contractAddress })

      // Call the AI model
      plugin.emit('generationProgress', { status: 'calling_llm', contractAddress: args.contractAddress })

      const messages = [{ role: 'user', content: userMessage }]
      const response = await plugin.call('remixAI' as any, 'generateDAppContent', {
        messages,
        systemPrompt,
        hasImage,
        isUpdate: true
      })

      // Parse the patched pages
      console.log('[DAppGenerator] Update response received, parsing files... shouldnt be parsing files as subagent already does that, response length:', response?.length || 0)
      const patchedPages = parsePages(response)
      plugin.emit('generationProgress', { status: 'parsing', contractAddress: args.contractAddress, fileCount: Object.keys(patchedPages).length })

      if (Object.keys(patchedPages).length === 0) {
        return this.createErrorResult('AI failed to return valid file structure.')
      }

      // Normalize paths and merge with current files
      const normalizeKey = (k: string) => k.startsWith('/') ? k.substring(1) : k

      const normalizedCurrent: Record<string, string> = {}
      for (const [file, content] of Object.entries(args.currentFiles)) {
        normalizedCurrent[normalizeKey(file)] = content
      }

      const mergedPages: Record<string, string> = { ...normalizedCurrent }
      for (const [file, content] of Object.entries(patchedPages)) {
        mergedPages[normalizeKey(file)] = content
      }

      // Detect missing imports
      plugin.emit('generationProgress', { status: 'validating', contractAddress: args.contractAddress })
      const missingImports = findMissingImports(mergedPages)

      if (missingImports.length > 0) {
        try {
          const retryMessages = [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: response },
            {
              role: 'user',
              content: `The following files are imported in the code but were not included in your response:\n${missingImports.map(f => `- ${f}`).join('\n')}\n\nPlease generate ONLY these missing files using the START_TITLE format. Do not regenerate files that were already provided.`
            }
          ]

          const additionalResponse = await plugin.call('remixAI' as any, 'generateDAppContent', {
            messages: retryMessages,
            systemPrompt,
            hasImage: false,
            isUpdate: true
          })

          const additionalPages = parsePages(additionalResponse)
          for (const [file, content] of Object.entries(additionalPages)) {
            mergedPages[normalizeKey(file)] = content
          }
        } catch (retryErr: any) {
          console.warn('[DAppGenerator] Retry for missing imports failed:', retryErr.message)
        }
      }

      // Write files to workspace if specified
      if (args.workspaceName) {
        // Only write changed/new files, not the entire merged set
        for (const [filename, content] of Object.entries(patchedPages)) {
          const normalizedPath = filename.startsWith('/') ? filename : `/${filename}`
          try {
            const dirPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'))
            if (dirPath && dirPath !== '/') {
              try {
                await plugin.call('fileManager', 'mkdir', dirPath)
              } catch (e) {
                // Directory may already exist
              }
            }
            await plugin.call('fileManager', 'writeFile', normalizedPath, content)
          } catch (error: any) {
            console.error(`[DAppGenerator] Failed to write file ${normalizedPath}:`, error.message)
          }
        }
      }

      const result: DAppGenerationResult = {
        success: true,
        files: mergedPages,
        fileCount: Object.keys(mergedPages).length,
        contractAddress: args.contractAddress,
        message: `Updated DApp with ${Object.keys(patchedPages).length} modified/new files`
      }

      plugin.emit('dappGenerated', {
        address: args.contractAddress,
        content: mergedPages,
        isUpdate: true
      })

      return this.createSuccessResult(result)

    } catch (error: any) {
      return this.createErrorResult(`DApp update failed: ${error.message}`)
    }
  }
}

// ──────────────────────────────────────────────
// Tool Definition Factory
// ──────────────────────────────────────────────

export function createDAppGeneratorTools(): RemixToolDefinition[] {
  return [
    {
      name: 'generate_dapp',
      description: 'Generate a new DApp frontend from a description and smart contract ABI. Creates a multi-file React application with ethers.js integration.',
      inputSchema: new GenerateDAppHandler().inputSchema,
      category: ToolCategory.WORKSPACE, // Using WORKSPACE category for DApp generation
      permissions: ['dapp:generate', 'file:write'],
      handler: new GenerateDAppHandler()
    },
    {
      name: 'update_dapp',
      description: 'Update an existing DApp with new instructions while preserving blockchain logic. Returns modified and new files.',
      inputSchema: new UpdateDAppHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:update', 'file:write'],
      handler: new UpdateDAppHandler()
    }
  ]
}
