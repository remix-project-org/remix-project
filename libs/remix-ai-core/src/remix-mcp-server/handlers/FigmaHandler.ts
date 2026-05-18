/**
 * Figma Integration Tool Handlers for Remix MCP Server
 *
 * Provides tools for fetching and processing Figma designs
 * for use in DApp generation workflows.
 */

import { IMCPToolResult } from '../../types/mcp'
import { BaseToolHandler } from '../registry/RemixToolRegistry'
import { ToolCategory, RemixToolDefinition } from '../types/mcpTools'
import { Plugin } from '@remixproject/engine'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface FetchFigmaDesignArgs {
  figmaUrl: string
  figmaToken: string
}

export interface FigmaColor {
  r: number
  g: number
  b: number
  a?: number
}

export interface FigmaTypography {
  fontFamily: string
  fontWeight: number
  fontSize: number
  lineHeight?: number
  letterSpacing?: number
}

export interface FigmaComponent {
  id: string
  name: string
  type: string
  x?: number
  y?: number
  width?: number
  height?: number
  fills?: any[]
  strokes?: any[]
  effects?: any[]
  children?: FigmaComponent[]
}

export interface FigmaPage {
  id: string
  name: string
  children: FigmaComponent[]
}

export interface FigmaStyles {
  colors: Record<string, string> // name -> hex
  typography: Record<string, FigmaTypography>
}

export interface FigmaDesignResult {
  success: boolean
  fileKey: string
  fileName: string
  pages: FigmaPage[]
  components: FigmaComponent[]
  styles: FigmaStyles
  rawJson: string // Truncated JSON for prompt context
  message?: string
}

// ──────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────

/**
 * Parse Figma URL to extract file key and optional node IDs
 */
function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } | null {
  // Match various Figma URL formats:
  // https://www.figma.com/file/FILEKEY/...
  // https://www.figma.com/design/FILEKEY/...
  // https://figma.com/file/FILEKEY/...?node-id=X-Y
  const patterns = [
    /figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/,
    /figma\.com\/proto\/([a-zA-Z0-9]+)/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) {
      const fileKey = match[1]

      // Extract node-id if present
      const nodeIdMatch = url.match(/[?&]node-id=([^&]+)/)
      const nodeId = nodeIdMatch ? decodeURIComponent(nodeIdMatch[1]) : undefined

      return { fileKey, nodeId }
    }
  }

  return null
}

/**
 * Convert Figma color (0-1 range) to hex string
 */
function figmaColorToHex(color: FigmaColor): string {
  const r = Math.round((color.r || 0) * 255)
  const g = Math.round((color.g || 0) * 255)
  const b = Math.round((color.b || 0) * 255)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Extract colors from Figma document styles
 */
function extractColors(document: any): Record<string, string> {
  const colors: Record<string, string> = {}

  // Extract from document styles
  if (document.styles) {
    for (const [styleId, style] of Object.entries(document.styles as Record<string, any>)) {
      if (style.styleType === 'FILL') {
        colors[style.name || styleId] = styleId // Will be resolved later
      }
    }
  }

  return colors
}

/**
 * Extract typography styles from Figma document
 */
function extractTypography(document: any): Record<string, FigmaTypography> {
  const typography: Record<string, FigmaTypography> = {}

  if (document.styles) {
    for (const [styleId, style] of Object.entries(document.styles as Record<string, any>)) {
      if (style.styleType === 'TEXT') {
        typography[style.name || styleId] = {
          fontFamily: 'Inter', // Default, would need node traversal for actual values
          fontWeight: 400,
          fontSize: 16
        }
      }
    }
  }

  return typography
}

/**
 * Recursively extract components from Figma node tree
 */
function extractComponents(node: any, depth: number = 0): FigmaComponent[] {
  const components: FigmaComponent[] = []

  // Skip if too deep (prevent excessive nesting)
  if (depth > 10) return components

  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE') {
    components.push({
      id: node.id,
      name: node.name,
      type: node.type,
      x: node.absoluteBoundingBox?.x,
      y: node.absoluteBoundingBox?.y,
      width: node.absoluteBoundingBox?.width,
      height: node.absoluteBoundingBox?.height,
      fills: node.fills,
      strokes: node.strokes,
      effects: node.effects
    })
  }

  // Recursively process children
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      components.push(...extractComponents(child, depth + 1))
    }
  }

  return components
}

/**
 * Simplify Figma node tree for prompt context (reduce token usage)
 */
function simplifyNodeTree(node: any, depth: number = 0): any {
  if (depth > 5) return null // Limit depth for token savings

  const simplified: any = {
    name: node.name,
    type: node.type
  }

  // Include bounding box for layout understanding
  if (node.absoluteBoundingBox) {
    simplified.bounds = {
      w: Math.round(node.absoluteBoundingBox.width),
      h: Math.round(node.absoluteBoundingBox.height)
    }
  }

  // Include fill colors
  if (node.fills && node.fills.length > 0) {
    const solidFill = node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false)
    if (solidFill?.color) {
      simplified.fill = figmaColorToHex(solidFill.color)
    }
  }

  // Include text content
  if (node.type === 'TEXT' && node.characters) {
    simplified.text = node.characters.substring(0, 100) // Truncate long text
  }

  // Recursively process children
  if (node.children && Array.isArray(node.children)) {
    const simplifiedChildren = node.children
      .map((child: any) => simplifyNodeTree(child, depth + 1))
      .filter(Boolean)

    if (simplifiedChildren.length > 0) {
      simplified.children = simplifiedChildren
    }
  }

  return simplified
}

// ──────────────────────────────────────────────
// Fetch Figma Design Tool Handler
// ──────────────────────────────────────────────

export class FetchFigmaDesignHandler extends BaseToolHandler {
  name = 'fetch_figma_design'
  description = 'Fetch a Figma design file and extract structured design data including components, colors, and typography for DApp generation.'
  inputSchema = {
    type: 'object',
    properties: {
      figmaUrl: {
        type: 'string',
        description: 'Figma file URL (e.g., https://www.figma.com/file/FILEKEY/...)'
      },
      figmaToken: {
        type: 'string',
        description: 'Figma Personal Access Token for API authentication'
      }
    },
    required: ['figmaUrl', 'figmaToken']
  }

  getPermissions(): string[] {
    return ['figma:read']
  }

  validate(args: FetchFigmaDesignArgs): boolean | string {
    const required = this.validateRequired(args, ['figmaUrl', 'figmaToken'])
    if (required !== true) return required

    // Validate Figma URL format
    const parsed = parseFigmaUrl(args.figmaUrl)
    if (!parsed) {
      return 'Invalid Figma URL format. Expected: https://www.figma.com/file/FILEKEY/... or https://www.figma.com/design/FILEKEY/...'
    }

    if (!args.figmaToken || args.figmaToken.length < 10) {
      return 'Invalid Figma token. Please provide a valid Personal Access Token.'
    }

    return true
  }

  async execute(args: FetchFigmaDesignArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Parse the Figma URL
      const parsed = parseFigmaUrl(args.figmaUrl)
      if (!parsed) {
        return this.createErrorResult('Failed to parse Figma URL')
      }

      const { fileKey, nodeId } = parsed

      // Fetch the Figma file from API
      const apiUrl = `https://api.figma.com/v1/files/${fileKey}`
      const response = await fetch(apiUrl, {
        headers: {
          'X-Figma-Token': args.figmaToken
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        if (response.status === 403) {
          return this.createErrorResult('Figma API access denied. Please check your Personal Access Token.')
        }
        if (response.status === 404) {
          return this.createErrorResult('Figma file not found. Please check the URL.')
        }
        return this.createErrorResult(`Figma API error: ${errorText}`)
      }

      const figmaData = await response.json()

      // Extract pages
      const pages: FigmaPage[] = []
      if (figmaData.document?.children) {
        for (const page of figmaData.document.children) {
          if (page.type === 'CANVAS') {
            pages.push({
              id: page.id,
              name: page.name,
              children: page.children || []
            })
          }
        }
      }

      // Extract components
      const components = extractComponents(figmaData.document)

      // Extract styles
      const styles: FigmaStyles = {
        colors: extractColors(figmaData),
        typography: extractTypography(figmaData)
      }

      // Create simplified JSON for prompt context
      const simplifiedDocument = simplifyNodeTree(figmaData.document)
      const rawJson = JSON.stringify(simplifiedDocument, null, 2)

      // Truncate if too large (aim for ~100k characters to leave room for prompts)
      const maxJsonLength = 100000
      const truncatedJson = rawJson.length > maxJsonLength
        ? rawJson.substring(0, maxJsonLength) + '\n... [truncated for token limit]'
        : rawJson

      const result: FigmaDesignResult = {
        success: true,
        fileKey,
        fileName: figmaData.name || 'Untitled',
        pages,
        components,
        styles,
        rawJson: truncatedJson,
        message: `Fetched Figma design "${figmaData.name}" with ${pages.length} pages and ${components.length} components`
      }

      return this.createSuccessResult(result)

    } catch (error: any) {
      if (error.message.includes('fetch')) {
        return this.createErrorResult('Network error: Unable to connect to Figma API')
      }
      return this.createErrorResult(`Figma fetch failed: ${error.message}`)
    }
  }
}

// ──────────────────────────────────────────────
// Generate DApp from Figma Tool Handler
// ──────────────────────────────────────────────

export interface GenerateDAppFromFigmaArgs {
  figmaUrl: string
  figmaToken: string
  description?: string
  contractAddress: string
  contractAbi: any[]
  chainId: number | string
  contractName: string
  isBaseMiniApp?: boolean
  workspaceName?: string
}

export class GenerateDAppFromFigmaHandler extends BaseToolHandler {
  name = 'generate_dapp_from_figma'
  description = 'Generate a DApp frontend directly from a Figma design. Combines Figma fetching with DApp generation.'
  inputSchema = {
    type: 'object',
    properties: {
      figmaUrl: {
        type: 'string',
        description: 'Figma file URL'
      },
      figmaToken: {
        type: 'string',
        description: 'Figma Personal Access Token'
      },
      description: {
        type: 'string',
        description: 'Additional instructions for the DApp generation'
      },
      contractAddress: {
        type: 'string',
        description: 'Deployed contract address',
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
      contractName: {
        type: 'string',
        description: 'Name of the contract'
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
    required: ['figmaUrl', 'figmaToken', 'contractAddress', 'contractAbi', 'chainId', 'contractName']
  }

  getPermissions(): string[] {
    return ['figma:read', 'dapp:generate', 'file:write']
  }

  validate(args: GenerateDAppFromFigmaArgs): boolean | string {
    const required = this.validateRequired(args, ['figmaUrl', 'figmaToken', 'contractAddress', 'contractAbi', 'chainId', 'contractName'])
    if (required !== true) return required

    const parsed = parseFigmaUrl(args.figmaUrl)
    if (!parsed) {
      return 'Invalid Figma URL format'
    }

    if (!args.contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format'
    }

    return true
  }

  async execute(args: GenerateDAppFromFigmaArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Step 1: Fetch Figma design
      plugin.emit('generationProgress', { status: 'fetching_figma', contractAddress: args.contractAddress })

      const figmaHandler = new FetchFigmaDesignHandler()
      const figmaResult = await figmaHandler.execute({
        figmaUrl: args.figmaUrl,
        figmaToken: args.figmaToken
      }, plugin)

      if (figmaResult.isError) {
        return figmaResult
      }

      // Parse the Figma result
      const figmaContent = JSON.parse(figmaResult.content[0].text)
      if (!figmaContent.success) {
        return this.createErrorResult('Failed to fetch Figma design')
      }

      // Step 2: Generate DApp with Figma data
      plugin.emit('generationProgress', { status: 'generating', contractAddress: args.contractAddress })

      // Call generate_dapp with Figma context embedded in description
      const enrichedDescription = `
${args.description || 'Implement the design exactly as shown in the Figma file.'}

**FIGMA DESIGN DATA:**
File: ${figmaContent.fileName}
${figmaContent.rawJson}
`

      // Use the remixAI plugin to generate the DApp
      const response = await plugin.call('remixAI' as any, 'generateDAppFromFigma', {
        description: enrichedDescription,
        contractAddress: args.contractAddress,
        contractAbi: args.contractAbi,
        chainId: args.chainId,
        contractName: args.contractName,
        isBaseMiniApp: args.isBaseMiniApp,
        figmaData: figmaContent,
        workspaceName: args.workspaceName
      })

      return this.createSuccessResult(response)

    } catch (error: any) {
      return this.createErrorResult(`DApp generation from Figma failed: ${error.message}`)
    }
  }
}

// ──────────────────────────────────────────────
// Tool Definition Factory
// ──────────────────────────────────────────────

export function createFigmaTools(): RemixToolDefinition[] {
  return [
    {
      name: 'fetch_figma_design',
      description: 'Fetch a Figma design file and extract structured design data including components, colors, and typography for DApp generation.',
      inputSchema: new FetchFigmaDesignHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['figma:read'],
      handler: new FetchFigmaDesignHandler()
    },
    {
      name: 'generate_dapp_from_figma',
      description: 'Generate a DApp frontend directly from a Figma design. Combines Figma fetching with DApp generation.',
      inputSchema: new GenerateDAppFromFigmaHandler().inputSchema,
      category: ToolCategory.WORKSPACE,
      permissions: ['figma:read', 'dapp:generate', 'file:write'],
      handler: new GenerateDAppFromFigmaHandler()
    }
  ]
}
