/**
 * DApp Generator Tool Handlers for Remix MCP Server
 *
 * Provides tools for generating and updating React-based DApp frontends
 * that integrate with deployed smart contracts using the DeepAgent workflow.
 */

import { IMCPToolResult } from '../../types/mcp'
import { endpointUrls } from '@remix-endpoints-helper'
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
  figmaUrl?: string
  figmaToken?: string
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
  description = 'Create a new DApp frontend from a deployed smart contract. IMPORTANT: Do NOT call this tool immediately. First, ask the user these 3 questions one at a time: 1) Describe the DApp design you want (free text). 2) Do you have a Figma design URL? (optional). 3) Should it be a Base Mini App? (optional). After collecting answers, call this tool with ALL parameters including the contract details from the user prompt.'
  inputSchema = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Description of the DApp to generate, including design preferences and features'
      },
      contractAddress: {
        type: 'string',
        description: 'Deployed contract address (0x...)',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      contractAbi: {
        type: 'array',
        description: 'Contract ABI (Application Binary Interface)',
        items: { type: 'object' }
      },
      chainId: {
        type: ['number', 'string'],
        description: 'Target chain ID (e.g., 1 for mainnet, 11155111 for Sepolia, "vm-osaka" for Remix VM)'
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
        description: 'Whether to generate as a Base Mini App with Coinbase SDK',
        default: false
      },
      figmaUrl: {
        type: 'string',
        description: 'Figma design file URL (optional, must contain ?node-id=...)'
      },
      figmaToken: {
        type: 'string',
        description: 'Figma Personal Access Token (required if figmaUrl is provided)'
      }
    },
    required: ['description', 'contractName', 'contractAddress', 'contractAbi', 'chainId']
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

    if (args.figmaUrl && !args.figmaToken) {
      return 'Figma token is required when using a Figma URL'
    }

    return true
  }

  async execute(args: GenerateDAppArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const hasImage = !!args.imageBase64

      // Create DApp workspace
      let workspaceSlug: string

      try {
        const wsResult = await plugin.call('quick-dapp-v2' as any, 'createDappWorkspace', {
          contractName: args.contractName,
          address: args.contractAddress,
          abi: args.contractAbi,
          chainId: args.chainId,
          isBaseMiniApp: args.isBaseMiniApp
        })
        workspaceSlug = wsResult.workspaceName
      } catch (wsErr: any) {
        console.error('[QuickDapp] createDappWorkspace failed:', wsErr?.message || wsErr)
        return this.createErrorResult(`Failed to create DApp workspace: ${wsErr.message}`)
      }

      // Open dashboard
      try {
        console.log('[QuickDapp] Opening dashboard...')
        // activatePlugin is needed so React mounts and event listeners are ready
        await plugin.call('manager' as any, 'activatePlugin', 'quick-dapp-v2')
        await plugin.call('tabs' as any, 'focus', 'quick-dapp-v2')
        await new Promise(r => setTimeout(r, 300))
        console.log('[QuickDapp] Dashboard opened')
      } catch (e: any) {
        console.warn('[QuickDapp] Dashboard focus failed (non-critical):', e?.message)
      }

      // Notify React UI that a new DApp is being created (sets processing state on card)
      plugin.emit('generationProgress', { status: 'preparing', contractAddress: args.contractAddress, slug: workspaceSlug })

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

      const systemPrompt = buildDAppSystemPrompt(ctx)
      const msgOptions: DAppUserMessageOptions = {
        description: args.description,
        image: args.imageBase64
      }
      const userMessage = buildDAppUserMessage(ctx, msgOptions)

      // Call LLM
      console.log('[QuickDapp] Calling LLM...')
      plugin.emit('generationProgress', { status: 'calling_llm', contractAddress: args.contractAddress, slug: workspaceSlug })

      let response: string
      try {
        response = await this.callAIModel(plugin, systemPrompt, userMessage, hasImage)
        console.log('[QuickDapp] LLM response received, length:', response?.length)
      } catch (llmErr: any) {
        console.error('[QuickDapp] LLM call failed:', llmErr?.message || llmErr)
        return this.createErrorResult(`LLM call failed: ${llmErr.message}`)
      }

      // Parse response
      plugin.emit('generationProgress', { status: 'parsing', contractAddress: args.contractAddress, slug: workspaceSlug })
      let pages = parsePages(response)
      const parsedFileCount = Object.keys(pages).length

      if (parsedFileCount === 0) {
        console.error('[GenerateDApp] parsePages returned 0 files. First 300 chars:', response?.substring(0, 300))
        return this.createErrorResult('AI failed to generate valid file structure. Please try again.')
      }
      console.log('[GenerateDApp] Parsed', parsedFileCount, 'files:', Object.keys(pages).join(', '))

      // Validate required files and retry if needed
      plugin.emit('generationProgress', { status: 'validating', contractAddress: args.contractAddress, slug: workspaceSlug })
      pages = await this.validateAndRetryMissingFiles(plugin, pages, response, systemPrompt, userMessage, hasImage)

      // Write files
      console.log('[QuickDapp] Writing files...')
      const fileNames = Object.keys(pages)
      try {
        await this.writeFilesToWorkspace(plugin, workspaceSlug, pages)
        console.log('[QuickDapp] Files written:', fileNames.join(', '))
      } catch (writeErr: any) {
        console.error('[QuickDapp] File write failed:', writeErr?.message || writeErr)
        return this.createErrorResult(`Failed to write files to workspace: ${writeErr.message}`)
      }

      // Update config status
      console.log('[QuickDapp] Updating config...')
      try {
        const configContent = await plugin.call('fileManager', 'readFile', 'dapp.config.json')
        if (configContent) {
          const config = JSON.parse(configContent)
          config.status = 'created'
          config.processingStartedAt = null
          config.updatedAt = Date.now()
          await plugin.call('fileManager', 'writeFile', 'dapp.config.json', JSON.stringify(config, null, 2))
          console.log('[QuickDapp] Config updated')
        }
      } catch (configErr) {
        console.warn('[QuickDapp] Config update failed (non-critical):', configErr)
      }

      // Emit event and open DApp
      console.log('[QuickDapp] Emitting dappGenerated (plugin:', (plugin as any).name, ')...')
      plugin.emit('dappGenerated', {
        address: args.contractAddress,
        slug: workspaceSlug,
        isUpdate: false
      })
      console.log('[QuickDapp] dappGenerated emitted')

      try {
        console.log('[QuickDapp] Opening DApp detail page...')
        await plugin.call('manager', 'activatePlugin', 'quick-dapp-v2')
        await plugin.call('quick-dapp-v2' as any, 'openDapp', workspaceSlug)
        await plugin.call('tabs' as any, 'focus', 'quick-dapp-v2')
        console.log('[QuickDapp] Auto-open complete')
      } catch (e: any) {
        console.warn('[QuickDapp] Auto-open failed (non-critical):', e?.message)
      }

      console.log('[QuickDapp] GenerateDAppHandler.execute() DONE — slug:', workspaceSlug, ', files:', fileNames.length)
      return this.createSuccessResult({
        success: true,
        fileNames,
        fileCount: fileNames.length,
        slug: workspaceSlug,
        contractAddress: args.contractAddress,
        message: `✅ DApp "${args.contractName}" created successfully in workspace "${workspaceSlug}". ${fileNames.length} files generated: ${fileNames.join(', ')}. The DApp is now open in the QuickDapp tab. Do NOT write any additional files — everything is already saved.`
      })

    } catch (error: any) {
      console.error('[GenerateDApp] Generation failed:', error)
      plugin.emit('dappGenerationError', {
        slug: undefined,
        error: error.message
      })
      return this.createErrorResult(
        `DApp generation failed: ${error.message}\n\n` +
        `IMPORTANT: Do NOT try to create DApp files manually using write_file. ` +
        `The generate_dapp tool handles all file creation. ` +
        `Tell the user the error and suggest they check that the proxy server is running (npm start in remix-langchain-proxyserver).`
      )
    }
  }

  private async callAIModel(
    plugin: Plugin,
    systemPrompt: string,
    userMessage: string | any[],
    hasImage: boolean
  ): Promise<string> {
    // DIRECT LLM CALL — bypasses plugin.call('remixAI', ...) to avoid
    // re-entrant plugin call blocking. The handler runs inside a DeepAgent tool,
    // which is inside remixAI.answer(). Calling remixAI again would deadlock.
    const PROXY_URL = endpointUrls.langchain
    const DAPP_MODEL = 'claude-sonnet-4-5'
    const DAPP_MAX_TOKENS = 16384

    console.log(`[GenerateDApp] callAIModel → ${PROXY_URL}/v1/messages (model: ${DAPP_MODEL}, max_tokens: ${DAPP_MAX_TOKENS})`)

    try {
      // Build the user content (text or multimodal with image)
      let userContent: any
      if (typeof userMessage === 'string') {
        userContent = userMessage
      } else if (Array.isArray(userMessage)) {
        // Multimodal content array
        userContent = userMessage
      } else {
        userContent = String(userMessage)
      }

      const requestBody = {
        model: DAPP_MODEL,
        max_tokens: DAPP_MAX_TOKENS,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userContent }
        ]
      }

      // Add timeout to prevent hanging indefinitely
      const TIMEOUT_MS = 120_000
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

      let response: Response
      try {
        response = await fetch(`${PROXY_URL}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        })
      } catch (fetchErr: any) {
        clearTimeout(timeoutId)
        if (fetchErr.name === 'AbortError') {
          throw new Error(`DApp generation LLM call timed out after ${TIMEOUT_MS / 1000}s.`)
        }
        throw fetchErr
      } finally {
        clearTimeout(timeoutId)
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[GenerateDApp] Anthropic API error ${response.status}:`, errorText.substring(0, 500))
        throw new Error(`Anthropic API error ${response.status}: ${errorText.substring(0, 200)}`)
      }

      const data = await response.json()

      // Extract text from response content blocks
      let result = ''
      if (data.content && Array.isArray(data.content)) {
        result = data.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('')
      }

      console.log(`[GenerateDApp] Anthropic response: stop_reason=${data.stop_reason}, content_length=${result.length}`)

      if (!result || result.length === 0) {
        throw new Error('Anthropic returned empty response for DApp generation')
      }

      // Safety check: detect corrupted output
      if (/^(undefined|null){5,}/.test(result)) {
        throw new Error('LLM returned corrupted output (repeated undefined/null). Please try again.')
      }

      return result

    } catch (error: any) {
      const msg = error?.message || String(error)
      console.error('[GenerateDApp] callAIModel failed:', msg)
      if (msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch')) {
        throw new Error(`Cannot connect to AI proxy server. Please check network connectivity.`)
      }
      throw new Error(`DApp AI generation failed: ${msg}`)
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
      const retryPrompt = `The following required files were missing from your response: ${missing.join(', ')}. Please generate ONLY these missing files using the START_TITLE format. Do not regenerate files that were already provided.`

      // Direct Anthropic API call (same approach as callAIModel — no plugin.call)
      const retryProxyUrl = endpointUrls.langchain
      const response = await fetch(`${retryProxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 8192,
          temperature: 0.7,
          system: systemPrompt,
          messages: [
            { role: 'user', content: typeof userMessage === 'string' ? userMessage : JSON.stringify(userMessage) },
            { role: 'assistant', content: originalResponse },
            { role: 'user', content: retryPrompt }
          ]
        })
      })

      if (response.ok) {
        const data = await response.json()
        const retryText = (data.content || [])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('')

        const additionalPages = parsePages(retryText)
        if (Object.keys(additionalPages).length > 0) {
          console.log('[GenerateDApp] Retry produced files:', Object.keys(additionalPages).join(', '))
          Object.assign(pages, additionalPages)
        }
      }
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
    // ── CRITICAL: Verify we're in the correct workspace before writing ──
    // During LLM calls (~30s), the workspace can drift due to user actions
    // or other plugin events. Writing to the wrong workspace = data loss.
    const currentWs = await plugin.call('filePanel' as any, 'getCurrentWorkspace')
    if (currentWs?.name !== workspaceName) {
      console.warn(`[QuickDapp] WORKSPACE DRIFT DETECTED! Current: ${currentWs?.name}, Expected: ${workspaceName}. Switching...`)
      await plugin.call('filePanel' as any, 'switchToWorkspace', {
        name: workspaceName,
        isLocalhost: false,
      })
      await new Promise(r => setTimeout(r, 500))

      // Double-check after switch
      const verifyWs = await plugin.call('filePanel' as any, 'getCurrentWorkspace')
      if (verifyWs?.name !== workspaceName) {
        throw new Error(`SAFETY ABORT: Could not switch to workspace ${workspaceName}. Current workspace is ${verifyWs?.name}. Refusing to write files to prevent data loss.`)
      }
      console.log(`[QuickDapp] Workspace corrected to: ${workspaceName}`)
    } else {
      console.log(`[QuickDapp] Workspace verified: ${workspaceName}`)
    }

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
        console.error(`[GenerateDApp] Failed to write file ${normalizedPath}:`, error.message)
      }
    }

    // ── Post-write safety check ──
    const postWriteWs = await plugin.call('filePanel' as any, 'getCurrentWorkspace')
    if (postWriteWs?.name !== workspaceName) {
      console.error(`[QuickDapp] WORKSPACE DRIFTED DURING WRITE! Some files may have been written to ${postWriteWs?.name} instead of ${workspaceName}. This is a critical issue.`)
    }
  }
}

// ──────────────────────────────────────────────
// Update DApp Tool Handler
// ──────────────────────────────────────────────

export class UpdateDAppHandler extends BaseToolHandler {
  name = 'update_dapp'
  description = 'Update an existing DApp. PREREQUISITE: list_dapps must be called first AND the user must have explicitly selected which workspace to update. Never call this directly without user confirmation.'
  inputSchema = {
    type: 'object',
    properties: {
      workspaceName: {
        type: 'string',
        description: 'Target DApp workspace name (e.g. "dapp-storage-abc123"). Get this from list_dapps.'
      },
      description: {
        type: ['string', 'array'],
        description: 'What to change in the DApp (text or multipart with image). This is the user\'s modification request.'
      },
      contractAddress: {
        type: 'string',
        description: '(Optional) Contract address — auto-loaded from workspace config if omitted.'
      },
      contractAbi: {
        type: 'array',
        description: '(Optional) Contract ABI — auto-loaded from workspace config if omitted.',
        items: { type: 'object' }
      },
      chainId: {
        type: ['number', 'string'],
        description: '(Optional) Chain ID — auto-loaded from workspace config if omitted.'
      }
    },
    required: ['workspaceName', 'description']
  }

  getPermissions(): string[] {
    return ['dapp:update', 'file:write']
  }

  validate(args: UpdateDAppArgs): boolean | string {
    if (!args.workspaceName) return 'Missing required argument: workspaceName'
    if (!args.description) return 'Missing required argument: description'
    return true
  }

  /**
   * Auto-resolve contract info from workspace dapp.config.json
   */
  private async resolveContractInfo(plugin: Plugin, workspaceName: string, args: UpdateDAppArgs): Promise<{
    address: string, abi: any[], chainId: string | number
  }> {
    // Use provided args if available (with validation)
    if (args.contractAddress && args.contractAbi && args.chainId) {
      return this.validateContractInfo({
        address: args.contractAddress,
        abi: args.contractAbi,
        chainId: args.chainId
      })
    }

    // Auto-resolve from workspace config
    console.log('[QuickDapp] Auto-resolving contract info from dapp.config.json...')
    try {
      const configContent = await plugin.call('filePanel' as any, 'readFileFromWorkspace', workspaceName, 'dapp.config.json')
      if (configContent) {
        const config = JSON.parse(configContent)
        const resolved = this.validateContractInfo({
          address: args.contractAddress || config.contract?.address,
          abi: args.contractAbi || config.contract?.abi,
          chainId: args.chainId || config.contract?.chainId
        })
        console.log('[QuickDapp] \u2713 Resolved:', { address: resolved.address, chainId: resolved.chainId, abiLength: resolved.abi?.length })
        return resolved
      }
    } catch (e: any) {
      console.warn('[QuickDapp] \u26a0 Failed to read dapp.config.json from', workspaceName, ':', e?.message)
    }

    return this.validateContractInfo({
      address: args.contractAddress,
      abi: args.contractAbi,
      chainId: args.chainId
    })
  }

  /**
   * Validate and sanitize contract info — prevents undefined from leaking into prompts.
   */
  private validateContractInfo(info: { address?: string, abi?: any[], chainId?: string | number }): {
    address: string, abi: any[], chainId: string | number
  } {
    const address = (typeof info.address === 'string' && info.address.startsWith('0x'))
      ? info.address
      : '0x0000000000000000000000000000000000000000'
    const abi = Array.isArray(info.abi) ? info.abi : []
    const chainId = (info.chainId !== undefined && info.chainId !== null && String(info.chainId) !== 'undefined')
      ? info.chainId
      : 'vm-osaka'
    return { address, abi, chainId }
  }

  /**
   * [QuickDapp] Read DApp source files from workspace recursively.
   * Only includes index.html and src/** files.
   * Skips metadata (.deploys, .states, dapp.config.json), binary, and hidden files.
   */
  // Directories to completely skip — these contain QuickDapp metadata, not source code
  private static readonly SKIP_DIRS = new Set(['.deploys', '.states', '.git', 'node_modules', '.well-known'])
  // Files to skip at root level
  private static readonly SKIP_FILES = new Set(['dapp.config.json', 'preview.png'])

  private async readWorkspaceFiles(plugin: Plugin, currentPath: string, files: Record<string, string>): Promise<void> {
    try {
      const dirContents = await plugin.call('fileManager' as any, 'readdir', currentPath)
      for (const [filePath, fileData] of Object.entries(dirContents as Record<string, any>)) {
        // Normalize path for checks
        const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath
        const topSegment = normalizedPath.split('/')[0]

        // Skip metadata directories entirely
        if (fileData.isDirectory) {
          if (UpdateDAppHandler.SKIP_DIRS.has(topSegment)) {
            continue
          }
          await this.readWorkspaceFiles(plugin, filePath, files)
        } else {
          // Skip metadata files
          if (UpdateDAppHandler.SKIP_FILES.has(normalizedPath)) continue
          // Skip binary files
          if (/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|mp4|webm|mp3|zip|tar|gz|wasm)$/i.test(filePath)) continue
          // Only include source files (index.html + src/**)
          const isSourceFile = normalizedPath === 'index.html' ||
            normalizedPath.startsWith('src/') ||
            filePath === '/index.html' ||
            filePath.startsWith('/src/')
          if (!isSourceFile) continue

          try {
            const content = await plugin.call('fileManager' as any, 'readFile', filePath)
            // Safety: skip if content is undefined, null, or not a string
            if (content === undefined || content === null || typeof content !== 'string') {
              console.warn(`[QuickDapp] Skipping file with invalid content: ${filePath} (type: ${typeof content})`)
              continue
            }
            let virtualPath = filePath
            if (!virtualPath.startsWith('/')) virtualPath = '/' + virtualPath
            files[virtualPath] = content
          } catch (e) {
            console.warn(`[QuickDapp] Skipping unreadable file: ${filePath}`)
          }
        }
      }
    } catch (e) {
      console.error(`[QuickDapp] readWorkspaceFiles error at ${currentPath}:`, e)
    }
  }

  async execute(args: UpdateDAppArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      console.log('[QuickDapp] UpdateDAppHandler.execute() START', {
        address: args.contractAddress,
        workspace: args.workspaceName,
        descriptionType: typeof args.description,
        descriptionLength: typeof args.description === 'string' ? args.description.length : Array.isArray(args.description) ? args.description.length : 0
      })
      const hasImage = args.hasImage || (Array.isArray(args.description) && args.description.some((p: any) => p.type === 'image_url'))
      const targetWorkspace = args.workspaceName

      if (!targetWorkspace) {
        console.error('[QuickDapp] workspaceName is missing!')
        return this.createErrorResult('workspaceName is required for update_dapp. Use list_dapps first to get the workspace name.')
      }

      // Switch to target workspace
      try {
        const currentWs = await plugin.call('filePanel' as any, 'getCurrentWorkspace')
        console.log('[QuickDapp] Current workspace:', currentWs?.name)
        if (currentWs?.name !== targetWorkspace) {
          console.log(`[QuickDapp] Switching to workspace: ${targetWorkspace}`)
          await plugin.call('filePanel' as any, 'switchToWorkspace', {
            name: targetWorkspace,
            isLocalhost: false,
          })
          await new Promise(r => setTimeout(r, 500))
        } else {
        }
      } catch (e: any) {
        console.error('[QuickDapp] Failed to switch workspace:', e?.message)
        return this.createErrorResult(`Failed to switch to workspace ${targetWorkspace}: ${e.message}`)
      }

      // Read current files
      let currentFiles = args.currentFiles || {}
      if (Object.keys(currentFiles).length === 0) {
        console.log('[QuickDapp] Reading workspace files...')
        await this.readWorkspaceFiles(plugin, '/', currentFiles)
        console.log(`[QuickDapp] Read ${Object.keys(currentFiles).length} files from workspace`)
      }

      if (Object.keys(currentFiles).length === 0) {
        return this.createErrorResult('No files found in workspace. Please ensure the DApp workspace is active.')
      }

      // Backup original files before writing updates (for revert)
      const backupFiles: Record<string, string> = { ...currentFiles }

      // Auto-resolve contract info from config
      const contractResolved = await this.resolveContractInfo(plugin, targetWorkspace, args)

      // Build prompt and call LLM
      const contractInfo: DAppContractInfo = {
        address: contractResolved.address,
        abi: contractResolved.abi,
        chainId: contractResolved.chainId
      }

      const ctx: DAppPromptContext = {
        contract: contractInfo,
        isUpdate: true,
        hasImage,
        // Use resolved chainId (never undefined) instead of raw args.chainId
        isLocalVM: isLocalVMChainId(contractResolved.chainId)
      }

      const systemPrompt = buildDAppSystemPrompt(ctx)
      const msgOptions: DAppUserMessageOptions = {
        description: args.description,
        currentFiles
      }
      const userMessage = buildDAppUserMessage(ctx, msgOptions)

      // Mark DApp as updating
      console.log('[QuickDapp] Setting status=updating for', targetWorkspace)
      try {
        // Update config on disk
        const configContent = await plugin.call('fileManager' as any, 'readFile', 'dapp.config.json')
        if (configContent) {
          const config = JSON.parse(configContent)
          config.status = 'updating'
          config.processingStartedAt = Date.now()
          await plugin.call('fileManager' as any, 'writeFile', 'dapp.config.json', JSON.stringify(config, null, 2))
          console.log('[QuickDapp] Config set to updating')
        }
      } catch (e: any) {
        console.warn('[QuickDapp] Config update failed (non-critical):', e?.message)
      }
      // Emit dappUpdateStart so React UI shows processing indicator
      plugin.emit('dappUpdateStart', { slug: targetWorkspace })

      plugin.emit('generationProgress', { status: 'preparing', contractAddress: contractResolved.address, slug: targetWorkspace })
      plugin.emit('generationProgress', { status: 'calling_llm', contractAddress: contractResolved.address, slug: targetWorkspace })

      const response = await this.callAIModelDirect(systemPrompt, userMessage, hasImage)
      console.log('[QuickDapp] LLM response received, length:', response?.length || 0)

      // Parse and write files
      plugin.emit('generationProgress', { status: 'parsing', contractAddress: contractResolved.address, slug: targetWorkspace })
      const patchedPages = parsePages(response)
      console.log('[QuickDapp] Parsed', Object.keys(patchedPages).length, 'files from update response')

      if (Object.keys(patchedPages).length === 0) {
        console.warn('[QuickDapp] No files parsed from update response')
        return this.createErrorResult('LLM returned no parseable files for update. The response may have been truncated or malformed.')
      }

      // Verify we're still on the right workspace before writing
      const wsCheck = await plugin.call('filePanel' as any, 'getCurrentWorkspace')
      if (wsCheck?.name !== targetWorkspace) {
        console.log(`[QuickDapp] Workspace drifted to ${wsCheck?.name}, switching back to ${targetWorkspace}`)
        await plugin.call('filePanel' as any, 'switchToWorkspace', {
          name: targetWorkspace,
          isLocalhost: false,
        })
        await new Promise(r => setTimeout(r, 300))
      }

      plugin.emit('generationProgress', { status: 'validating', contractAddress: contractResolved.address, slug: targetWorkspace })
      const writtenFiles: string[] = []
      for (const [filename, content] of Object.entries(patchedPages)) {
        const normalizedPath = filename.startsWith('/') ? filename : `/${filename}`
        try {
          const dirPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'))
          if (dirPath && dirPath !== '/') {
            try {
              await plugin.call('fileManager' as any, 'mkdir', dirPath)
            } catch (e) { /* directory may exist */ }
          }
          await plugin.call('fileManager' as any, 'writeFile', normalizedPath, content)
          writtenFiles.push(normalizedPath)
          console.log(`[QuickDapp] Updated file: ${normalizedPath}`)
        } catch (error: any) {
          console.error(`[QuickDapp] Failed to write file ${normalizedPath}:`, error.message)
        }
      }
      console.log(`[QuickDapp] Wrote ${writtenFiles.length}/${Object.keys(patchedPages).length} files to ${targetWorkspace}`)

      // Emit completion event
      const result: DAppGenerationResult = {
        success: true,
        files: patchedPages,
        fileCount: Object.keys(patchedPages).length,
        contractAddress: contractResolved.address,
        message: `Updated ${writtenFiles.length} DApp files in workspace ${targetWorkspace}`
      }

      console.log('[QuickDapp] Emitting dappGenerated for update (plugin:', (plugin as any).name, ', slug:', targetWorkspace, ')')
      plugin.emit('dappGenerated', {
        address: contractResolved.address,
        slug: targetWorkspace,
        content: patchedPages,
        isUpdate: true
      })

      // Emit review event for chat UI
      // Only include backup entries for files that were actually changed
      const reviewBackups: Record<string, string> = {}
      for (const filename of Object.keys(patchedPages)) {
        const normalizedKey = filename.startsWith('/') ? filename : '/' + filename
        // Check both with and without leading slash
        if (backupFiles[normalizedKey] !== undefined) {
          reviewBackups[normalizedKey] = backupFiles[normalizedKey]
        } else if (backupFiles[filename] !== undefined) {
          reviewBackups[filename] = backupFiles[filename]
        } else {
          // New file (no backup) — store empty string so revert can delete it
          reviewBackups[normalizedKey] = ''
        }
      }
      plugin.emit('onDappUpdateCompleted', {
        slug: targetWorkspace,
        files: patchedPages,
        backups: reviewBackups,
        writtenFiles,
        contractAddress: contractResolved.address
      })

      console.log('[QuickDapp] UpdateDAppHandler.execute() DONE —', writtenFiles.length, 'files written to', targetWorkspace)
      return this.createSuccessResult(result)

    } catch (error: any) {
      console.error('[QuickDapp] UpdateDAppHandler FAILED:', error)
      plugin.emit('dappGenerationError', {
        address: args.contractAddress || args.workspaceName,
        error: error.message
      })
      return this.createErrorResult(`DApp update failed: ${error.message}`)
    }
  }

  /**
   * Direct LLM call for update — avoids re-entrant plugin deadlock.
   * Same pattern as GenerateDAppHandler.callAIModel().
   */
  private async callAIModelDirect(
    systemPrompt: string,
    userMessage: string | any[],
    hasImage: boolean
  ): Promise<string> {
    const PROXY_URL = endpointUrls.langchain
    const DAPP_MODEL = 'claude-sonnet-4-5'
    const DAPP_MAX_TOKENS = 16384
    const TIMEOUT_MS = 120_000 // 2 minute timeout

    // Sanitize userContent — prevent undefined from propagating
    let userContent: string | any[]
    if (typeof userMessage === 'string') {
      userContent = userMessage || 'Update the DApp as requested.'
    } else if (Array.isArray(userMessage)) {
      userContent = userMessage.filter(part => part !== null && part !== undefined)
      if (userContent.length === 0) {
        throw new Error('User message is empty after sanitization')
      }
    } else {
      userContent = String(userMessage || 'Update the DApp as requested.')
    }

    const requestBody = {
      model: DAPP_MODEL,
      max_tokens: DAPP_MAX_TOKENS,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    }

    // Add timeout to prevent hanging indefinitely
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(`${PROXY_URL}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })
    } catch (fetchErr: any) {
      clearTimeout(timeoutId)
      if (fetchErr.name === 'AbortError') {
        throw new Error(`DApp update LLM call timed out after ${TIMEOUT_MS / 1000}s. The proxy server may be down or the request was too large.`)
      }
      throw new Error(`DApp update LLM call failed: ${fetchErr.message}. Is the proxy server running at ${PROXY_URL}?`)
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error body')
      throw new Error(`Anthropic API error ${response.status}: ${errorText.substring(0, 200)}`)
    }

    let data: any
    try {
      data = await response.json()
    } catch (jsonErr) {
      throw new Error('Failed to parse LLM response as JSON — response may be corrupted')
    }

    let result = ''
    if (data.content && Array.isArray(data.content)) {
      result = data.content
        .filter((block: any) => block.type === 'text' && typeof block.text === 'string')
        .map((block: any) => block.text)
        .join('')
    }

    if (!result || result.length === 0) {
      throw new Error('Anthropic returned empty response for DApp update')
    }

    // Safety check: detect obviously corrupted output (e.g. "undefinedundefined...")
    if (/^(undefined|null){5,}/.test(result) || result.length < 50) {
      console.error('[QuickDapp] LLM returned suspicious output:', result.substring(0, 100))
      throw new Error('LLM returned corrupted output (repeated undefined/null). Please try again.')
    }

    return result
  }
}

// ──────────────────────────────────────────────
// List DApps Tool Handler
// ──────────────────────────────────────────────

export class ListDAppsHandler extends BaseToolHandler {
  name = 'list_dapps'
  description = 'List all existing DApp workspaces with their contract info, status, and workspace names. Use this FIRST when a user asks about their DApps, wants to update a DApp, or needs to see what DApps they have.'
  inputSchema = {
    type: 'object',
    properties: {},
    required: []
  }

  getPermissions(): string[] {
    return ['dapp:read']
  }

  async execute(_args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      console.log('[QuickDapp] ListDAppsHandler.execute() — scanning workspaces directly via filePanel')

      // Use filePanel directly to avoid auto-activating quick-dapp-v2 plugin
      // (plugin.call to an inactive plugin auto-activates it, which opens its UI tab)
      let allWorkspaces: any[]
      try {
        allWorkspaces = await plugin.call('filePanel' as any, 'getWorkspacesForPlugin')
        console.log('[QuickDapp] Total workspaces:', allWorkspaces?.length || 0)
      } catch (e: any) {
        console.error('[QuickDapp] Failed to get workspaces:', e?.message)
        return this.createErrorResult(`Failed to list workspaces: ${e.message}`)
      }

      if (!allWorkspaces || !Array.isArray(allWorkspaces)) {
        return this.createSuccessResult({
          success: true, dapps: [], count: 0,
          message: 'No workspaces found.'
        })
      }

      const dappWorkspaces = allWorkspaces
        .map((ws: any) => typeof ws === 'string' ? ws : ws.name)
        .filter((name: string) => name && name.startsWith('dapp-'))

      console.log('[QuickDapp] Found', dappWorkspaces.length, 'dapp-* workspaces')

      const dapps: any[] = []
      for (const wsName of dappWorkspaces) {
        try {
          const hasConfig = await plugin.call('filePanel' as any, 'existsInWorkspace', wsName, 'dapp.config.json')
          if (!hasConfig) continue

          const content = await plugin.call('filePanel' as any, 'readFileFromWorkspace', wsName, 'dapp.config.json')
          if (!content) continue

          const config = JSON.parse(content)
          dapps.push({
            slug: wsName,
            workspaceName: wsName,
            name: config.name || 'Untitled',
            contractAddress: config.contract?.address || 'unknown',
            contractName: config.contract?.name || 'unknown',
            chainId: config.contract?.chainId || 'unknown',
            networkName: config.contract?.networkName || '',
            status: config.status || 'unknown',
            createdAt: config.createdAt || 0
          })
        } catch (e) {
          console.warn('[QuickDapp] Failed to read config for', wsName)
        }
      }

      dapps.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      console.log('[QuickDapp] list_dapps returned', dapps.length, 'dapps')

      if (dapps.length === 0) {
        return this.createSuccessResult({
          success: true,
          dapps: [],
          count: 0,
          message: 'No DApp workspaces found. The user has not created any DApps yet. To create one, they need to compile and deploy a smart contract first, then use the generate_dapp tool.'
        })
      }

      return this.createSuccessResult({
        success: true,
        dapps,
        count: dapps.length,
        message: `Found ${dapps.length} DApp(s). Present this list to the user and ask which one they want to work with. Include the DApp name, contract name, contract address, and status for each.`
      })
    } catch (error: any) {
      console.error('[QuickDapp] list_dapps failed:', error)
      return this.createErrorResult(`Failed to list DApps: ${error.message}`)
    }
  }
}

// ──────────────────────────────────────────────
// Tool Definition Factory
// ──────────────────────────────────────────────

export function createDAppGeneratorTools(): RemixToolDefinition[] {
  return [
    {
      name: 'list_dapps',
      description: 'List all existing DApp workspaces. MANDATORY: You MUST call this tool BEFORE update_dapp. Present the results as a numbered list to the user and ask them to select which DApp to update. Never skip this step.',
      inputSchema: new ListDAppsHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:read'],
      handler: new ListDAppsHandler()
    },
    {
      name: 'generate_dapp',
      description: 'Generate a new DApp frontend from a description and smart contract ABI. Creates a multi-file React application with ethers.js integration.',
      inputSchema: new GenerateDAppHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:generate', 'file:write'],
      handler: new GenerateDAppHandler()
    },
    {
      name: 'update_dapp',
      description: 'Update an existing DApp. PREREQUISITE: You MUST have already called list_dapps AND received the user\'s explicit workspace selection before calling this tool. Never call update_dapp directly without user confirmation of which workspace to update. Requires workspaceName (from list_dapps) and description (the modification request).',
      inputSchema: new UpdateDAppHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:update', 'file:write'],
      handler: new UpdateDAppHandler()
    }
  ]
}
