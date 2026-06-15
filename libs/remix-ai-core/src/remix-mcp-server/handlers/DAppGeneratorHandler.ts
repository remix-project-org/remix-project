import { remixAILogger } from '../../helpers/logger'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import { DeployedContract } from '@remix-ui/run-tab-deployed-contracts'
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
import { DappOperations } from '@remix-ui/helper'

const isLocalVMChainId = (chainId: number | string): boolean => {
  const n = Number(chainId)
  return Number.isNaN(n) || n === 0 || n === 1337 || n === 31337 || n === 5777
}

// Common build rules injected into every QuickDapp delegation message
const QUICKDAPP_BUILD_RULES =
  `IMPORT RULES (CRITICAL - violations crash the build):\n` +
  `- Use BARE SPECIFIERS: import React from 'react'; import { ethers } from 'ethers'. The index.html import map resolves these.\n` +
  `- NEVER use full URLs in imports (e.g. import React from 'https://esm.sh/react@18'). This crashes the bundler.\n` +
  `- ALWAYS include .jsx extension in local imports: import App from './App.jsx' (not './App')\n` +
  `- NEVER repeat src/ in relative paths inside src/: import App from './App.jsx' NOT './src/App.jsx'\n` +
  `- EVERY .jsx file using JSX MUST import React from 'react' at the top.\n` +
  `- EVERY file using ethers MUST have its own import { ethers } from 'ethers' at the top.\n` +
  `- Do NOT use react-router-dom. Use hash-based routing: useState(window.location.hash).\n\n` +
  `FILE STRUCTURE (minimum required):\n` +
  `- index.html: import map (react, react-dom/client, ethers via esm.sh), Tailwind CDN, window.__QUICK_DAPP_CONFIG__ init, <script type="module" src="./src/main.jsx">\n` +
  `- src/main.jsx: React entry with ReactDOM.createRoot\n` +
  `- src/App.jsx: Main component with contract integration\n` +
  `- src/index.css: Custom styles\n\n` +
  `INDEX.HTML IMPORT MAP (must include):\n` +
  `<script type="importmap">{ "imports": { "react": "https://esm.sh/react@18.2.0", "react-dom/client": "https://esm.sh/react-dom@18.2.0/client", "ethers": "https://esm.sh/ethers@6.11.1" } }</script>\n\n` +
  `ETHERS.JS RULES:\n` +
  `- MUST use ethers.BrowserProvider with wallet provider for both reading and writing.\n` +
  `- NEVER use JsonRpcProvider, InfuraProvider, AlchemyProvider, or any RPC URL.\n` +
  `- NEVER generate placeholders like 'YOUR_INFURA_KEY'.\n` +
  `- Write functions need a signer: const signer = await provider.getSigner(); const contract = new ethers.Contract(addr, abi, signer);\n\n` +
  `DYNAMIC CONTENT:\n` +
  `- Use window.__QUICK_DAPP_CONFIG__ for title/logo/details. Do NOT hardcode app names or logos.\n` +
  `- Fallback: config.title || 'My DApp'\n`

// Design rules are intentionally lower priority than build/runtime correctness.
const QUICKDAPP_DESIGN_RULES =
  `DESIGN QUALITY RULES (LOWER PRIORITY THAN BUILD/WALLET/CONTRACT CORRECTNESS):\n` +
  `- These design rules must NEVER override valid imports, file paths, React entry structure, ethers.js provider logic, contract ABI integration, transaction feedback, preview compatibility, or window.__QUICK_DAPP_CONFIG__ usage.\n` +
  `- Explicit user design requirements are higher priority than these diversity rules. If the user asks for a specific style, language, layout, or tone, follow that request.\n` +
  `- Do not use your first/default design idea. Before writing code, silently imagine 3 distinct visual directions that fit this contract, ABI, and user request.\n` +
  `- Discard the most obvious/default direction, then choose one of the remaining directions and develop it to polished production quality.\n` +
  `- The result should be modern, cohesive, and memorable, but still easy to use for smart contract interactions.\n` +
  `- Avoid generic AI UI patterns: purple/blue gradient SaaS defaults, centered hero plus three cards, generic glassmorphism dashboards, identical card grids for every function, and vague marketing landing pages before the actual DApp.\n` +
  `- Make the chosen direction visible through layout, typography, spacing, color system, component shape, empty states, hover/focus states, loading states, and transaction feedback.\n` +
  `- Vary the visual direction across DApps: refined minimal, dense dashboard, editorial, playful, collectible, protocol-console, utility/admin, or other contract-appropriate approaches.\n` +
  `- If a bold visual idea would reduce readability or make wallet/transaction controls harder to operate, choose a simpler design that preserves functionality.\n`

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface GenerateDAppArgs {
  description: string
  contractAddress: string
  contractAbi: any[] | null
  chainId: number | string
  contractName: string
  imageBase64?: string
  isBaseMiniApp?: boolean
  figmaUrl?: string
  figmaToken?: string
  workspaceName?: string
  frontendMode?: 'workspace' | 'inline'
  confirmOverwrite?: boolean
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
  description = 'Create a new DApp frontend from a deployed smart contract. When the user provides contract details (contractName, contractAddress, chainId, contractAbi) and says "use defaults" or "without asking questions", call this tool DIRECTLY with description="Modern dark mode single-page DApp using React and Ethers.js". Only ask design preference questions if the user explicitly requests customization or does not provide "use defaults".'
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
        description: 'Contract ABI (Application Binary Interface). OPTIONAL: only provide it if the user explicitly included it in their prompt.',
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
      },
      frontendMode: {
        type: 'string',
        description: 'Where to create the DApp: "workspace" (new workspace, default) or "inline" (./frontend in current workspace)',
        enum: ['workspace', 'inline'],
        default: 'workspace'
      },
      confirmOverwrite: {
        type: 'boolean',
        description: 'Set to true to confirm overwriting existing /frontend folder (only needed if frontendMode is "inline" and folder exists)',
        default: false
      }
    },
    required: ['description', 'contractName', 'contractAddress', 'chainId']
  }

  getPermissions(): string[] {
    return ['dapp:generate', 'file:write']
  }

  validate(args: GenerateDAppArgs): boolean | string {
    const required = this.validateRequired(args, ['description', 'contractAddress', 'chainId', 'contractName'])
    if (required !== true) return required

    if (!args.contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format'
    }
    if (args.contractAbi) {
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
    }

    if (args.figmaUrl && !args.figmaToken) {
      return 'Figma token is required when using a Figma URL'
    }

    return true
  }

  async execute(args: GenerateDAppArgs, plugin: Plugin): Promise<IMCPToolResult> {
    let dappOps: DappOperations | undefined
    try {
      remixAILogger.log('[GenerateDApp] Received args:', args)
      const targetMode = args.frontendMode || 'workspace'

      // ── ABI Resolution ──
      if (!args.contractAbi) {
        // try to get the abi
        const data = (await plugin.call('compilerArtefacts', 'get', args.contractAddress) as CompilerAbstract)
        args.contractAbi = data?.getContract(args.contractName)?.object?.abi || null
        if (!args.contractAbi) {
          const data = (await plugin.call('udappDeployedContracts', 'getDeployedContracts') as DeployedContract)
          if (Array.isArray(data) && data.length > 0) {
            const contract = data.find((contract) => contract.address.toLowerCase() === args.contractAddress.toLowerCase())
            args.contractAbi = contract?.abi || null
          }
        }
        if (!args.contractAbi) {
          remixAILogger.error('[QuickDapp] createDappWorkspace failed:', `ABI not found for contract at ${args.contractAddress}`)
          return this.createErrorResult(`Failed to create DApp, ABI not found for contract at ${args.contractAddress}. Please provide the ABI directly or ensure it is available in the compiler artifacts or deployed contracts.`)
        }
      }

      // ── Workspace Setup ──
      if (targetMode === 'inline') {
        const currentWs = await plugin.call('filePanel', 'getCurrentWorkspace')
        if (!currentWs?.name) {
          throw new Error('Could not get current workspace for inline mode')
        }

        dappOps = new DappOperations('inline', currentWs.name, plugin, args.contractName)
        remixAILogger.log('[QuickDapp] Using inline mode in workspace:', currentWs.name)

        // Check if frontend folder exists and has files
        try {
          const folderPath = dappOps.getSourceRoot().substring(1) // Remove leading slash (e.g., 'frontend')
          const files = await plugin.call('fileManager', 'readdir', folderPath)
          const fileCount = files ? Object.keys(files).length : 0

          if (fileCount > 0 && !args.confirmOverwrite) {
            remixAILogger.log(`[QuickDapp] /frontend folder exists with ${fileCount} files, requesting user confirmation`)
            return this.createErrorResult(
              `⚠️ **OVERWRITE WARNING - USER CONFIRMATION REQUIRED**\n\n` +
              `The /frontend folder in workspace "${currentWs.name}" already exists and contains ${fileCount} file(s).\n\n` +
              `**These files will be PERMANENTLY DELETED and replaced with the new DApp.**\n\n` +
              `ASK THE USER which option they prefer:\n\n` +
              `**Option 1: Overwrite existing files**\n` +
              `- Call generate_dapp again with the SAME parameters PLUS confirmOverwrite=true\n\n` +
              `**Option 2: Create in new workspace (RECOMMENDED - safer)**\n` +
              `- Call generate_dapp again with the SAME parameters BUT change frontendMode="workspace"\n` +
              `- This creates a separate workspace and keeps existing /frontend files intact\n\n` +
              `**Option 3: Cancel**\n` +
              `- Do not proceed with DApp generation\n\n` +
              `⚠️ DO NOT PROCEED without user confirmation. Ask the user which option they want.`
            )
          }
          if (fileCount > 0) {
            remixAILogger.log('[QuickDapp] User confirmed overwrite of', fileCount, 'files in /frontend')
          }
        } catch (checkErr: any) {
          // If readdir fails, the folder likely doesn't exist - this is OK, we can proceed
          const errorMsg = checkErr?.message || String(checkErr)
          if (errorMsg.includes('not exist') || errorMsg.includes('ENOENT') || errorMsg.includes('no such file')) {
            remixAILogger.log('[QuickDapp] /frontend folder does not exist, proceeding with creation')
          } else {
            remixAILogger.warn('[QuickDapp] Could not check /frontend folder:', errorMsg)
          }
        }
      } else {
        // Workspace mode: create new workspace
        try {
          const wsResult = await plugin.call('quick-dapp-v2' as any, 'createDappWorkspace', {
            contractName: args.contractName,
            address: args.contractAddress,
            abi: args.contractAbi,
            chainId: args.chainId,
            isBaseMiniApp: args.isBaseMiniApp
          })
          dappOps = new DappOperations('workspace', wsResult.workspaceName, plugin, args.contractName)
          remixAILogger.log('[QuickDapp] Created new workspace:', wsResult.workspaceName)
        } catch (wsErr: any) {
          remixAILogger.error('[QuickDapp] createDappWorkspace failed:', wsErr?.message || wsErr)
          return this.createErrorResult(`Failed to create DApp workspace: ${wsErr.message}`)
        }
      }

      // Open dashboard so React UI is mounted and event listeners are ready
      try {
        remixAILogger.log('[QuickDapp] Opening dashboard...')
        await plugin.call('manager' as any, 'activatePlugin', 'quick-dapp-v2')
        await plugin.call('tabs' as any, 'focus', 'quick-dapp-v2')
        await new Promise(r => setTimeout(r, 300))
        remixAILogger.log('[QuickDapp] Dashboard opened')
      } catch (e: any) {
        remixAILogger.warn('[QuickDapp] Dashboard focus failed (non-critical):', e?.message)
      }

      if (targetMode === 'inline') {
        try {
          const configPath = 'dapp.config.json'
          remixAILogger.log(`[QuickDapp] Creating DApp config at ${configPath}`)
          let networkName = 'Unknown Network'
          try {
            const network = await plugin.call('udappEnv', 'getNetwork')
            networkName = network?.name || 'Unknown Network'
          } catch (e) {
            remixAILogger.warn('[QuickDapp] Could not get network name:', e)
          }

          const timestamp = Date.now()

          const dappConfig = {
            _warning: 'DO NOT EDIT THIS FILE MANUALLY. MANAGED BY QUICK DAPP.',
            slug: dappOps.getSlug(),
            name: args.contractName,
            workspaceName: dappOps.getWorkspaceName(),
            mode: 'inline',
            contract: {
              name: args.contractName,
              address: args.contractAddress,
              abi: args.contractAbi,
              chainId: args.chainId,
              networkName
            },
            config: {
              title: args.contractName,
              description: args.description || `DApp for ${args.contractName}`,
              template: 'custom'
            },
            status: 'creating',
            createdAt: timestamp,
            updatedAt: timestamp,
            processingStartedAt: timestamp
          }
          await dappOps.ensureBaseDir()
          await plugin.call('fileManager', 'writeFile', configPath, JSON.stringify(dappConfig, null, 2))
          remixAILogger.log(`[QuickDapp] DApp config created at ${configPath}`)
        } catch (configErr) {
          remixAILogger.warn('[QuickDapp] Config creation failed (non-critical):', configErr)
        }
      }

      // Notify React UI that a new DApp is being created (sets processing spinner on card)
      plugin.emit('generationProgress', { status: 'preparing', contractAddress: args.contractAddress, workspaceName: dappOps.getWorkspaceName(), slug: dappOps.getSlug() })

      // Return concise context to the agent for file generation.
      // Do NOT include the full system prompt or file dumps — they cause tool result overflow.
      // The agent/subagent already knows DApp frontend patterns.

      // Extract contract ABI summary for concise context
      const abiSummary = args.contractAbi
        .filter((item: any) => item.type === 'function')
        .map((item: any) => `${item.name}(${(item.inputs || []).map((i: any) => `${i.type} ${i.name}`).join(', ')}) → ${(item.outputs || []).map((o: any) => o.type).join(', ') || 'void'} [${item.stateMutability}]`)
        .join('\n')

      const isLocalVM = isLocalVMChainId(args.chainId)
      // Build optional Figma context line for subagent
      const figmaLine = (args.figmaUrl && args.figmaToken)
        ? `\nFIGMA: Use fetch_figma_design tool with figmaUrl="${args.figmaUrl}" and figmaToken="${args.figmaToken}" to get the design data before generating files.\n`
        : ''

      const isInlineMode = dappOps.isInline()
      const examplePaths = isInlineMode
        ? '/frontend/index.html, /frontend/src/App.jsx'
        : '/index.html, /src/App.jsx'
      const correctPathExample = isInlineMode
        ? 'Correct: /frontend/src/App.jsx'
        : 'Correct: /src/App.jsx'
      const fileWriteExamples = isInlineMode
        ? '/frontend/index.html, /frontend/src/main.jsx, /frontend/src/App.jsx, /frontend/src/index.css'
        : '/index.html, /src/main.jsx, /src/App.jsx, /src/index.css'

      return this.createSuccessResult({
        success: true,
        workspaceName: dappOps.getWorkspaceName(),
        contractAddress: args.contractAddress,
        contractName: args.contractName,
        isInlineMode,
        workspaceReady: true,
        message: `DApp workspace "${dappOps.getWorkspaceName()}" created successfully.\n\n` +
          `Now proceed to generate the DApp files directly using write_file.\n\n` +
          `---\n` +
          `TASK: Generate a new DApp frontend${isInlineMode ? ' in /frontend folder (inline mode)' : ''}\n` +
          `CONTRACT: ${args.contractName} at ${args.contractAddress} on chain ${args.chainId}${isLocalVM ? ' (Remix VM)' : ''}\n` +
          `FUNCTIONS:\n${abiSummary}\n\n` +
          `USER DESIGN REQUEST: ${typeof args.description === 'string' ? args.description : JSON.stringify(args.description)}\n` +
          (args.isBaseMiniApp
            ? `\nBASE APP RULES:\n` +
            `- Do NOT import @farcaster/miniapp-sdk (deprecated). Do NOT include fc:frame or fc:miniapp meta tags.\n` +
            `- Use standard wallet pattern (window.__qdapp_getProvider or window.ethereum).\n` +
            `- Default to Base Mainnet (8453) or Base Sepolia (84532).\n`
            : '') +
          `${figmaLine}` +
          (args.figmaUrl
            ? `\nFIGMA DESIGN RULES:\n` +
            `- Use max-w-7xl mx-auto px-4 instead of fixed widths. Use flex-wrap for mobile responsiveness.\n` +
            `- Avoid position: absolute. Create separate component files for distinct sections.\n` +
            `- Adapt Figma dimensions to fluid/responsive code.\n`
            : '') +
          `\n${QUICKDAPP_BUILD_RULES}\n` +
          `\n${QUICKDAPP_DESIGN_RULES}\n` +
          `CRITICAL PATH RULES:\n` +
          `- All file paths are relative to workspace root. Use ${examplePaths} etc.\n` +
          `- NEVER include workspace name "${dappOps.getWorkspaceName()}" in paths. ${correctPathExample}\n\n` +
          `STEPS:\n` +
          `1. Write files using write_file: ${fileWriteExamples}\n` +
          `2. Use ethers.js v6 (BrowserProvider, Contract). Embed full ABI and contract address in code.\n` +
          `3. NEVER create or modify dapp.config.json — it is managed by the system.\n` +
          (isLocalVM
            ? `\nREMIX VM RULES (LOCAL DEV MODE - CRITICAL):\n` +
            `- Use window.ethereum directly: new ethers.BrowserProvider(window.ethereum). The Remix IDE preview provides it automatically.\n` +
            `- Do NOT use window.__qdapp_getProvider(). Do NOT call wallet_switchEthereumChain or wallet_addEthereumChain.\n` +
            `- Do NOT show "Install MetaMask", "Wrong Network" warnings, or chain ID checks. The provider is always available and on the correct network.\n` +
            `- Simply connect: const provider = new ethers.BrowserProvider(window.ethereum); await provider.send("eth_requestAccounts", []); const signer = await provider.getSigner();\n` +
            `- MUST listen for window.ethereum accountsChanged and immediately update the visible connected account, signer, and contract instance when Deploy & Run account changes. Do not require a preview refresh.\n`
            : `\nREAL NETWORK WALLET RULES (CRITICAL - use EXACT values below):\n` +
            `- The contract is deployed on chain ${args.chainId}. Set TARGET_CHAIN_ID = ${args.chainId} in the generated code.\n` +
            `- For wallet_switchEthereumChain, use chainId: '0x${Number(args.chainId).toString(16)}'. Do NOT use '0x1' or any other chain.\n` +
            `- Use window.__qdapp_getProvider ? await window.__qdapp_getProvider() : window.ethereum for wallet discovery (EIP-6963).\n` +
            `- Store raw provider in a React ref for reuse in network switching.\n` +
            `- Show Connect Wallet / Disconnect / Switch Network buttons. Compare chain IDs as decimal numbers (not hex).\n`) +
          `4. After ALL files written, call finalize_dapp_generation with workspaceName="${dappOps.getWorkspaceName()}" and contractAddress="${args.contractAddress}"\n` +
          `---`
      })

    } catch (error: any) {
      remixAILogger.error('[GenerateDApp] Generation failed:', error)
      plugin.emit('dappGenerationError', {
        workspaceName: dappOps?.getWorkspaceName(),
        error: error.message
      })
      return this.createErrorResult(
        `DApp generation failed: ${error.message}\n\n` +
        `Tell the user the error and suggest they try again.`
      )
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
  private async resolveContractInfo(dappOps: DappOperations, args: UpdateDAppArgs): Promise<{
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
    remixAILogger.log('[QuickDapp] Auto-resolving contract info from config...')
    try {
      const config = await dappOps.readConfig()
      const resolved = this.validateContractInfo({
        address: args.contractAddress || config.contract?.address,
        abi: args.contractAbi || config.contract?.abi,
        chainId: args.chainId || config.contract?.chainId
      })
      remixAILogger.log('[QuickDapp] \u2713 Resolved:', { address: resolved.address, chainId: resolved.chainId, abiLength: resolved.abi?.length })
      return resolved
    } catch (e: any) {
      remixAILogger.warn('[QuickDapp] \u26a0 Failed to read config:', e?.message)
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
              remixAILogger.warn(`[QuickDapp] Skipping file with invalid content: ${filePath} (type: ${typeof content})`)
              continue
            }
            let virtualPath = filePath
            if (!virtualPath.startsWith('/')) virtualPath = '/' + virtualPath
            files[virtualPath] = content
          } catch (e) {
            remixAILogger.warn(`[QuickDapp] Skipping unreadable file: ${filePath}`)
          }
        }
      }
    } catch (e) {
      remixAILogger.error(`[QuickDapp] readWorkspaceFiles error at ${currentPath}:`, e)
    }
  }

  async execute(args: UpdateDAppArgs, plugin: Plugin): Promise<IMCPToolResult> {
    let dappOps: DappOperations | undefined
    try {
      remixAILogger.log('[QuickDapp] UpdateDAppHandler.execute() START', {
        address: args.contractAddress,
        workspace: args.workspaceName,
        descriptionType: typeof args.description,
        descriptionLength: typeof args.description === 'string' ? args.description.length : Array.isArray(args.description) ? args.description.length : 0
      })
      const targetWorkspace = args.workspaceName

      if (!targetWorkspace) {
        remixAILogger.error('[QuickDapp] workspaceName is missing!')
        return this.createErrorResult('workspaceName is required for update_dapp. Use list_dapps first to get the workspace name.')
      }

      dappOps = DappOperations.from(targetWorkspace, plugin)
      const isInlineMode = dappOps.isInline()

      // Switch to target workspace
      try {
        await dappOps.switchToWorkspace()
      } catch (e: any) {
        remixAILogger.error('[QuickDapp] Failed to switch workspace:', e?.message)
        return this.createErrorResult(`Failed to switch to workspace ${targetWorkspace}: ${e.message}`)
      }

      let configSlug: string | undefined
      try {
        const config = await dappOps.readConfig()
        configSlug = config.slug
        remixAILogger.log(`[QuickDapp][UPDATE] Read slug from config: ${configSlug}`)
      } catch (e: any) {
        remixAILogger.warn('[QuickDapp] Could not read config for slug:', e?.message)
      }
      const slugToUse = configSlug || dappOps.getSlug()

      // Get workspace file list (names only — subagent reads content in its own context)
      let fileNames: string[] = []
      try {
        const currentFiles: Record<string, string> = {}
        await this.readWorkspaceFiles(plugin, dappOps.getSourceRoot(), currentFiles)
        fileNames = Object.keys(currentFiles)
        remixAILogger.log(`[QuickDapp] Found ${fileNames.length} files in workspace`)
      } catch (e: any) {
        remixAILogger.warn('[QuickDapp] Failed to list files:', e?.message)
      }

      if (fileNames.length === 0) {
        return this.createErrorResult('No files found in workspace. Please ensure the DApp workspace is active.')
      }

      // Auto-resolve contract info from config
      const contractResolved = await this.resolveContractInfo(dappOps, args)

      // Emit UI events
      plugin.emit('dappUpdateStart', { workspaceName: dappOps.getWorkspaceName(), slug: slugToUse })
      plugin.emit('generationProgress', { status: 'preparing', contractAddress: contractResolved.address, workspaceName: dappOps.getWorkspaceName(), slug: slugToUse })

      // Build a concise file list (names only — no content in the main agent's context).
      // The subagent will read file contents in its own isolated context via read_file,
      // avoiding the context accumulation that causes "request entity too large" errors.
      const fileList = fileNames.join('\n')
      const description = typeof args.description === 'string' ? args.description : JSON.stringify(args.description)

      const isLocalVM = isLocalVMChainId(contractResolved.chainId)

      // Build path examples based on mode
      const examplePaths = dappOps.resolvePath('src/App.jsx')
      const correctPathExample = `Correct: ${examplePaths}`

      return this.createSuccessResult({
        success: true,
        workspaceName: dappOps.getWorkspaceName(),
        contractAddress: contractResolved.address,
        workspaceReady: true,
        message: `DApp workspace "${targetWorkspace}" is ready for update.\n\n` +
          `Now proceed to update the DApp files directly.\n\n` +
          `---\n` +
          `TASK: Modify the DApp in workspace "${dappOps.getWorkspaceName()}"${isInlineMode ? ' (inline mode - /frontend folder)' : ''}\n` +
          `USER REQUEST: ${description}\n` +
          `CONTRACT ADDRESS: ${contractResolved.address} on chain ${contractResolved.chainId}${isLocalVM ? ' (Remix VM)' : ''}\n` +
          `FILES IN WORKSPACE:\n${fileList}\n\n` +
          `${QUICKDAPP_BUILD_RULES}\n` +
          `\n${QUICKDAPP_DESIGN_RULES}\n` +
          `CRITICAL PATH RULES:\n` +
          `- All file paths are relative to workspace root. Use ${examplePaths}, NOT ${dappOps.getWorkspaceName()}${examplePaths}\n` +
          `- NEVER include workspace name in paths. ${correctPathExample}\n\n` +
          `LOGIC PRESERVATION (MANDATORY):\n` +
          `- NEVER remove existing ethers.js contract integrations, useState, useEffect, or ABI calls.\n` +
          `- NEVER remove wallet connection code or window.__QUICK_DAPP_CONFIG__ integration.\n` +
          `- You MAY restructure JSX layout, change CSS classes, and add new features.\n` +
          `- When returning a file, return the COMPLETE file content — not just the changed portion.\n\n` +
          `STEPS:\n` +
          `1. Use read_file to read the files you need to modify\n` +
          `2. Modify only the relevant files using write_file\n` +
          `3. NEVER create or modify dapp.config.json — it is managed by the system.\n` +
          (isLocalVM
            ? `\nREMIX VM RULES (LOCAL DEV MODE - CRITICAL):\n` +
            `- Use window.ethereum directly: new ethers.BrowserProvider(window.ethereum). The Remix IDE preview provides it automatically.\n` +
            `- Do NOT use window.__qdapp_getProvider(). Do NOT call wallet_switchEthereumChain or wallet_addEthereumChain.\n` +
            `- Do NOT show "Install MetaMask", "Wrong Network" warnings, or chain ID checks.\n` +
            `- MUST listen for window.ethereum accountsChanged and immediately update the visible connected account, signer, and contract instance when Deploy & Run account changes. Do not require a preview refresh.\n`
            : `\nREAL NETWORK WALLET RULES (CRITICAL - use EXACT values below):\n` +
            `- The contract is deployed on chain ${contractResolved.chainId}. Set TARGET_CHAIN_ID = ${contractResolved.chainId} in the generated code.\n` +
            `- For wallet_switchEthereumChain, use chainId: '0x${Number(contractResolved.chainId).toString(16)}'. Do NOT use '0x1' or any other chain.\n` +
            `- Use window.__qdapp_getProvider ? await window.__qdapp_getProvider() : window.ethereum for wallet discovery (EIP-6963).\n` +
            `- Store raw provider in a React ref for reuse in network switching.\n` +
            `- Show Connect Wallet / Disconnect / Switch Network buttons. Compare chain IDs as decimal numbers (not hex).\n`) +
          `4. Call finalize_dapp_generation with workspaceName="${targetWorkspace}", contractAddress="${contractResolved.address}", isUpdate=true\n` +
          `---`
      })

    } catch (error: any) {
      remixAILogger.error('[QuickDapp] UpdateDAppHandler FAILED:', error)
      plugin.emit('dappGenerationError', {
        workspaceName: dappOps?.getWorkspaceName() || args.workspaceName,
        error: error.message
      })
      return this.createErrorResult(`DApp update failed: ${error.message}`)
    }
  }

}

// ──────────────────────────────────────────────
// Finalize DApp Generation Tool Handler
// Called AFTER the agent writes all DApp files via write_file.
// Handles config update, dappGenerated event, and auto-open.
// ──────────────────────────────────────────────

export class FinalizeDAppGenerationHandler extends BaseToolHandler {
  name = 'finalize_dapp_generation'
  description = 'Finalize a DApp after ALL files have been written using write_file. This updates the config, notifies the UI, and opens the DApp preview. MUST be called after generate_dapp + write_file sequence is complete.'
  inputSchema = {
    type: 'object',
    properties: {
      workspaceName: {
        type: 'string',
        description: 'The DApp workspace name returned by generate_dapp'
      },
      contractAddress: {
        type: 'string',
        description: 'The contract address for the DApp'
      },
      isUpdate: {
        type: 'boolean',
        description: 'Set to true if this is an update (not a new generation)',
        default: false
      }
    },
    required: ['workspaceName']
  }

  getPermissions(): string[] {
    return ['dapp:generate', 'file:write']
  }

  validate(args: any): boolean | string {
    if (!args.workspaceName) return 'Missing required argument: workspaceName'
    return true
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    const { workspaceName, contractAddress, isUpdate } = args
    let dappOps: DappOperations | undefined
    let configSlug: string | undefined

    try {
      remixAILogger.log(`[QuickDapp] FinalizeDAppGeneration: workspaceName=${workspaceName}, isUpdate=${!!isUpdate}`)

      dappOps = DappOperations.from(workspaceName, plugin)
      const isInlineMode = dappOps.isInline()

      // Ensure we're in the correct workspace
      await dappOps.switchToWorkspace()

      // Update config status — defensively restore sourceWorkspace if agent overwrote it
      try {
        const config = await dappOps.readConfig()
        configSlug = config.slug
        remixAILogger.log(`[QuickDapp][FINALIZE] Read slug from config: ${configSlug}`)

        config.status = 'created'
        config.processingStartedAt = null
        config.updatedAt = Date.now()

        // Defensive: restore sourceWorkspace if missing (agent may have overwritten config)
        if (!config.sourceWorkspace && !isInlineMode) {
          remixAILogger.warn(`[QuickDapp][FINALIZE] sourceWorkspace MISSING from config — attempting restore from mapping files`)
          try {
            const mappingsDir = '.deploys/dapp-mappings'
            const exists = await plugin.call('fileManager', 'exists', mappingsDir)
            if (exists) {
              const mappingFiles = await plugin.call('fileManager', 'readdir', mappingsDir)
              if (mappingFiles) {
                for (const filePath of Object.keys(mappingFiles)) {
                  const fileName = filePath.split('/').pop()
                  if (!fileName) continue
                  try {
                    const content = await plugin.call('fileManager', 'readFile', `${mappingsDir}/${fileName}`)
                    const mapping = JSON.parse(content)
                    if (mapping.dappWorkspace === workspaceName && mapping.sourceWorkspace) {
                      config.sourceWorkspace = { name: mapping.sourceWorkspace }
                      remixAILogger.log(`[QuickDapp][FINALIZE] Restored sourceWorkspace="${mapping.sourceWorkspace}" from mapping file`)
                      break
                    }
                  } catch { /* skip unreadable mapping */ }
                }
              }
            }
          } catch (e) {
            remixAILogger.warn('[QuickDapp][FINALIZE] Could not restore sourceWorkspace from mappings:', e)
          }
        } else if (config.sourceWorkspace) {
          remixAILogger.log(`[QuickDapp][FINALIZE] sourceWorkspace OK: ${config.sourceWorkspace.name}`)
        }

        await dappOps.writeConfig(config)
        remixAILogger.log('[QuickDapp] Config updated to created')
      } catch (configErr) {
        remixAILogger.warn('[QuickDapp] Config update failed (non-critical):', configErr)
      }
      const slugToUse = configSlug || dappOps.getSlug()
      remixAILogger.log(`[QuickDapp][FINALIZE] Using slug for event: ${slugToUse}`)

      // Emit dappGenerated event — triggers UI refresh
      plugin.emit('dappGenerated', {
        address: contractAddress || '',
        workspaceName: dappOps.getWorkspaceName(),
        slug: slugToUse,
        isUpdate: !!isUpdate,
        isInlineMode
      })
      remixAILogger.log('[QuickDapp] dappGenerated emitted')

      // Note: In agent-driven flow, file writes are already approved via HITL.
      // No separate review card (onDappUpdateCompleted) is needed.

      // Auto-open the DApp detail page
      try {
        await plugin.call('manager', 'activatePlugin', 'quick-dapp-v2')
        await plugin.call('quick-dapp-v2' as any, 'openDapp', dappOps.getWorkspaceName())
        await plugin.call('tabs' as any, 'focus', 'quick-dapp-v2')
        remixAILogger.log('[QuickDapp] Auto-open complete')
      } catch (e: any) {
        remixAILogger.warn('[QuickDapp] Auto-open failed (non-critical):', e?.message)
      }

      return this.createSuccessResult({
        success: true,
        workspaceName: dappOps.getWorkspaceName(),
        message: `✅ DApp "${dappOps.getWorkspaceName()}" finalized. Config updated, dashboard refreshed, and DApp preview opened.`
      })
    } catch (error: any) {
      remixAILogger.error('[QuickDapp] finalize_dapp_generation failed:', error)
      plugin.emit('dappGenerationError', {
        workspaceName: dappOps?.getWorkspaceName() || workspaceName,
        error: error.message
      })
      return this.createErrorResult(`Failed to finalize DApp: ${error.message}`)
    }
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
      remixAILogger.log('[QuickDapp] ListDAppsHandler.execute() — scanning workspaces directly via filePanel')

      // Use filePanel directly to avoid auto-activating quick-dapp-v2 plugin
      // (plugin.call to an inactive plugin auto-activates it, which opens its UI tab)
      let allWorkspaces: any[]
      try {
        allWorkspaces = await plugin.call('filePanel' as any, 'getWorkspacesForPlugin')
        remixAILogger.log('[QuickDapp] Total workspaces:', allWorkspaces?.length || 0)
      } catch (e: any) {
        remixAILogger.error('[QuickDapp] Failed to get workspaces:', e?.message)
        return this.createErrorResult(`Failed to list workspaces: ${e.message}`)
      }

      if (!allWorkspaces || !Array.isArray(allWorkspaces)) {
        return this.createSuccessResult({
          success: true, dapps: [], count: 0,
          message: 'No workspaces found.'
        })
      }

      const dapps: any[] = []
      const allWorkspaceNames = allWorkspaces
        .map((ws: any) => typeof ws === 'string' ? ws : ws.name)
        .filter((name: string) => !!name)

      remixAILogger.log('[QuickDapp] Scanning', allWorkspaceNames.length, 'workspaces for DApps')

      for (const wsName of allWorkspaceNames) {
        try {
          const hasConfig = await plugin.call('filePanel' as any, 'existsInWorkspace', wsName, 'dapp.config.json')
          if (!hasConfig) continue

          const content = await plugin.call('filePanel' as any, 'readFileFromWorkspace', wsName, 'dapp.config.json')
          if (!content) continue

          const config = JSON.parse(content)
          const isInlineMode = config.mode === 'inline'
          dapps.push({
            workspaceName: wsName,
            name: config.name || 'Untitled',
            contractAddress: config.contract?.address || 'unknown',
            contractName: config.contract?.name || 'unknown',
            chainId: config.contract?.chainId || 'unknown',
            networkName: config.contract?.networkName || '',
            status: config.status || 'unknown',
            createdAt: config.createdAt || 0,
            isInlineMode
          })
          if (isInlineMode) {
            remixAILogger.log('[QuickDapp] Found inline DApp in workspace:', wsName)
          }
        } catch (e) {
          // Silently skip workspaces without valid config
        }
      }

      dapps.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      remixAILogger.log('[QuickDapp] list_dapps returned', dapps.length, 'dapps')

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
      remixAILogger.error('[QuickDapp] list_dapps failed:', error)
      return this.createErrorResult(`Failed to list DApps: ${error.message}`)
    }
  }
}

// ──────────────────────────────────────────────
// Fetch Figma Design Tool Handler
// Called by the QuickDapp Specialist subagent to retrieve Figma design data.
// ──────────────────────────────────────────────

export class FetchFigmaDesignHandler extends BaseToolHandler {
  name = 'fetch_figma_design'
  description = 'Fetch a Figma design file and return simplified design data (layout, colors, text). Use this when the user provides a Figma URL and token to reference a design for DApp generation.'
  inputSchema = {
    type: 'object',
    properties: {
      figmaUrl: {
        type: 'string',
        description: 'Figma file URL (e.g., https://www.figma.com/design/XXXX/...)'
      },
      figmaToken: {
        type: 'string',
        description: 'Figma Personal Access Token for API authentication'
      }
    },
    required: ['figmaUrl', 'figmaToken']
  }

  validate(args: any): boolean | string {
    if (!args.figmaUrl) return 'Missing required argument: figmaUrl'
    if (!args.figmaToken) return 'Missing required argument: figmaToken'
    return true
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      remixAILogger.log('[QuickDapp] fetch_figma_design called:', args.figmaUrl)

      // Parse Figma URL to extract file key
      const patterns = [
        /figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/,
        /figma\.com\/proto\/([a-zA-Z0-9]+)/
      ]

      let fileKey: string | null = null
      for (const pattern of patterns) {
        const match = args.figmaUrl.match(pattern)
        if (match) {
          fileKey = match[1]
          break
        }
      }

      if (!fileKey) {
        return this.createErrorResult('Invalid Figma URL format. Expected: https://www.figma.com/design/XXXX/...')
      }

      // Fetch from Figma API
      const response = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
        headers: { 'X-Figma-Token': args.figmaToken }
      })

      if (!response.ok) {
        if (response.status === 403) {
          return this.createErrorResult('Figma API access denied. Please check the Personal Access Token.')
        }
        if (response.status === 404) {
          return this.createErrorResult('Figma file not found. Please check the URL.')
        }
        return this.createErrorResult(`Figma API error: ${response.statusText}`)
      }

      const figmaData = await response.json()

      // Simplify the document tree for LLM consumption
      const simplifyNode = (node: any, depth = 0): any => {
        if (depth > 5) return null
        const simplified: any = { name: node.name, type: node.type }

        if (node.absoluteBoundingBox) {
          simplified.bounds = {
            w: Math.round(node.absoluteBoundingBox.width),
            h: Math.round(node.absoluteBoundingBox.height)
          }
        }

        if (node.fills && node.fills.length > 0) {
          const solidFill = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false)
          if (solidFill?.color) {
            const r = Math.round((solidFill.color.r || 0) * 255)
            const g = Math.round((solidFill.color.g || 0) * 255)
            const b = Math.round((solidFill.color.b || 0) * 255)
            simplified.fill = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
          }
        }

        if (node.type === 'TEXT' && node.characters) {
          simplified.text = node.characters.substring(0, 100)
        }

        if (node.children && Array.isArray(node.children)) {
          const ch = node.children.map((child: any) => simplifyNode(child, depth + 1)).filter(Boolean)
          if (ch.length > 0) simplified.children = ch
        }

        return simplified
      }

      const simplifiedDocument = simplifyNode(figmaData.document)
      const rawJson = JSON.stringify(simplifiedDocument, null, 2)

      // Truncate if too large for LLM context (keep under 30KB to avoid
      // LangGraph's large-tool-result file-save mechanism)
      const maxJsonLength = 30000
      const truncatedJson = rawJson.length > maxJsonLength
        ? rawJson.substring(0, maxJsonLength) + '\n... [truncated for token limit]'
        : rawJson

      remixAILogger.log(`[QuickDapp] Figma design fetched: ${figmaData.name}, size: ${rawJson.length}`)

      return this.createSuccessResult({
        success: true,
        fileName: figmaData.name || 'Untitled',
        fileKey,
        designData: truncatedJson,
        message: `Figma design "${figmaData.name}" loaded successfully. Use the design data above to match the layout, colors, and typography when generating DApp files.`
      })
    } catch (error: any) {
      remixAILogger.error('[QuickDapp] fetch_figma_design failed:', error)
      return this.createErrorResult(`Failed to fetch Figma design: ${error.message}`)
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
      description: 'Set up a new DApp workspace from a deployed smart contract. Returns generation instructions — you MUST then write each DApp file using write_file, then call finalize_dapp_generation.',
      inputSchema: new GenerateDAppHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:generate', 'file:write'],
      handler: new GenerateDAppHandler()
    },
    {
      name: 'finalize_dapp_generation',
      description: 'Finalize a DApp after ALL files have been written using write_file. Updates config, refreshes dashboard, and opens DApp preview. MUST be called after generate_dapp + write_file sequence.',
      inputSchema: new FinalizeDAppGenerationHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:generate', 'file:write'],
      handler: new FinalizeDAppGenerationHandler()
    },
    {
      name: 'update_dapp',
      description: 'Update an existing DApp. PREREQUISITE: You MUST have already called list_dapps AND received the user\'s explicit workspace selection before calling this tool. Never call update_dapp directly without user confirmation of which workspace to update. Requires workspaceName (from list_dapps) and description (the modification request).',
      inputSchema: new UpdateDAppHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:update', 'file:write'],
      handler: new UpdateDAppHandler()
    },
    {
      name: 'fetch_figma_design',
      description: 'Fetch and simplify a Figma design file for use as visual reference during DApp generation. Returns layout structure, colors, and text content.',
      inputSchema: new FetchFigmaDesignHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:read'],
      handler: new FetchFigmaDesignHandler()
    }
  ]
}
