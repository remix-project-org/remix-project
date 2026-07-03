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
import {
  clearQuickDappWorkspaceLock,
  DappOperations,
  extractNameFromKey,
  setQuickDappWorkspaceLock
} from '@remix-ui/helper'
import isElectron from 'is-electron'
import { clearQuickDappGenerationContext, markQuickDappGenerationContext } from '../../helpers/quickDappGenerationContext'
import {
  buildExistingGraphDataSourceBlock,
  buildQuickDappGraphDataSourceInstructions
} from '../prompts/quickDappTheGraphPrompts'

const isLocalVMChainId = (chainId: number | string): boolean => {
  const n = Number(chainId)
  return Number.isNaN(n) || n === 0 || n === 1337 || n === 31337 || n === 5777
}

const isInvalidQuickDappChainId = (chainId: number | string | undefined | null): boolean => {
  const value = String(chainId ?? '').trim().toLowerCase()
  return !value || value === '-' || value === 'undefined' || value === 'unknown' || value === 'null' || value === 'nan'
}

const getDappModeFromConfig = (config: any): 'workspace' | 'inline' => {
  if (config?.mode === 'inline' || config?.inlineMode === true || config?.slug?.startsWith('inline-')) {
    return 'inline'
  }
  return 'workspace'
}

const isDedicatedDappWorkspace = (workspaceName: string): boolean => workspaceName.startsWith('dapp-')

// Anchor files used only to detect whether a workspace has an existing QuickDapp source tree.
// They do not limit which files the update flow may later create or modify.
const getDappSourceAnchorCandidates = (mode: 'workspace' | 'inline'): string[] => {
  const prefix = mode === 'inline' ? 'frontend/' : ''
  return [
    `${prefix}index.html`,
    `${prefix}src/main.jsx`,
    `${prefix}src/App.jsx`,
    `${prefix}src/index.css`
  ]
}

const getDappSourceSummary = async (plugin: Plugin, workspaceName: string, mode: 'workspace' | 'inline'): Promise<{
  sourceRoot: '/' | '/frontend'
  sourceFiles: string[]
  sourceFileCount: number
  updatable: boolean
}> => {
  const sourceFiles: string[] = []
  for (const filePath of getDappSourceAnchorCandidates(mode)) {
    try {
      const exists = await plugin.call('filePanel' as any, 'existsInWorkspace', workspaceName, filePath)
      if (exists) sourceFiles.push(filePath)
    } catch { /* ignore missing candidates */ }
  }

  return {
    sourceRoot: mode === 'inline' ? '/frontend' : '/',
    sourceFiles,
    sourceFileCount: sourceFiles.length,
    updatable: sourceFiles.length > 0
  }
}

interface DappConfigLookup {
  config: any
  configPath: string
  mode: 'workspace' | 'inline'
  sourceSummary: {
    sourceRoot: '/' | '/frontend'
    sourceFiles: string[]
    sourceFileCount: number
    updatable: boolean
  }
}

const readDappConfigFromWorkspace = async (plugin: Plugin, workspaceName: string): Promise<DappConfigLookup | null> => {
  const configCandidates = ['dapp.config.json', 'frontend/dapp.config.json']
  const parsedConfigs: DappConfigLookup[] = []

  for (const configPath of configCandidates) {
    try {
      const exists = await plugin.call('filePanel' as any, 'existsInWorkspace', workspaceName, configPath)
      if (!exists) continue
      const content = await plugin.call('filePanel' as any, 'readFileFromWorkspace', workspaceName, configPath)
      if (!content) continue
      const config = JSON.parse(content)
      const mode = configPath.startsWith('frontend/')
        ? 'inline'
        : getDappModeFromConfig(config)
      const sourceSummary = await getDappSourceSummary(plugin, workspaceName, mode)
      parsedConfigs.push({ config, configPath, mode, sourceSummary })
    } catch { /* try the next candidate */ }
  }

  const preferredMode: 'workspace' | 'inline' = isDedicatedDappWorkspace(workspaceName) ? 'workspace' : 'inline'
  const scoreCandidate = (candidate: DappConfigLookup): number =>
    (candidate.sourceSummary.updatable ? 4 : 0) +
    (candidate.mode === preferredMode ? 2 : 0)

  return parsedConfigs
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0] || null
}

const switchToWorkspaceIfNeeded = async (plugin: Plugin, workspaceName: string): Promise<void> => {
  const currentWs = await plugin.call('filePanel' as any, 'getCurrentWorkspace')
  if (currentWs?.name === workspaceName) return
  await plugin.call('filePanel' as any, 'switchToWorkspace', {
    name: workspaceName,
    isLocalhost: false
  })
  await new Promise(r => setTimeout(r, 500))
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

const QUICKDAPP_GRAPH_ONLY_BUILD_RULES =
  `IMPORT RULES (CRITICAL - violations crash the build):\n` +
  `- Use BARE SPECIFIERS: import React from 'react'. The index.html import map resolves it.\n` +
  `- NEVER use full URLs in imports (e.g. import React from 'https://esm.sh/react@18'). This crashes the bundler.\n` +
  `- ALWAYS include .jsx extension in local imports: import App from './App.jsx' (not './App')\n` +
  `- NEVER repeat src/ in relative paths inside src/: import App from './App.jsx' NOT './src/App.jsx'\n` +
  `- EVERY .jsx file using JSX MUST import React from 'react' at the top.\n` +
  `- Do NOT import ethers. Do NOT create wallet, provider, signer, contract, or transaction code.\n` +
  `- Do NOT use react-router-dom. Use hash-based routing only if needed.\n\n` +
  `FILE STRUCTURE (minimum required):\n` +
  `- index.html: import map (react, react-dom/client), Tailwind CDN, window.__QUICK_DAPP_CONFIG__ init, <script type="module" src="./src/main.jsx">\n` +
  `- src/main.jsx: React entry with ReactDOM.createRoot\n` +
  `- src/App.jsx: Main Graph data UI\n` +
  `- src/index.css: Custom styles\n\n` +
  `INDEX.HTML IMPORT MAP (must include):\n` +
  `<script type="importmap">{ "imports": { "react": "https://esm.sh/react@18.2.0", "react-dom/client": "https://esm.sh/react-dom@18.2.0/client" } }</script>\n\n` +
  `DYNAMIC CONTENT:\n` +
  `- Use window.__QUICK_DAPP_CONFIG__ for title/logo/details. Do NOT hardcode app names or logos.\n` +
  `- Fallback: config.title || 'Graph DApp'\n`

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

interface FigmaDesignSuccess {
  success: true
  fileName: string
  fileKey: string
  nodeId?: string
  designData: string
  truncated: boolean
  rawLength: number
}

interface FigmaDesignFailure {
  success: false
  reason: 'invalid_figma_url' | 'figma_node_not_found' | 'figma_access_denied' | 'figma_file_not_found' | 'figma_api_error' | 'figma_fetch_error'
  message: string
  status?: number
}

type FigmaDesignResult = FigmaDesignSuccess | FigmaDesignFailure

function isFigmaDesignFailure(result: FigmaDesignResult): result is FigmaDesignFailure {
  return result.success === false
}

function extractFigmaFileKey(figmaUrl: string): string | null {
  const patterns = [
    /figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/,
    /figma\.com\/proto\/([a-zA-Z0-9]+)/
  ]

  for (const pattern of patterns) {
    const match = figmaUrl.match(pattern)
    if (match) return match[1]
  }

  return null
}

function extractFigmaNodeId(figmaUrl: string): string | undefined {
  try {
    const url = new URL(figmaUrl)
    const nodeId = url.searchParams.get('node-id')
    return nodeId ? nodeId.replace(/-/g, ':') : undefined
  } catch (_) {
    return undefined
  }
}

function simplifyFigmaNode(node: any, depth = 0): any {
  if (!node || depth > 5) return null

  const simplified: any = { name: node.name, type: node.type }

  if (node.absoluteBoundingBox) {
    simplified.bounds = {
      x: Math.round(node.absoluteBoundingBox.x || 0),
      y: Math.round(node.absoluteBoundingBox.y || 0),
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
    const children = node.children.map((child: any) => simplifyFigmaNode(child, depth + 1)).filter(Boolean)
    if (children.length > 0) simplified.children = children
  }

  return simplified
}

async function fetchAndSimplifyFigmaDesign(figmaUrl: string, figmaToken: string): Promise<FigmaDesignResult> {
  const fileKey = extractFigmaFileKey(figmaUrl)
  if (!fileKey) {
    return {
      success: false,
      reason: 'invalid_figma_url',
      message: 'Invalid Figma URL format. Expected a figma.com file/design/proto URL.'
    }
  }

  const nodeId = extractFigmaNodeId(figmaUrl)
  const apiUrl = nodeId
    ? `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`
    : `https://api.figma.com/v1/files/${fileKey}`

  try {
    const response = await fetch(apiUrl, {
      headers: { 'X-Figma-Token': figmaToken }
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          reason: 'figma_access_denied',
          message: 'Figma API access denied. Please check the Personal Access Token and file permissions.',
          status: response.status
        }
      }
      if (response.status === 404) {
        return {
          success: false,
          reason: 'figma_file_not_found',
          message: 'Figma file not found. Please check the URL and token access.',
          status: response.status
        }
      }
      return {
        success: false,
        reason: 'figma_api_error',
        message: `Figma API error: ${response.statusText || response.status}`,
        status: response.status
      }
    }

    const figmaData = await response.json()
    const documentRoot = nodeId
      ? figmaData.nodes?.[nodeId]?.document
      : figmaData.document

    if (!documentRoot) {
      return {
        success: false,
        reason: 'figma_node_not_found',
        message: nodeId
          ? `Figma node "${nodeId}" was not found in the file. Please check the node-id in the URL.`
          : 'Figma document data was missing from the API response.'
      }
    }

    const simplifiedDocument = simplifyFigmaNode(documentRoot)
    const rawJson = JSON.stringify(simplifiedDocument, null, 2)
    const maxJsonLength = 30000
    const truncated = rawJson.length > maxJsonLength
    const designData = truncated
      ? rawJson.substring(0, maxJsonLength) + '\n... [truncated for token limit]'
      : rawJson

    return {
      success: true,
      fileName: figmaData.name || documentRoot.name || 'Untitled',
      fileKey,
      nodeId,
      designData,
      truncated,
      rawLength: rawJson.length
    }
  } catch (error: any) {
    return {
      success: false,
      reason: 'figma_fetch_error',
      message: `Failed to fetch Figma design: ${error.message || String(error)}`
    }
  }
}

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
  setupOptionsConfirmed?: boolean
  setupOptionsSummary?: string
  subgraphFilePath?: string
  graphContext?: QuickDappGraphContext
}

export interface GenerateGraphDAppArgs {
  description: string
  graphContext: QuickDappGraphContext
  frontendMode?: 'workspace' | 'inline'
  isBaseMiniApp?: boolean
  setupOptionsConfirmed?: boolean
  setupOptionsSummary?: string
  confirmOverwrite?: boolean
}

export interface QuickDappGraphContext {
  source: 'subgraph-file' | 'remixai-chat' | 'manual'
  filePath?: string
  endpoint: string
  endpointKind?: 'local' | 'thegraph-gateway' | 'generic-graphql'
  endpointNeedsApiKey?: boolean
  apiKeySource?: 'remix-settings' | 'none'
  subgraphId?: string
  network?: string
  description?: string
  query: string
  variables?: Record<string, any>
  operationName?: string
  operationType?: 'query' | 'mutation' | 'subscription'
}

const getGraphContextTrace = (graphContext?: QuickDappGraphContext | null) => {
  if (!graphContext) return { hasGraphContext: false }
  return {
    hasGraphContext: true,
    source: graphContext.source,
    filePath: graphContext.filePath,
    endpointKind: graphContext.endpointKind,
    endpointNeedsApiKey: graphContext.endpointNeedsApiKey === true,
    apiKeySource: graphContext.apiKeySource,
    hasSubgraphId: !!graphContext.subgraphId,
    queryLength: typeof graphContext.query === 'string' ? graphContext.query.length : 0,
    variablesKeys: graphContext.variables ? Object.keys(graphContext.variables) : [],
    operationName: graphContext.operationName,
    operationType: graphContext.operationType
  }
}

const getGenerateDAppArgsTrace = (args: GenerateDAppArgs) => ({
  descriptionType: typeof args.description,
  contractName: args.contractName,
  contractAddress: args.contractAddress,
  chainId: args.chainId,
  frontendMode: args.frontendMode,
  isBaseMiniApp: !!args.isBaseMiniApp,
  hasFigmaUrl: !!args.figmaUrl,
  hasFigmaToken: !!args.figmaToken,
  setupOptionsConfirmed: args.setupOptionsConfirmed === true,
  hasSetupOptionsSummary: !!args.setupOptionsSummary?.trim(),
  subgraphFilePath: args.subgraphFilePath,
  contractAbiLength: Array.isArray(args.contractAbi) ? args.contractAbi.length : 0,
  graphContext: getGraphContextTrace(args.graphContext)
})

interface QuickDappSubgraphFileContext extends QuickDappGraphContext {
  validation?: {
    canGenerateDapp: boolean
    errors?: string[]
    warnings?: string[]
    missingFields?: string[]
  }
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
  description = 'Create a new DApp frontend from a deployed smart contract. STRICT PREREQUISITE: first ask only the required setup options, then stop. If the current prompt or tool result says Location is fixed, do not ask Location; otherwise ask Location Workspace(default)/Inline. Always ask Base mini-app No(default)/Yes, Design defaults/style notes/Figma URL, and Subgraph None(default)/.subgraph file path or name. Do not ask Theme, Primary Color, DApp Title, Layout, or other design subquestions. Call this only after the user replies, with setupOptionsConfirmed=true and a non-empty setupOptionsSummary. If a .subgraph file is chosen in contract-first flow, pass subgraphFilePath so this tool can resolve graphContext without losing the contract context. If Figma is requested, the URL/token are validated before any workspace or file generation begins.'
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
        description: 'Figma design file URL (optional). If node-id is present, only that node is fetched; otherwise the file is fetched.'
      },
      figmaToken: {
        type: 'string',
        description: 'Figma Personal Access Token (required if figmaUrl is provided)'
      },
      frontendMode: {
        type: 'string',
        description: 'Where to create the DApp: "workspace" (new workspace, default when Location is not fixed) or "inline" (./frontend in current workspace). Some runtimes force inline.',
        enum: ['workspace', 'inline'],
        default: 'workspace'
      },
      confirmOverwrite: {
        type: 'boolean',
        description: 'Set to true to confirm overwriting existing /frontend folder (only needed if frontendMode is "inline" and folder exists)',
        default: false
      },
      setupOptionsConfirmed: {
        type: 'boolean',
        description: 'Required confirmation gate. Set true only after a user reply following the setup options question. Never set true in the same assistant turn where setup options are asked.',
        default: false
      },
      setupOptionsSummary: {
        type: 'string',
        description: 'Required when setupOptionsConfirmed=true. Short summary of the setup choices confirmed by the user, e.g. "Location workspace, Base mini-app no, Design defaults, Subgraph none".'
      },
      subgraphFilePath: {
        type: 'string',
        description: 'Optional path/name of a .subgraph file selected during contract-first setup. Use this instead of redirecting the user to the .subgraph context menu. The tool resolves it to graphContext before workspace creation.'
      },
      graphContext: {
        type: 'object',
        description: 'Optional complete The Graph data source context. Only provide this when supplied by The Graph .subgraph handoff or another validated source. Never include actual API key values.',
        properties: {
          source: {
            type: 'string',
            enum: ['subgraph-file', 'remixai-chat', 'manual']
          },
          filePath: { type: 'string' },
          endpoint: {
            type: 'string',
            description: 'GraphQL endpoint without actual API key values.'
          },
          endpointKind: {
            type: 'string',
            enum: ['local', 'thegraph-gateway', 'generic-graphql']
          },
          endpointNeedsApiKey: { type: 'boolean' },
          apiKeySource: {
            type: 'string',
            enum: ['remix-settings', 'none']
          },
          subgraphId: { type: 'string' },
          network: {
            type: 'string',
            description: 'Informational metadata only. Must not override the contract chainId.'
          },
          description: { type: 'string' },
          query: { type: 'string' },
          variables: { type: 'object' },
          operationName: { type: 'string' },
          operationType: {
            type: 'string',
            enum: ['query', 'mutation', 'subscription']
          }
        },
        required: ['source', 'endpoint', 'query']
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
    if (args.subgraphFilePath && !args.subgraphFilePath.trim()) {
      return 'subgraphFilePath must not be empty when provided'
    }
    if (args.graphContext) {
      if (!args.graphContext.endpoint?.trim()) {
        return 'graphContext.endpoint is required when graphContext is provided'
      }
      if (!args.graphContext.query?.trim()) {
        return 'graphContext.query is required when graphContext is provided'
      }
      if (/gateway\.thegraph\.com\/api\/[^/]+\/subgraphs\/id\//i.test(args.graphContext.endpoint)) {
        return 'graphContext.endpoint must not include a The Graph API key'
      }
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

    return true
  }

  private normalizeGraphContext(args: GenerateDAppArgs): void {
    if (!args.graphContext?.endpoint?.trim()) return

    const endpoint = args.graphContext.endpoint.trim()
    const gatewayWithKeyPattern = /^https:\/\/gateway\.thegraph\.com\/api\/([^/]+)\/subgraphs\/id\/([^/?#]+).*$/i
    const gatewayWithoutKeyPattern = /^https:\/\/gateway\.thegraph\.com\/api\/subgraphs\/id\/([^/?#]+).*$/i
    const gatewayWithKeyMatch = endpoint.match(gatewayWithKeyPattern)
    const gatewayWithoutKeyMatch = endpoint.match(gatewayWithoutKeyPattern)
    const subgraphId = gatewayWithoutKeyMatch?.[1] || gatewayWithKeyMatch?.[2]

    if (!subgraphId) return

    args.graphContext.endpoint = `https://gateway.thegraph.com/api/subgraphs/id/${subgraphId}`
    args.graphContext.endpointKind = 'thegraph-gateway'
    args.graphContext.endpointNeedsApiKey = true
    args.graphContext.apiKeySource = 'remix-settings'
    args.graphContext.subgraphId = subgraphId
  }

  private async resolveGenerateChainId(args: GenerateDAppArgs, plugin: Plugin): Promise<{
    chainId: number | string
    providerName?: string
    source: 'unchanged' | 'current_vm_provider' | 'invalid_from_provider'
    matchedDeployedContract: boolean
  }> {
    const originalChainId = args.chainId
    const invalidChainId = isInvalidQuickDappChainId(originalChainId)
    let providerName: string | undefined

    try {
      const providerObject = await plugin.call('blockchain' as any, 'getProviderObject')
      if (typeof providerObject?.name === 'string' && providerObject.name.trim()) {
        providerName = providerObject.name
      }
    } catch (_) {
      // Best effort only. If provider lookup fails, keep the caller's chainId.
    }

    if (!providerName) {
      try {
        const provider = await plugin.call('blockchain' as any, 'getProvider')
        if (typeof provider === 'string' && provider.trim()) providerName = provider
      } catch (_) {
        // Best effort only.
      }
    }

    let matchedDeployedContract = false
    if (providerName?.startsWith('vm') || invalidChainId) {
      try {
        const deployedContracts = await plugin.call('udappDeployedContracts' as any, 'getDeployedContracts')
        if (Array.isArray(deployedContracts)) {
          matchedDeployedContract = deployedContracts.some((contract: any) =>
            typeof contract?.address === 'string' &&
            contract.address.toLowerCase() === args.contractAddress.toLowerCase()
          )
        }
      } catch (_) {
        // Contract matching is a safety improvement, not a hard requirement.
      }
    }

    if (providerName?.startsWith('vm') && (matchedDeployedContract || invalidChainId)) {
      return {
        chainId: providerName,
        providerName,
        source: 'current_vm_provider',
        matchedDeployedContract
      }
    }

    if (invalidChainId && providerName) {
      return {
        chainId: providerName,
        providerName,
        source: 'invalid_from_provider',
        matchedDeployedContract
      }
    }

    return {
      chainId: originalChainId,
      providerName,
      source: 'unchanged',
      matchedDeployedContract
    }
  }

  private async resolveGraphContextFromSubgraphFile(args: GenerateDAppArgs, plugin: Plugin): Promise<IMCPToolResult | null> {
    if (args.graphContext || !args.subgraphFilePath?.trim()) {
      return null
    }

    const subgraphFilePath = args.subgraphFilePath.trim()

    try {
      try {
        await plugin.call('manager' as any, 'activatePlugin', 'thegraph')
      } catch {
        // The plugin may already be active.
      }

      const context = await plugin.call('thegraph' as any, 'getSubgraphFileContext', subgraphFilePath) as QuickDappSubgraphFileContext
      const validation = context.validation

      if (!validation?.canGenerateDapp) {
        return this.createSuccessResult({
          success: false,
          requiresUserInput: true,
          reason: 'subgraph_context_invalid',
          message: `The selected .subgraph file "${subgraphFilePath}" is not ready for QuickDapp generation. Ask the user to fix only the missing or invalid .subgraph fields, then call generate_dapp again with the same contract details and subgraphFilePath.`,
          subgraphFilePath,
          errors: validation?.errors || [],
          warnings: validation?.warnings || [],
          missingFields: validation?.missingFields || [],
          preserveFields: ['description', 'contractName', 'contractAddress', 'chainId', 'frontendMode', 'isBaseMiniApp', 'setupOptionsConfirmed', 'setupOptionsSummary', 'figmaUrl', 'subgraphFilePath'],
          originalRequest: {
            description: args.description,
            contractName: args.contractName,
            contractAddress: args.contractAddress,
            chainId: args.chainId,
            frontendMode: args.frontendMode,
            isBaseMiniApp: !!args.isBaseMiniApp,
            setupOptionsConfirmed: true,
            setupOptionsSummary: args.setupOptionsSummary,
            figmaUrl: args.figmaUrl,
            subgraphFilePath
          },
          nextAction: 'Do not create a workspace or write files. Ask the user to fix the reported .subgraph fields. After the file is fixed, call generate_dapp again with the same contract details and subgraphFilePath.'
        })
      }

      args.graphContext = context
      return null
    } catch (error: any) {
      const message = error?.message || String(error)

      return this.createSuccessResult({
        success: false,
        requiresUserInput: true,
        reason: 'subgraph_context_unavailable',
        message: `Could not read the selected .subgraph file "${subgraphFilePath}". Ask the user for a valid .subgraph path/name, then call generate_dapp again with the same contract details and the corrected subgraphFilePath.`,
        subgraphFilePath,
        error: message,
        preserveFields: ['description', 'contractName', 'contractAddress', 'chainId', 'frontendMode', 'isBaseMiniApp', 'setupOptionsConfirmed', 'setupOptionsSummary', 'figmaUrl'],
        originalRequest: {
          description: args.description,
          contractName: args.contractName,
          contractAddress: args.contractAddress,
          chainId: args.chainId,
          frontendMode: args.frontendMode,
          isBaseMiniApp: !!args.isBaseMiniApp,
          setupOptionsConfirmed: true,
          setupOptionsSummary: args.setupOptionsSummary,
          figmaUrl: args.figmaUrl,
          figmaToken: args.figmaToken
        },
        nextAction: 'Do not create a workspace or write files. Ask for a valid .subgraph file path/name, then retry generate_dapp with subgraphFilePath.'
      })
    }
  }

  async execute(args: GenerateDAppArgs, plugin: Plugin): Promise<IMCPToolResult> {
    let dappOps: DappOperations | undefined
    let progressSlug: string | undefined
    let figmaDesign: FigmaDesignSuccess | undefined
    try {
      remixAILogger.log('[GenerateDApp] Received args:', getGenerateDAppArgsTrace(args))
      const isDesktop = isElectron()
      const targetMode = isDesktop ? 'inline' : (args.frontendMode || 'workspace')
      args.frontendMode = targetMode
      this.normalizeGraphContext(args)

      if (args.setupOptionsConfirmed !== true || !args.setupOptionsSummary?.trim()) {
        return this.createSuccessResult({
          success: false,
          requiresUserInput: true,
          reason: 'setup_options_required',
          message: 'Before generating files, ask the user once for DApp setup options.',
          optionsToAsk: isDesktop
            ? [
              'Base mini-app: No (default) or Yes',
              'Design: defaults, style notes, or a Figma URL',
              'Subgraph: None (default) or provide a .subgraph file path/name'
            ]
            : [
              'Location: Workspace (default) or Inline in /frontend',
              'Base mini-app: No (default) or Yes',
              'Design: defaults, style notes, or a Figma URL',
              'Subgraph: None (default) or provide a .subgraph file path/name'
            ],
          defaults: {
            location: isDesktop ? 'inline' : 'workspace',
            isBaseMiniApp: false,
            design: 'defaults',
            subgraph: 'none'
          },
          fixedLocation: isDesktop ? 'inline' : undefined,
          nextAction: isDesktop
            ? 'Ask only Base mini-app, Design, and Subgraph, then STOP. Location is fixed to Inline in /frontend for this request; do not ask Location. Subgraph defaults to None. If the user wants a .subgraph, ask for the .subgraph file path/name and pass it as subgraphFilePath; do not redirect to the .subgraph context menu. Do not call any tools or write files in the same turn. After the user answers, call generate_dapp again with setupOptionsConfirmed=true, a non-empty setupOptionsSummary, frontendMode="inline", isBaseMiniApp, description, any figmaUrl/figmaToken, and subgraphFilePath if provided.'
            : 'Ask only those setup options and then STOP. Subgraph defaults to None. If the user wants a .subgraph, ask for the .subgraph file path/name and pass it as subgraphFilePath; do not redirect to the .subgraph context menu. Do not call any tools or write files in the same turn. After the user answers, call generate_dapp again with setupOptionsConfirmed=true, a non-empty setupOptionsSummary, frontendMode, isBaseMiniApp, description, any figmaUrl/figmaToken, and subgraphFilePath if provided.'
        })
      }

      const graphResolutionResult = await this.resolveGraphContextFromSubgraphFile(args, plugin)
      if (graphResolutionResult) {
        return graphResolutionResult
      }

      const chainResolution = await this.resolveGenerateChainId(args, plugin)
      args.chainId = chainResolution.chainId

      if (args.figmaUrl && !args.figmaToken) {
        return this.createSuccessResult({
          success: false,
          requiresUserInput: true,
          reason: 'figma_token_required',
          message: 'Ask the user for their Figma Personal Access Token before generating files.',
          preserveFields: ['description', 'contractName', 'contractAddress', 'chainId', 'frontendMode', 'isBaseMiniApp', 'setupOptionsConfirmed', 'setupOptionsSummary', 'figmaUrl', 'subgraphFilePath', 'graphContext'],
          originalRequest: {
            description: args.description,
            contractName: args.contractName,
            contractAddress: args.contractAddress,
            chainId: args.chainId,
            frontendMode: targetMode,
            isBaseMiniApp: !!args.isBaseMiniApp,
            setupOptionsConfirmed: true,
            setupOptionsSummary: args.setupOptionsSummary,
            figmaUrl: args.figmaUrl,
            subgraphFilePath: args.subgraphFilePath,
            graphContext: args.graphContext
          },
          nextAction: 'Ask only for the Figma token and then STOP. After the user provides the token, call generate_dapp again with the same description, contractName, contractAddress, chainId, frontendMode, isBaseMiniApp, setupOptionsConfirmed=true, setupOptionsSummary, figmaUrl, subgraphFilePath or graphContext if present, and the new figmaToken.'
        })
      }

      if (args.figmaUrl && args.figmaToken) {
        const figmaResult = await fetchAndSimplifyFigmaDesign(args.figmaUrl, args.figmaToken)
        if (isFigmaDesignFailure(figmaResult)) {
          return this.createSuccessResult({
            success: false,
            requiresUserInput: true,
            reason: 'figma_fetch_failed',
            figmaReason: figmaResult.reason,
            message: figmaResult.message,
            workspaceCreated: false,
            generationContextMarked: false,
            optionsToAsk: [
              'Provide a corrected Figma token',
              'Provide a corrected Figma URL',
              'Continue with defaults/no Figma'
            ],
            defaults: {
              continueWithoutFigma: false
            },
            preserveFields: ['description', 'contractName', 'contractAddress', 'chainId', 'frontendMode', 'isBaseMiniApp', 'setupOptionsConfirmed', 'setupOptionsSummary', 'subgraphFilePath', 'graphContext'],
            originalRequest: {
              description: args.description,
              contractName: args.contractName,
              contractAddress: args.contractAddress,
              chainId: args.chainId,
              frontendMode: targetMode,
              isBaseMiniApp: !!args.isBaseMiniApp,
              setupOptionsConfirmed: true,
              setupOptionsSummary: args.setupOptionsSummary,
              figmaUrl: args.figmaUrl,
              subgraphFilePath: args.subgraphFilePath,
              graphContext: args.graphContext
            },
            nextAction:
              'Tell the user the Figma fetch failed and ask for exactly one of: a corrected Figma token, a corrected Figma URL, or explicit confirmation to continue with defaults/no Figma. On the next generate_dapp call, preserve the same description, contractName, contractAddress, chainId, frontendMode, isBaseMiniApp, setupOptionsConfirmed=true, setupOptionsSummary, and subgraphFilePath or graphContext if present. If the user gives a corrected token, reuse the same figmaUrl. If the user gives a corrected URL, use that URL. If the user chooses defaults/no Figma, omit figmaUrl and figmaToken. Do NOT create a workspace, call write_file, or generate a default design unless the user explicitly chooses defaults.'
          })
        }
        figmaDesign = figmaResult
      }

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
        progressSlug = dappOps.getSlug()
        remixAILogger.log('[QuickDapp] Using inline mode in workspace:', currentWs.name)

        // Check if frontend folder exists and has files
        try {
          const folderPath = dappOps.getSourceRoot().substring(1) // Remove leading slash (e.g., 'frontend')
          const files = await plugin.call('fileManager', 'readdir', folderPath)
          const fileCount = files ? Object.keys(files).length : 0

          if (fileCount > 0 && !args.confirmOverwrite) {
            remixAILogger.log(`[QuickDapp] /frontend folder exists with ${fileCount} files, requesting user confirmation`)
            const overwriteOptions = isDesktop
              ? `**Option 1: Overwrite existing files**\n` +
                `- Call generate_dapp again with the SAME parameters PLUS confirmOverwrite=true, frontendMode="inline", and setupOptionsConfirmed=true\n\n` +
                `**Option 2: Cancel**\n` +
                `- Do not proceed with DApp generation\n\n`
              : `**Option 1: Overwrite existing files**\n` +
                `- Call generate_dapp again with the SAME parameters PLUS confirmOverwrite=true and setupOptionsConfirmed=true\n\n` +
                `**Option 2: Create in new workspace (RECOMMENDED - safer)**\n` +
                `- Call generate_dapp again with the SAME parameters BUT change frontendMode="workspace" and keep setupOptionsConfirmed=true\n` +
                `- This creates a separate workspace and keeps existing /frontend files intact\n\n` +
                `**Option 3: Cancel**\n` +
                `- Do not proceed with DApp generation\n\n`
            return this.createErrorResult(
              `⚠️ **OVERWRITE WARNING - USER CONFIRMATION REQUIRED**\n\n` +
              `The /frontend folder in workspace "${currentWs.name}" already exists and contains ${fileCount} file(s).\n\n` +
              `**These files will be PERMANENTLY DELETED and replaced with the new DApp.**\n\n` +
              `ASK THE USER which option they prefer:\n\n` +
              overwriteOptions +
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
            isBaseMiniApp: args.isBaseMiniApp,
            graphContext: args.graphContext
          })
          dappOps = new DappOperations('workspace', wsResult.workspaceName, plugin, args.contractName)
          progressSlug = wsResult.slug || wsResult.workspaceName
          remixAILogger.log('[QuickDapp] Created new workspace:', wsResult.workspaceName)
        } catch (wsErr: any) {
          remixAILogger.error('[QuickDapp] createDappWorkspace failed:', wsErr?.message || wsErr)
          return this.createErrorResult(`Failed to create DApp workspace: ${wsErr.message}`)
        }
      }

      setQuickDappWorkspaceLock({
        workspaceName: dappOps.getWorkspaceName(),
        slug: progressSlug || dappOps.getSlug(),
        operation: 'generate',
        reason: 'generate_dapp'
      })
      remixAILogger.log('[QuickDapp][WorkspaceLock] locked workspace for generation', {
        workspaceName: dappOps.getWorkspaceName(),
        slug: progressSlug || dappOps.getSlug(),
        mode: targetMode
      })

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

          // Get actual workspace name - on remixdesktop get the folder name from working directory
          let actualWorkspaceName = dappOps.getWorkspaceName()
          if (isElectron()) {
            try {
              const workingDir = await plugin.call('fs', 'getWorkingDir')
              if (workingDir) {
                actualWorkspaceName = extractNameFromKey(workingDir)
                remixAILogger.log(`[QuickDapp] Using folder name for desktop: ${actualWorkspaceName}`)
              }
            } catch (e) {
              remixAILogger.warn('[QuickDapp] Could not get working directory:', e)
            }
          }

          const timestamp = Date.now()

          const dappConfig = {
            _warning: 'DO NOT EDIT THIS FILE MANUALLY. MANAGED BY QUICK DAPP.',
            slug: dappOps.getSlug(),
            name: args.contractName,
            workspaceName: actualWorkspaceName,
            mode: 'inline',
            appKind: 'contract',
            contract: {
              name: args.contractName,
              address: args.contractAddress,
              abi: args.contractAbi,
              chainId: args.chainId,
              networkName
            },
            config: {
              title: args.contractName,
              details: typeof args.description === 'string' ? args.description : `DApp for ${args.contractName}`,
              description: args.description || `DApp for ${args.contractName}`,
              template: 'custom',
              isBaseMiniApp: !!args.isBaseMiniApp
            },
            dataSources: args.graphContext ? {
              theGraph: [args.graphContext]
            } : undefined,
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
      const progressPayload = { status: 'preparing', contractAddress: args.contractAddress, workspaceName: dappOps.getWorkspaceName(), slug: progressSlug || dappOps.getSlug() }
      plugin.emit('generationProgress', progressPayload)

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
      const figmaLine = figmaDesign
        ? `\nFIGMA: Design preflight succeeded for "${figmaDesign.fileName}"${figmaDesign.nodeId ? ` (node ${figmaDesign.nodeId})` : ''}. Use the simplified design data below as the visual reference. Do NOT call fetch_figma_design again for this URL unless the user explicitly asks.\nFIGMA DESIGN DATA:\n${figmaDesign.designData}\n`
        : ''
      const graphLine = args.graphContext
        ? buildQuickDappGraphDataSourceInstructions({ graphContext: args.graphContext })
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
      markQuickDappGenerationContext({
        workspaceName: dappOps.getWorkspaceName(),
        isInlineMode,
        sourceRoot: dappOps.getSourceRoot(),
        contractAddress: args.contractAddress,
        operation: 'generate'
      })

      return this.createSuccessResult({
        success: true,
        workspaceName: dappOps.getWorkspaceName(),
        contractAddress: args.contractAddress,
        contractName: args.contractName,
        isInlineMode,
        figmaDesignReady: !!figmaDesign,
        figmaFileName: figmaDesign?.fileName,
        workspaceReady: true,
        message: `DApp workspace "${dappOps.getWorkspaceName()}" created successfully.\n\n` +
          `Now proceed to generate the DApp files directly using write_file.\n\n` +
          `---\n` +
          `TASK: Generate a new DApp frontend${isInlineMode ? ' in /frontend folder (inline mode)' : ''}\n` +
          `CONTRACT: ${args.contractName} at ${args.contractAddress} on chain ${args.chainId}${isLocalVM ? ' (Remix VM)' : ''}\n` +
          `FUNCTIONS:\n${abiSummary}\n\n` +
          `USER DESIGN REQUEST: ${typeof args.description === 'string' ? args.description : JSON.stringify(args.description)}\n` +
          (args.isBaseMiniApp
            ? `\nBase mini-app RULES:\n` +
            `- Base mini-app is a QuickDapp packaging/deployment mode handled after file generation by the Base mini-app wizard.\n` +
            `- Do NOT import @farcaster/miniapp-sdk (deprecated). Do NOT include fc:frame or fc:miniapp meta tags.\n` +
            `- Do NOT add base:app_id meta tags, ENS/IPFS setup files, manifests, or deployment scripts. The wizard manages those later.\n` +
            `- Do NOT create or modify dapp.config.json. The system already records config.isBaseMiniApp.\n` +
            `- Use standard wallet pattern compatible with QuickDapp preview/deploy (window.__qdapp_getProvider or window.ethereum).\n` +
            `- Do NOT change the contract chain just because Base mini-app was selected. Use the contract chain listed above and the wallet rules below.\n` +
            (isInlineMode
              ? `- In inline mode, Base mini-app source files still live only under /frontend. Do NOT write root index.html or root src files.\n`
              : '')
            : '') +
          `${figmaLine}` +
          (figmaDesign
            ? `\nFIGMA DESIGN RULES:\n` +
            `- Use max-w-7xl mx-auto px-4 instead of fixed widths. Use flex-wrap for mobile responsiveness.\n` +
            `- Avoid position: absolute. Create separate component files for distinct sections.\n` +
            `- Adapt Figma dimensions to fluid/responsive code.\n`
            : '') +
          `${graphLine}` +
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
      if (dappOps?.getWorkspaceName()) {
        clearQuickDappWorkspaceLock(dappOps.getWorkspaceName())
        clearQuickDappGenerationContext(dappOps.getWorkspaceName())
      }
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
  description = 'Update an existing DApp. Direct chat prerequisite: call list_dapps first and wait for the user to select a workspace. If the prompt already provides an exact DApp update target workspaceName, that counts as the user selection and you should use that exact workspaceName without calling list_dapps. Do not substitute a different workspaceName. Do not call generate_dapp for an update.'
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
  private async resolveContractInfo(dappOps: DappOperations, args: UpdateDAppArgs, configOverride?: any): Promise<{
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
      const config = configOverride || await dappOps.readConfig()
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

  private getGraphSources(config: any): QuickDappGraphContext[] {
    const sources = config?.dataSources?.theGraph
    return Array.isArray(sources) ? sources : []
  }

  private getExistingGraphDataSourceBlock(config: any): string {
    return buildExistingGraphDataSourceBlock(this.getGraphSources(config))
  }

  /**
   * [QuickDapp] Read DApp source files from workspace recursively.
   * Only includes index.html and src/** files relative to the DApp source root.
   * Skips metadata (.deploys, .states, dapp.config.json), binary, and hidden files.
   */
  // Directories to completely skip — these contain QuickDapp metadata, not source code
  private static readonly SKIP_DIRS = new Set(['.deploys', '.states', '.git', 'node_modules', '.well-known'])
  // Files to skip at root level
  private static readonly SKIP_FILES = new Set(['dapp.config.json', 'preview.png'])

  private getScannedFilePath(currentPath: string, filePath: string): string {
    if (filePath.startsWith('/')) return filePath

    const normalizedCurrentPath = currentPath.replace(/\/+$/, '')
    if (!normalizedCurrentPath || normalizedCurrentPath === '/') return filePath

    const normalizedCurrentWithoutSlash = normalizedCurrentPath.replace(/^\/+/, '')
    const normalizedFilePath = filePath.replace(/^\/+/, '')
    if (
      normalizedFilePath === normalizedCurrentWithoutSlash ||
      normalizedFilePath.startsWith(`${normalizedCurrentWithoutSlash}/`)
    ) {
      return filePath
    }

    return `${normalizedCurrentPath}/${normalizedFilePath}`
  }

  private getSourceRelativePath(filePath: string, sourceRoot: string): string {
    const normalizePath = (path: string): string => path.replace(/^\/+/, '').replace(/\/+$/, '')
    const normalizedFilePath = normalizePath(filePath)
    const normalizedSourceRoot = normalizePath(sourceRoot)

    if (!normalizedSourceRoot) return normalizedFilePath
    if (normalizedFilePath === normalizedSourceRoot) return ''
    if (normalizedFilePath.startsWith(`${normalizedSourceRoot}/`)) {
      return normalizedFilePath.substring(normalizedSourceRoot.length + 1)
    }

    return normalizedFilePath
  }

  private async readWorkspaceFiles(plugin: Plugin, currentPath: string, files: Record<string, string>, sourceRoot = currentPath): Promise<void> {
    try {
      const dirContents = await plugin.call('fileManager' as any, 'readdir', currentPath)
      for (const [filePath, fileData] of Object.entries(dirContents as Record<string, any>)) {
        const scannedPath = this.getScannedFilePath(currentPath, filePath)
        const sourceRelativePath = this.getSourceRelativePath(scannedPath, sourceRoot)
        const topSegment = sourceRelativePath.split('/')[0]

        // Skip metadata directories entirely
        if (fileData.isDirectory) {
          if (UpdateDAppHandler.SKIP_DIRS.has(topSegment)) {
            continue
          }
          await this.readWorkspaceFiles(plugin, scannedPath, files, sourceRoot)
        } else {
          // Skip metadata files
          if (UpdateDAppHandler.SKIP_FILES.has(sourceRelativePath)) continue
          // Skip binary files
          if (/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|mp4|webm|mp3|zip|tar|gz|wasm)$/i.test(scannedPath)) continue
          // Only include source files (index.html + src/**) relative to the DApp source root.
          const isSourceFile = sourceRelativePath === 'index.html' ||
            sourceRelativePath.startsWith('src/')
          if (!isSourceFile) continue

          try {
            const content = await plugin.call('fileManager' as any, 'readFile', scannedPath)
            // Safety: skip if content is undefined, null, or not a string
            if (content === undefined || content === null || typeof content !== 'string') {
              remixAILogger.warn(`[QuickDapp] Skipping file with invalid content: ${scannedPath} (type: ${typeof content})`)
              continue
            }
            let virtualPath = scannedPath
            if (!virtualPath.startsWith('/')) virtualPath = '/' + virtualPath
            files[virtualPath] = content
          } catch (e) {
            remixAILogger.warn(`[QuickDapp] Skipping unreadable file: ${scannedPath}`)
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

      const targetConfigLookup = await readDappConfigFromWorkspace(plugin, targetWorkspace)
      if (!targetConfigLookup) {
        return this.createErrorResult(
          `Workspace "${targetWorkspace}" is not a valid DApp update target because it has no dapp.config.json. ` +
          `For direct chat, call list_dapps and ask the user to select one of the returned updatable DApps.`
        )
      }

      const targetMode = targetConfigLookup.mode
      const sourceSummary = targetConfigLookup.sourceSummary
      if (targetMode === 'workspace' && !isDedicatedDappWorkspace(targetWorkspace)) {
        remixAILogger.warn('[QuickDapp] update_dapp rejected non-DApp workspace name before switch', {
          targetWorkspace,
          targetMode,
          configPath: targetConfigLookup.configPath,
          sourceSummary
        })
        return this.createErrorResult(
          `Workspace "${targetWorkspace}" has workspace-mode DApp metadata but is not a dedicated QuickDapp workspace. ` +
          `Do not use this workspace for update_dapp. Use list_dapps and choose a workspace-mode DApp whose workspaceName starts with "dapp-", or choose an inline DApp with mode="inline".`
        )
      }

      if (!sourceSummary.updatable) {
        remixAILogger.warn('[QuickDapp] update_dapp rejected non-updatable workspace before switch', {
          targetWorkspace,
          targetMode,
          configPath: targetConfigLookup.configPath,
          sourceSummary
        })
        return this.createErrorResult(
          `Workspace "${targetWorkspace}" has DApp metadata but no source files to update. ` +
          `Do not use this workspace for update_dapp. Use list_dapps and choose an updatable DApp workspace with sourceFileCount > 0.`
        )
      }

      dappOps = new DappOperations(targetMode, targetWorkspace, plugin)
      const isInlineMode = dappOps.isInline()
      setQuickDappWorkspaceLock({
        workspaceName: dappOps.getWorkspaceName(),
        operation: 'update',
        reason: 'update_dapp'
      })
      remixAILogger.log('[QuickDapp][WorkspaceLock] locked workspace for update', {
        workspaceName: dappOps.getWorkspaceName()
      })

      // Switch to target workspace
      try {
        await switchToWorkspaceIfNeeded(plugin, dappOps.getWorkspaceName())
      } catch (e: any) {
        remixAILogger.error('[QuickDapp] Failed to switch workspace:', e?.message)
        clearQuickDappWorkspaceLock(dappOps.getWorkspaceName())
        return this.createErrorResult(`Failed to switch to workspace ${targetWorkspace}: ${e.message}`)
      }

      let configSlug: string | undefined = typeof targetConfigLookup.config?.slug === 'string'
        ? targetConfigLookup.config.slug
        : undefined
      if (configSlug) {
        remixAILogger.log(`[QuickDapp][UPDATE] Read slug from target config: ${configSlug}`)
      } else {
        try {
          const config = await dappOps.readConfig()
          configSlug = config.slug
          remixAILogger.log(`[QuickDapp][UPDATE] Read slug from config: ${configSlug}`)
        } catch (e: any) {
          remixAILogger.warn('[QuickDapp] Could not read config for slug:', e?.message)
        }
      }
      const slugToUse = configSlug || dappOps.getSlug()
      setQuickDappWorkspaceLock({
        workspaceName: dappOps.getWorkspaceName(),
        slug: slugToUse,
        operation: 'update',
        reason: 'update_dapp'
      })

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
        clearQuickDappWorkspaceLock(dappOps.getWorkspaceName())
        return this.createErrorResult('No files found in workspace. Please ensure the DApp workspace is active.')
      }

      const targetConfig = targetConfigLookup.config || {}
      const isGraphOnlyUpdate = targetConfig.appKind === 'graph-only'
      const graphDataSourceBlock = this.getExistingGraphDataSourceBlock(targetConfig)

      // Auto-resolve contract info from config for contract-backed DApps only.
      const contractResolved = isGraphOnlyUpdate
        ? undefined
        : await this.resolveContractInfo(dappOps, args, targetConfig)

      // Emit UI events
      const updateStartPayload = { workspaceName: dappOps.getWorkspaceName(), slug: slugToUse }
      const progressPayload = { status: 'preparing', contractAddress: contractResolved?.address || '', workspaceName: dappOps.getWorkspaceName(), slug: slugToUse }
      plugin.emit('dappUpdateStart', updateStartPayload)
      plugin.emit('generationProgress', progressPayload)
      markQuickDappGenerationContext({
        workspaceName: dappOps.getWorkspaceName(),
        isInlineMode,
        sourceRoot: dappOps.getSourceRoot(),
        ...(contractResolved?.address ? { contractAddress: contractResolved.address } : {}),
        operation: 'update'
      })

      // Build a concise file list (names only — no content in the main agent's context).
      // The subagent will read file contents in its own isolated context via read_file,
      // avoiding the context accumulation that causes "request entity too large" errors.
      const fileList = fileNames.join('\n')
      const description = typeof args.description === 'string' ? args.description : JSON.stringify(args.description)

      const isLocalVM = contractResolved ? isLocalVMChainId(contractResolved.chainId) : false

      // Build path examples based on mode
      const examplePaths = dappOps.resolvePath('src/App.jsx')
      const correctPathExample = `Correct: ${examplePaths}`
      const appKindLine = contractResolved
        ? `CONTRACT ADDRESS: ${contractResolved.address} on chain ${contractResolved.chainId}${isLocalVM ? ' (Remix VM)' : ''}\n`
        : `APP KIND: Graph-only read-only DApp\n`
      const buildRules = isGraphOnlyUpdate ? QUICKDAPP_GRAPH_ONLY_BUILD_RULES : QUICKDAPP_BUILD_RULES
      const logicPreservation = isGraphOnlyUpdate
        ? `LOGIC PRESERVATION (MANDATORY):\n` +
          `- This is a Graph-only read-only DApp. Update UI/source files only.\n` +
          `- NEVER add contract, wallet, provider, signer, ethers, transaction, or network switching code.\n` +
          `- NEVER convert this DApp to contract-backed or modify appKind/contract metadata.\n` +
          `- NEVER remove window.__QUICK_DAPP_CONFIG__ integration.\n` +
          `- You MAY restructure JSX layout, change CSS classes, and add read-only UI features.\n` +
          `- If the user asks to change contract address, ABI, chain, add contracts, or add transactions, do not implement that in this update. Keep the app Graph-only and explain that contract binding changes require a separate migration flow.\n` +
          `- When returning a file, return the COMPLETE file content — not just the changed portion.\n\n`
        : `LOGIC PRESERVATION (MANDATORY):\n` +
          `- NEVER remove existing ethers.js contract integrations, useState, useEffect, or ABI calls.\n` +
          `- NEVER remove wallet connection code or window.__QUICK_DAPP_CONFIG__ integration.\n` +
          `- You MAY restructure JSX layout, change CSS classes, and add new features.\n` +
          `- If the user asks to change contract address, ABI, chain, add contracts, or convert app kind, do not modify dapp.config.json or fake the config change. Explain that binding changes require a separate migration flow.\n` +
          `- When returning a file, return the COMPLETE file content — not just the changed portion.\n\n`
      const walletRules = !contractResolved
        ? ''
        : isLocalVM
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
          `- Show Connect Wallet / Disconnect / Switch Network buttons. Compare chain IDs as decimal numbers (not hex).\n`
      const finalizeInstruction = contractResolved
        ? `4. Call finalize_dapp_generation with workspaceName="${targetWorkspace}", contractAddress="${contractResolved.address}", isUpdate=true\n`
        : `4. Call finalize_dapp_generation with workspaceName="${targetWorkspace}", isUpdate=true\n`

      return this.createSuccessResult({
        success: true,
        workspaceName: dappOps.getWorkspaceName(),
        contractAddress: contractResolved?.address || '',
        workspaceReady: true,
        message: `DApp workspace "${targetWorkspace}" is ready for update.\n\n` +
          `Now proceed to update the DApp files directly.\n\n` +
          `---\n` +
          `TASK: Modify the DApp in workspace "${dappOps.getWorkspaceName()}"${isInlineMode ? ' (inline mode - /frontend folder)' : ''}\n` +
          `USER REQUEST: ${description}\n` +
          appKindLine +
          `FILES IN WORKSPACE:\n${fileList}\n\n` +
          `${buildRules}\n` +
          `\n${QUICKDAPP_DESIGN_RULES}\n` +
          graphDataSourceBlock +
          `CRITICAL PATH RULES:\n` +
          `- All file paths are relative to workspace root. Use ${examplePaths}, NOT ${dappOps.getWorkspaceName()}${examplePaths}\n` +
          `- NEVER include workspace name in paths. ${correctPathExample}\n\n` +
          logicPreservation +
          `STEPS:\n` +
          `1. Use read_file to read the files you need to modify\n` +
          `2. Modify only the relevant files using write_file\n` +
          `3. NEVER create or modify dapp.config.json — it is managed by the system.\n` +
          walletRules +
          finalizeInstruction +
          `---`
      })

    } catch (error: any) {
      remixAILogger.error('[QuickDapp] UpdateDAppHandler FAILED:', error)
      if (dappOps?.getWorkspaceName()) {
        clearQuickDappWorkspaceLock(dappOps.getWorkspaceName())
        clearQuickDappGenerationContext(dappOps.getWorkspaceName())
      }
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

      const targetConfigLookup = await readDappConfigFromWorkspace(plugin, workspaceName)
      const targetMode = targetConfigLookup ? targetConfigLookup.mode : (workspaceName?.startsWith('inline-') ? 'inline' : 'workspace')
      dappOps = new DappOperations(targetMode, workspaceName, plugin)
      const isInlineMode = dappOps.isInline()

      // Ensure we're in the correct workspace
      await switchToWorkspaceIfNeeded(plugin, dappOps.getWorkspaceName())

      // Update config status — defensively restore sourceWorkspace if agent overwrote it
      try {
        const config = targetConfigLookup?.config || await dappOps.readConfig()
        configSlug = config.slug
        remixAILogger.log(`[QuickDapp][FINALIZE] Read slug from config: ${configSlug}`)

        const isGraphConfig = config.appKind === 'graph-only' || (config.dataSources?.theGraph?.length || 0) > 0
        if (isGraphConfig && config.workspaceName && config.workspaceName !== dappOps.getWorkspaceName()) {
          config.workspaceName = dappOps.getWorkspaceName()
        }

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

        if (targetConfigLookup?.configPath) {
          await plugin.call('fileManager', 'writeFile', targetConfigLookup.configPath, JSON.stringify(config, null, 2))
        } else {
          await dappOps.writeConfig(config)
        }
        remixAILogger.log('[QuickDapp] Config updated to created')
      } catch (configErr) {
        remixAILogger.warn('[QuickDapp] Config update failed (non-critical):', configErr)
      }
      const slugToUse = configSlug || dappOps.getSlug()
      remixAILogger.log(`[QuickDapp][FINALIZE] Using slug for event: ${slugToUse}`)
      clearQuickDappWorkspaceLock(dappOps.getWorkspaceName())
      remixAILogger.log('[QuickDapp][WorkspaceLock] cleared before dappGenerated', {
        workspaceName: dappOps.getWorkspaceName(),
        slug: slugToUse
      })

      // Emit dappGenerated event — triggers UI refresh
      const generatedPayload = {
        address: contractAddress || '',
        workspaceName: dappOps.getWorkspaceName(),
        slug: slugToUse,
        isUpdate: !!isUpdate,
        isInlineMode
      }
      plugin.emit('dappGenerated', generatedPayload)
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
      clearQuickDappGenerationContext(dappOps.getWorkspaceName())

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
      if (dappOps?.getWorkspaceName()) {
        clearQuickDappWorkspaceLock(dappOps.getWorkspaceName())
        clearQuickDappGenerationContext(dappOps.getWorkspaceName())
      }
      return this.createErrorResult(`Failed to finalize DApp: ${error.message}`)
    }
  }
}

// ──────────────────────────────────────────────
// Generate Graph-only DApp Tool Handler
// ──────────────────────────────────────────────

export class GenerateGraphDAppHandler extends BaseToolHandler {
  name = 'generate_graph_dapp'
  description = 'Create a read-only QuickDapp from The Graph data only. Use this only when a validated graphContext is provided and no deployed contract should be used. This path must not compile, deploy, select, or pin contracts.'
  inputSchema = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'What the Graph-only DApp should show and how it should feel.'
      },
      graphContext: {
        type: 'object',
        description: 'Required complete The Graph data source context from a validated .subgraph handoff. Never include actual API key values.',
        properties: {
          source: { type: 'string', enum: ['subgraph-file', 'remixai-chat', 'manual']},
          filePath: { type: 'string' },
          endpoint: { type: 'string' },
          endpointKind: { type: 'string', enum: ['local', 'thegraph-gateway', 'generic-graphql']},
          endpointNeedsApiKey: { type: 'boolean' },
          apiKeySource: { type: 'string', enum: ['remix-settings', 'none']},
          subgraphId: { type: 'string' },
          network: { type: 'string' },
          description: { type: 'string' },
          query: { type: 'string' },
          variables: { type: 'object' },
          operationName: { type: 'string' },
          operationType: { type: 'string', enum: ['query', 'mutation', 'subscription']}
        },
        required: ['source', 'endpoint', 'query']
      },
      isBaseMiniApp: {
        type: 'boolean',
        description: 'Whether to mark this Graph-only DApp as a Base mini-app for the later publish wizard.'
      },
      frontendMode: {
        type: 'string',
        enum: ['workspace', 'inline'],
        description: 'Browser/web only: create in a new dedicated workspace (default) or inline in /frontend. Remix Desktop always forces inline.'
      },
      setupOptionsConfirmed: {
        type: 'boolean',
        description: 'Must be true after the user answered the setup question.'
      },
      setupOptionsSummary: {
        type: 'string',
        description: 'Short summary of the setup choices confirmed by the user.'
      },
      confirmOverwrite: {
        type: 'boolean',
        description: 'Required only for inline Graph-only generation when /frontend already contains files and the user confirmed overwrite.'
      }
    },
    required: ['description', 'graphContext']
  }

  getPermissions(): string[] {
    return ['dapp:generate', 'file:write']
  }

  validate(args: GenerateGraphDAppArgs): boolean | string {
    if (!args.description) return 'Missing required argument: description'
    if (!args.graphContext) return 'Missing required argument: graphContext'
    if (!args.graphContext.endpoint?.trim()) return 'graphContext.endpoint is required'
    if (!args.graphContext.query?.trim()) return 'graphContext.query is required'
    if (args.frontendMode && args.frontendMode !== 'workspace' && args.frontendMode !== 'inline') return 'frontendMode must be "workspace" or "inline"'
    if (/gateway\.thegraph\.com\/api\/[^/]+\/subgraphs\/id\//i.test(args.graphContext.endpoint)) {
      return 'graphContext.endpoint must not include a The Graph API key'
    }
    return true
  }

  private normalizeGraphContext(args: GenerateGraphDAppArgs): void {
    if (!args.graphContext?.endpoint?.trim()) return

    const endpoint = args.graphContext.endpoint.trim()
    const gatewayWithKeyPattern = /^https:\/\/gateway\.thegraph\.com\/api\/([^/]+)\/subgraphs\/id\/([^/?#]+).*$/i
    const gatewayWithoutKeyPattern = /^https:\/\/gateway\.thegraph\.com\/api\/subgraphs\/id\/([^/?#]+).*$/i
    const gatewayWithKeyMatch = endpoint.match(gatewayWithKeyPattern)
    const gatewayWithoutKeyMatch = endpoint.match(gatewayWithoutKeyPattern)
    const subgraphId = gatewayWithoutKeyMatch?.[1] || gatewayWithKeyMatch?.[2]

    if (!subgraphId) return

    args.graphContext.endpoint = `https://gateway.thegraph.com/api/subgraphs/id/${subgraphId}`
    args.graphContext.endpointKind = 'thegraph-gateway'
    args.graphContext.endpointNeedsApiKey = true
    args.graphContext.apiKeySource = 'remix-settings'
    args.graphContext.subgraphId = subgraphId
  }

  private getGraphOnlyName(args: GenerateGraphDAppArgs): string {
    const sourceName = args.graphContext.description || args.graphContext.operationName || args.graphContext.filePath?.split('/').pop()
    if (sourceName?.trim()) return sourceName.replace(/\.subgraph$/i, '').trim()
    return 'Graph DApp'
  }

  private getWorkspaceName(name: string): { slug: string; workspaceName: string } {
    const uniqueId = Date.now().toString(36).slice(-6)
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'graph-dapp'
    const slug = `${sanitizedName}-${uniqueId}`
    return { slug, workspaceName: `dapp-${slug}` }
  }

  async execute(args: GenerateGraphDAppArgs, plugin: Plugin): Promise<IMCPToolResult> {
    let dappOps: DappOperations | undefined

    try {
      this.normalizeGraphContext(args)
      const isDesktop = isElectron()
      const targetMode: 'workspace' | 'inline' = isDesktop ? 'inline' : (args.frontendMode || 'workspace')
      args.frontendMode = targetMode

      if (args.setupOptionsConfirmed !== true || !args.setupOptionsSummary?.trim()) {
        return this.createSuccessResult({
          success: false,
          requiresUserInput: true,
          reason: 'setup_options_required',
          message: 'Before generating files, ask the user once for Graph-only DApp setup options.',
          optionsToAsk: isDesktop
            ? [
              'Location: Inline in /frontend only for Remix Desktop',
              'Base mini-app: No (default) or Yes',
              'Design: defaults or style notes'
            ]
            : [
              'Location: Workspace (default) or Inline in /frontend',
              'Base mini-app: No (default) or Yes',
              'Design: defaults or style notes'
            ],
          defaults: {
            location: targetMode,
            isBaseMiniApp: false,
            design: 'defaults'
          },
          fixedLocation: isDesktop ? 'inline' : undefined,
          nextAction: isDesktop
            ? 'Ask only Base mini-app and Design, then STOP. Location is fixed to Inline in /frontend for Graph-only DApps on Remix Desktop. After the user answers, call generate_graph_dapp again with setupOptionsConfirmed=true, setupOptionsSummary, frontendMode="inline", isBaseMiniApp, description, and the same graphContext.'
            : 'Ask Location (Workspace default or Inline), Base mini-app, and Design, then STOP. After the user answers, call generate_graph_dapp again with setupOptionsConfirmed=true, setupOptionsSummary, frontendMode set to the chosen Location, isBaseMiniApp, description, and the same graphContext.'
        })
      }

      const sourceWorkspaceInfo = await plugin.call('filePanel' as any, 'getCurrentWorkspace')
      const sourceWorkspaceName = sourceWorkspaceInfo?.name || ''
      if (sourceWorkspaceName.startsWith('dapp-')) {
        return this.createErrorResult('Cannot create a Graph-only DApp from within a DApp workspace. Please switch to a source workspace first.')
      }
      if (!sourceWorkspaceName) {
        return this.createErrorResult('Could not determine the current source workspace for Graph-only DApp generation.')
      }

      const appName = this.getGraphOnlyName(args)
      const { slug, workspaceName } = this.getWorkspaceName(appName)
      const timestamp = Date.now()
      let targetSlug = slug

      if (targetMode === 'inline') {
        dappOps = new DappOperations('inline', sourceWorkspaceName, plugin, appName)
        targetSlug = dappOps.getSlug()

        try {
          const folderPath = dappOps.getSourceRoot().substring(1)
          const files = await plugin.call('fileManager' as any, 'readdir', folderPath)
          const fileCount = files ? Object.keys(files).length : 0

          if (fileCount > 0 && !args.confirmOverwrite) {
            remixAILogger.log(`[QuickDapp] /frontend folder exists with ${fileCount} files, requesting user confirmation`)
            return this.createErrorResult(
              `OVERWRITE WARNING - USER CONFIRMATION REQUIRED\n\n` +
              `The /frontend folder in workspace "${sourceWorkspaceName}" already exists and contains ${fileCount} file(s).\n\n` +
              `These files will be replaced with the new Graph-only DApp.\n\n` +
              `ASK THE USER which option they prefer:\n\n` +
              `Option 1: Overwrite existing files\n` +
              `- Call generate_graph_dapp again with the SAME parameters PLUS confirmOverwrite=true and setupOptionsConfirmed=true\n\n` +
              `Option 2: Cancel\n` +
              `- Do not proceed with DApp generation\n\n` +
              `Do not proceed without user confirmation.`
            )
          }
          if (fileCount > 0) {
            remixAILogger.log('[QuickDapp] User confirmed overwrite of', fileCount, 'files in /frontend')
          }
        } catch (checkErr: any) {
          const errorMsg = checkErr?.message || String(checkErr)
          if (errorMsg.includes('not exist') || errorMsg.includes('ENOENT') || errorMsg.includes('no such file')) {
            remixAILogger.log('[QuickDapp] /frontend folder does not exist, proceeding with creation')
          } else {
            remixAILogger.warn('[QuickDapp] Could not check /frontend folder:', errorMsg)
          }
        }

        let actualWorkspaceName = dappOps.getWorkspaceName()
        if (isElectron()) {
          try {
            const workingDir = await plugin.call('fs' as any, 'getWorkingDir')
            if (workingDir) {
              actualWorkspaceName = extractNameFromKey(workingDir)
              remixAILogger.log(`[QuickDapp] Using folder name for desktop Graph-only DApp: ${actualWorkspaceName}`)
            }
          } catch (e) {
            remixAILogger.warn('[QuickDapp] Could not get working directory:', e)
          }
        }

        const dappConfig = {
          _warning: 'DO NOT EDIT THIS FILE MANUALLY. MANAGED BY QUICK DAPP.',
          slug: targetSlug,
          name: appName,
          workspaceName: actualWorkspaceName,
          mode: 'inline',
          appKind: 'graph-only',
          sourceWorkspace: {
            name: sourceWorkspaceName,
            filePath: args.graphContext.filePath || ''
          },
          config: {
            title: appName,
            details: typeof args.description === 'string' ? args.description : `Graph-only DApp for ${appName}`,
            description: args.description,
            template: 'custom',
            isBaseMiniApp: !!args.isBaseMiniApp
          },
          dataSources: {
            theGraph: [args.graphContext]
          },
          status: 'creating',
          createdAt: timestamp,
          updatedAt: timestamp,
          processingStartedAt: timestamp
        }

        await dappOps.ensureBaseDir()
        await plugin.call('fileManager' as any, 'writeFile', 'dapp.config.json', JSON.stringify(dappConfig, null, 2))
      } else {
        await plugin.call('filePanel' as any, 'createWorkspace', workspaceName, true)
        await switchToWorkspaceIfNeeded(plugin, workspaceName)
        await new Promise(r => setTimeout(r, 300))

        const activeWorkspaceAfterSwitch = await plugin.call('filePanel' as any, 'getCurrentWorkspace')
        if (activeWorkspaceAfterSwitch?.name !== workspaceName) {
          throw new Error(`Graph-only DApp workspace switch failed. Expected "${workspaceName}", got "${activeWorkspaceAfterSwitch?.name || 'unknown'}".`)
        }

        dappOps = new DappOperations('workspace', workspaceName, plugin, appName)

        const dappConfig = {
          _warning: 'DO NOT EDIT THIS FILE MANUALLY. MANAGED BY QUICK DAPP.',
          slug,
          name: appName,
          workspaceName,
          mode: 'workspace',
          appKind: 'graph-only',
          sourceWorkspace: {
            name: sourceWorkspaceName,
            filePath: args.graphContext.filePath || ''
          },
          config: {
            title: appName,
            details: typeof args.description === 'string' ? args.description : `Graph-only DApp for ${appName}`,
            description: args.description,
            template: 'custom',
            isBaseMiniApp: !!args.isBaseMiniApp
          },
          dataSources: {
            theGraph: [args.graphContext]
          },
          status: 'creating',
          createdAt: timestamp,
          updatedAt: timestamp,
          processingStartedAt: timestamp
        }

        await plugin.call('fileManager' as any, 'writeFile', 'dapp.config.json', JSON.stringify(dappConfig, null, 2))
        try {
          await plugin.call('fileManager' as any, 'mkdir', 'src')
        } catch {
          // ignore if src already exists
        }
      }

      setQuickDappWorkspaceLock({
        workspaceName: dappOps.getWorkspaceName(),
        slug: targetSlug,
        operation: 'generate',
        reason: 'generate_graph_dapp'
      })
      markQuickDappGenerationContext({
        workspaceName: dappOps.getWorkspaceName(),
        isInlineMode: dappOps.isInline(),
        sourceRoot: dappOps.getSourceRoot(),
        operation: 'generate'
      })

      plugin.emit('generationProgress', { status: 'preparing', workspaceName: dappOps.getWorkspaceName(), slug: targetSlug })

      try {
        await plugin.call('manager' as any, 'activatePlugin', 'quick-dapp-v2')
        await plugin.call('tabs' as any, 'focus', 'quick-dapp-v2')
        await new Promise(r => setTimeout(r, 300))
      } catch {
        // Non-critical; generation can continue without focusing the dashboard.
      }

      const graphLine = buildQuickDappGraphDataSourceInstructions({ graphContext: args.graphContext, graphOnly: true })
      const isGraphInlineMode = dappOps.isInline()
      const targetWorkspaceForInstructions = dappOps.getWorkspaceName()
      const fileWritePaths = isGraphInlineMode
        ? '/frontend/index.html, /frontend/src/main.jsx, /frontend/src/App.jsx, /frontend/src/index.css'
        : '/index.html, /src/main.jsx, /src/App.jsx, /src/index.css'

      return this.createSuccessResult({
        success: true,
        workspaceName: targetWorkspaceForInstructions,
        isGraphOnly: true,
        isInlineMode: isGraphInlineMode,
        workspaceReady: true,
        message: `Graph-only DApp target "${targetWorkspaceForInstructions}" prepared successfully.\n\n` +
          `Now generate the DApp files directly using write_file.\n\n` +
          `---\n` +
          `TASK: Generate a new Graph-only read-only DApp frontend${isGraphInlineMode ? ' in /frontend folder (inline mode)' : ''}\n` +
          `APP NAME: ${appName}\n` +
          `USER DESIGN REQUEST: ${typeof args.description === 'string' ? args.description : JSON.stringify(args.description)}\n` +
          (args.isBaseMiniApp
            ? `\nBase mini-app RULES:\n` +
            `- Base mini-app is a QuickDapp packaging/deployment mode handled after file generation by the Base mini-app wizard.\n` +
            `- Do NOT import @farcaster/miniapp-sdk. Do NOT include fc:frame or fc:miniapp meta tags.\n` +
            `- Do NOT add base:app_id meta tags, ENS/IPFS setup files, manifests, or deployment scripts. The wizard manages those later.\n`
            : '') +
          `${graphLine}` +
          `\n${QUICKDAPP_GRAPH_ONLY_BUILD_RULES}\n` +
          `\n${QUICKDAPP_DESIGN_RULES}\n` +
          `CRITICAL PATH RULES:\n` +
          `- All file paths are relative to workspace root. Use ${fileWritePaths}.\n` +
          `- NEVER include workspace name "${targetWorkspaceForInstructions}" in paths.\n\n` +
          `STEPS:\n` +
          `1. Write files using write_file: ${fileWritePaths}\n` +
          `2. Do not create contract or wallet UI.\n` +
          `3. NEVER create or modify dapp.config.json — it is managed by the system.\n` +
          `4. After ALL files are written, call finalize_dapp_generation with workspaceName="${targetWorkspaceForInstructions}" only.\n` +
          `---`
      })
    } catch (error: any) {
      if (dappOps?.getWorkspaceName()) {
        clearQuickDappWorkspaceLock(dappOps.getWorkspaceName())
        clearQuickDappGenerationContext(dappOps.getWorkspaceName())
      }
      plugin.emit('dappGenerationError', {
        workspaceName: dappOps?.getWorkspaceName(),
        error: error.message
      })
      return this.createErrorResult(`Failed to create Graph-only DApp: ${error.message}`)
    }
  }
}

// ──────────────────────────────────────────────
// List DApps Tool Handler
// ──────────────────────────────────────────────

export class ListDAppsHandler extends BaseToolHandler {
  name = 'list_dapps'
  description = 'List existing DApp workspaces with their contract info, status, and workspace names. Use this first for direct chat requests when the user has not already provided an exact DApp workspaceName. If the prompt already names an exact DApp update target workspaceName, do not use this tool just to reconfirm.'
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
          const configLookup = await readDappConfigFromWorkspace(plugin, wsName)
          if (!configLookup) continue

          const config = configLookup.config
          const mode = configLookup.mode
          const isInlineMode = mode === 'inline'
          const sourceSummary = configLookup.sourceSummary
          if (mode === 'workspace' && !isDedicatedDappWorkspace(wsName)) {
            remixAILogger.warn('[QuickDapp] list_dapps skipped non-dedicated workspace-mode DApp metadata workspace', {
              workspaceName: wsName,
              configPath: configLookup.configPath,
              mode,
              sourceSummary
            })
            continue
          }

          if (!sourceSummary.updatable) {
            remixAILogger.warn('[QuickDapp] list_dapps skipped non-updatable DApp metadata workspace', {
              workspaceName: wsName,
              configPath: configLookup.configPath,
              mode,
              sourceSummary
            })
            continue
          }

          dapps.push({
            workspaceName: wsName,
            name: config.name || 'Untitled',
            contractAddress: config.contract?.address || 'unknown',
            contractName: config.contract?.name || 'unknown',
            chainId: config.contract?.chainId || 'unknown',
            networkName: config.contract?.networkName || '',
            status: config.status || 'unknown',
            createdAt: config.createdAt || 0,
            isInlineMode,
            mode,
            sourceRoot: sourceSummary.sourceRoot,
            sourceFileCount: sourceSummary.sourceFileCount,
            sourceFiles: sourceSummary.sourceFiles,
            updatable: sourceSummary.updatable
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
        message: `Found ${dapps.length} updatable DApp(s). Present this list to the user and ask which one they want to work with. Include the exact workspaceName, DApp name, contract name, contract address, status, and mode for each. When the user selects one, call update_dapp with that exact workspaceName.`
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
      const result = await fetchAndSimplifyFigmaDesign(args.figmaUrl, args.figmaToken)
      if (isFigmaDesignFailure(result)) {
        return this.createErrorResult(result.message)
      }

      remixAILogger.log(`[QuickDapp] Figma design fetched: ${result.fileName}, size: ${result.rawLength}`)

      return this.createSuccessResult({
        success: true,
        fileName: result.fileName,
        fileKey: result.fileKey,
        nodeId: result.nodeId,
        designData: result.designData,
        truncated: result.truncated,
        message: `Figma design "${result.fileName}" loaded successfully. Use the design data above to match the layout, colors, and typography when generating DApp files.`
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
      description: 'List all existing DApp workspaces. For direct chat requests with no exact target workspaceName, call this before update_dapp, present only updatable DApps as a numbered list, and ask the user to select one. If the prompt already contains an exact DApp update target workspaceName, do not call this tool just to reconfirm.',
      inputSchema: new ListDAppsHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:read'],
      handler: new ListDAppsHandler()
    },
    {
      name: 'generate_dapp',
      description: 'Set up a new DApp frontend from a deployed smart contract. STRICT PREREQUISITE: never call this in the same assistant turn where setup options are asked. First ask only the required setup options, then stop. If the current prompt or tool result says Location is fixed, do not ask Location; otherwise ask Location Workspace(default)/Inline. Always ask Base mini-app No(default)/Yes, Design defaults/style notes/Figma URL, and Subgraph None(default)/.subgraph file path or name. Do not ask Theme, Primary Color, DApp Title, Layout, or other design subquestions. Call only after the user replies, with setupOptionsConfirmed=true and a non-empty setupOptionsSummary. If a .subgraph file is chosen in contract-first flow, pass subgraphFilePath. Returns generation instructions — you MUST then write each DApp file using write_file, then call finalize_dapp_generation.',
      inputSchema: new GenerateDAppHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:generate', 'file:write'],
      handler: new GenerateDAppHandler()
    },
    {
      name: 'generate_graph_dapp',
      description: 'Set up a new read-only Graph-only DApp from a validated graphContext when no deployed contract should be used. Never use this for contract-backed DApps. Browser/web may use frontendMode="workspace" (default) or frontendMode="inline"; Remix Desktop always uses inline /frontend mode. Returns generation instructions — you MUST then write each DApp file using write_file, then call finalize_dapp_generation with workspaceName only.',
      inputSchema: new GenerateGraphDAppHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:generate', 'file:write'],
      handler: new GenerateGraphDAppHandler()
    },
    {
      name: 'finalize_dapp_generation',
      description: 'Finalize a DApp after ALL files have been written using write_file. Updates config, refreshes dashboard, and opens DApp preview. MUST be called after generate_dapp or generate_graph_dapp + write_file sequence.',
      inputSchema: new FinalizeDAppGenerationHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['dapp:generate', 'file:write'],
      handler: new FinalizeDAppGenerationHandler()
    },
    {
      name: 'update_dapp',
      description: 'Update an existing DApp. Direct chat prerequisite: call list_dapps and receive the user\'s explicit workspace selection. If the prompt already includes an exact DApp update target workspaceName, use that exact workspaceName directly. Never substitute another workspaceName or call generate_dapp for an update. Requires workspaceName and description.',
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
