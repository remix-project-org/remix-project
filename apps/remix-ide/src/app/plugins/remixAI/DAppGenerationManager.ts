import { GenerationParams, IParams } from '@remix/remix-ai-core'
import type { IRemixAIPlugin } from './types'

export interface DAppGenerationManagerDeps {
  plugin: IRemixAIPlugin
}

export class DAppGenerationManager {
  private deps: DAppGenerationManagerDeps

  constructor(deps: DAppGenerationManagerDeps) {
    this.deps = deps
  }

  async generateDAppContent(params: {
    messages: any[];
    systemPrompt: string;
    hasImage?: boolean;
    isUpdate?: boolean;
    hasFigma?: boolean;
  }): Promise<string> {
    const plugin = this.deps.plugin

    try {
      if (!plugin.deepAgentEnabled || !plugin.deepAgentInferencer) {
        throw new Error('DeepAgent not enabled')
      }

      console.log('[QuickDapp] generateDAppContent called', {
        messageCount: params.messages.length,
        hasImage: params.hasImage,
        isUpdate: params.isUpdate,
        hasFigma: params.hasFigma
      })

      // Extract the user message content from messages
      const lastUserMessage = params.messages[params.messages.length - 1]
      let userContent = ''
      let imageBase64: string | undefined

      if (lastUserMessage) {
        if (typeof lastUserMessage.content === 'string') {
          userContent = lastUserMessage.content
        } else if (Array.isArray(lastUserMessage.content)) {
          // Handle multimodal content (text + image)
          for (const part of lastUserMessage.content) {
            if (part.type === 'text') {
              userContent += part.text
            } else if (part.type === 'image_url' && part.image_url?.url) {
              imageBase64 = part.image_url.url
            }
          }
        }
      }

      // Call DeepAgent with DApp Generator context
      const generationParams: IParams = {
        ...GenerationParams,
        stream: false,
        stream_result: false,
        return_stream_response: false,
        provider: 'anthropic',
        model: 'claude-sonnet-4-5'
      }

      // Use DeepAgent answer method with the custom system prompt
      const result = await plugin.deepAgentInferencer.answerWithCustomSystemPrompt(
        userContent,
        params.systemPrompt,
        generationParams,
        imageBase64
      )

      if (!result) {
        throw new Error('No response from DeepAgent')
      }

      console.log('[QuickDapp] generateDAppContent result length:', result.length)
      return result

    } catch (error: any) {
      console.error('[QuickDapp] generateDAppContent error:', error)
      throw error // Re-throw so callers can handle the error
    }
  }

  async fetchFigmaDesign(params: {
    figmaUrl: string;
    figmaToken: string;
  }): Promise<{ success: boolean; fileName?: string; rawJson?: string; fileKey?: string; message?: string }> {
    try {
      // Parse Figma URL to extract file key
      const patterns = [
        /figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/,
        /figma\.com\/proto\/([a-zA-Z0-9]+)/
      ]

      let fileKey: string | null = null
      for (const pattern of patterns) {
        const match = params.figmaUrl.match(pattern)
        if (match) {
          fileKey = match[1]
          break
        }
      }

      if (!fileKey) {
        return { success: false, message: 'Invalid Figma URL format' }
      }

      // Fetch from Figma API
      const apiUrl = `https://api.figma.com/v1/files/${fileKey}`
      const response = await fetch(apiUrl, {
        headers: {
          'X-Figma-Token': params.figmaToken
        }
      })

      if (!response.ok) {
        if (response.status === 403) {
          return { success: false, message: 'Figma API access denied. Please check your Personal Access Token.' }
        }
        if (response.status === 404) {
          return { success: false, message: 'Figma file not found. Please check the URL.' }
        }
        return { success: false, message: `Figma API error: ${response.statusText}` }
      }

      const figmaData = await response.json()

      // Extract relevant design data
      const simplifyNode = (node: any, depth: number = 0): any => {
        if (depth > 5) return null

        const simplified: any = {
          name: node.name,
          type: node.type
        }

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
          const simplifiedChildren = node.children
            .map((child: any) => simplifyNode(child, depth + 1))
            .filter(Boolean)

          if (simplifiedChildren.length > 0) {
            simplified.children = simplifiedChildren
          }
        }

        return simplified
      }

      const simplifiedDocument = simplifyNode(figmaData.document)
      const rawJson = JSON.stringify(simplifiedDocument, null, 2)

      // Truncate if too large
      const maxJsonLength = 100000
      const truncatedJson = rawJson.length > maxJsonLength
        ? rawJson.substring(0, maxJsonLength) + '\n... [truncated for token limit]'
        : rawJson

      console.log('[QuickDapp] fetchFigmaDesign success:', figmaData.name)

      return {
        success: true,
        fileKey,
        fileName: figmaData.name || 'Untitled',
        rawJson: truncatedJson
      }
    } catch (error: any) {
      console.error('[QuickDapp] fetchFigmaDesign error:', error)
      return { success: false, message: error.message || 'Failed to fetch Figma design' }
    }
  }

  async generateDAppFromFigma(params: {
    figmaUrl: string;
    figmaToken: string;
    description?: string;
    systemPrompt: string;
    isBaseMiniApp?: boolean;
  }): Promise<string> {
    try {
      // First fetch the Figma design
      const figmaResult = await this.fetchFigmaDesign({
        figmaUrl: params.figmaUrl,
        figmaToken: params.figmaToken
      })

      if (!figmaResult.success) {
        throw new Error(figmaResult.message || 'Failed to fetch Figma design')
      }

      // Build description with Figma context
      const enrichedDescription = `
${params.description || 'Implement the design exactly as shown in the Figma file.'}

**FIGMA DESIGN DATA:**
File: ${figmaResult.fileName}
${figmaResult.rawJson}
`

      // Generate DApp with Figma data
      return await this.generateDAppContent({
        messages: [{ role: 'user', content: enrichedDescription }],
        systemPrompt: params.systemPrompt,
        hasImage: false,
        hasFigma: true
      })
    } catch (error: any) {
      console.error('[QuickDapp] generateDAppFromFigma error:', error)
      throw error
    }
  }
}
