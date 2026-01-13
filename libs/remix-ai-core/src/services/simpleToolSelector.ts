import { IMCPTool } from "../types/mcp"

export interface IToolSelectionResult {
  selectedTools: IMCPTool[];
  detectedCategories: string[];
  method: 'nlp' | 'keyword' | 'fallback';
  confidence?: number;
}

interface IScoredTool {
  tool: IMCPTool;
  score: number;
  matchDetails: {
    nameMatch: number;
    descriptionMatch: number;
    parameterMatch: number;
    categoryMatch: number;
  };
}

export class SimpleToolSelector {
  // Core tools ALWAYS included (essential utilities)
  private coreTools = ['file_read', 'file_write', 'directory_list', 'solidity_compile', 'get_compilation_result']

  // Keyword → Category mappings (for category-based scoring)
  private keywordMap: Record<string, string[]> = {
    // Compilation keywords
    'compile': ['compilation', 'file_management'],
    'compiler': ['compilation'],
    'solidity': ['compilation', 'file_management', 'analysis'],
    'vyper': ['compilation', 'file_management'],

    // Deployment keywords
    'deploy': ['deployment', 'file_management'],
    'contract': ['deployment', 'compilation'],
    'transaction': ['deployment'],
    'balance': ['deployment'],
    'account': ['deployment'],
    'environment': ['deployment'],

    // Debugging keywords
    'debug': ['debugging', 'deployment'],
    'breakpoint': ['debugging'],
    'step': ['debugging'],
    'watch': ['debugging'],

    // File operations
    'read': ['file_management'],
    'write': ['file_management'],
    'file': ['file_management'],
    'directory': ['file_management'],
    'folder': ['file_management'],

    // Testing
    'test': ['testing', 'file_management'],

    // Git
    'git': ['git', 'file_management'],
    'commit': ['git'],
    'push': ['git'],
    'pull': ['git'],

    // Analysis
    'scan': ['analysis'],
    'analyze': ['analysis'],
    'audit': ['analysis']
  }

  selectTools(
    allTools: IMCPTool[],
    userPrompt: string,
    maxTools: number = 15
  ): IMCPTool[] {
    console.log('[SimpleToolSelector] Using keyword-based selection', allTools)
    return this.selectToolsWithKeywords(allTools, userPrompt, maxTools)
  }

  private selectToolsWithKeywords(
    allTools: IMCPTool[],
    userPrompt: string,
    maxTools: number
  ): IMCPTool[] {
    const minToolsThreshold = 6
    const minScoreThreshold = 0.1 // Minimum 10% relevance score

    // Extract search tokens from user prompt
    const promptTokens = this.extractTokens(userPrompt)
    console.log('[SimpleToolSelector] Prompt tokens:', promptTokens.join(', '))

    // Score all tools against the prompt
    const scoredTools: IScoredTool[] = allTools.map(tool => ({
      tool,
      score: 0,
      matchDetails: this.scoreTool(tool, promptTokens, userPrompt)
    }))

    // Calculate total score for each tool
    scoredTools.forEach(st => {
      const weights = {
        nameMatch: 3.0, // Tool name is most important
        descriptionMatch: 2.0, // Description is second
        parameterMatch: 1.5, // Parameters are useful
        categoryMatch: 1.0 // Category is least specific
      }

      st.score =
        st.matchDetails.nameMatch * weights.nameMatch +
        st.matchDetails.descriptionMatch * weights.descriptionMatch +
        st.matchDetails.parameterMatch * weights.parameterMatch +
        st.matchDetails.categoryMatch * weights.categoryMatch
    })

    // Always include core tools with bonus score
    scoredTools.forEach(st => {
      if (this.coreTools.includes(st.tool.name)) {
        st.score += 1.0 // Bonus for core tools
      }
    })

    // Sort by score descending
    scoredTools.sort((a, b) => b.score - a.score)

    // Filter tools above threshold
    const relevantTools = scoredTools.filter(st => st.score > minScoreThreshold)

    // Log top matches
    const topTools = relevantTools.slice(0, 5)
    console.log('[SimpleToolSelector] Top matches:')
    topTools.forEach(st => {
      console.log(`  - ${st.tool.name}: ${st.score.toFixed(2)} (name:${st.matchDetails.nameMatch.toFixed(1)} desc:${st.matchDetails.descriptionMatch.toFixed(1)} params:${st.matchDetails.parameterMatch.toFixed(1)} cat:${st.matchDetails.categoryMatch.toFixed(1)})`)
    })

    // Calculate confidence
    const avgScore = relevantTools.length > 0
      ? relevantTools.reduce((sum, st) => sum + st.score, 0) / relevantTools.length
      : 0
    const confidence = Math.min(Math.round(avgScore * 10), 100)

    console.log(`[SimpleToolSelector] Matching confidence: ${confidence}% (${relevantTools.length}/${allTools.length} tools above threshold)`)
    console.log(`[SimpleToolSelector] Threshold: minimum ${minToolsThreshold} tools required, score > ${minScoreThreshold}`)

    // If too few tools matched, return only core tools
    if (relevantTools.length < minToolsThreshold) {
      const coreToolsOnly = allTools.filter(tool => this.coreTools.includes(tool.name))
      console.log(`[SimpleToolSelector] Too few tools matched (${relevantTools.length} < ${minToolsThreshold}), returning core tools only (${coreToolsOnly.length})`)
      return coreToolsOnly
    }

    // Return top scored tools up to maxTools
    const result = relevantTools.slice(0, maxTools).map(st => st.tool)
    console.log(`[SimpleToolSelector] Selected ${result.length} tools (limited to max ${maxTools})`)
    return result
  }

  private extractTokens(text: string): string[] {
    const tokens = text.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 2) // Filter out short words

    const stopWords = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'what', 'how', 'can', 'could', 'would', 'should'])
    return tokens.filter(token => !stopWords.has(token))
  }

  private scoreTool(
    tool: IMCPTool,
    promptTokens: string[],
    fullPrompt: string
  ): { nameMatch: number; descriptionMatch: number; parameterMatch: number; categoryMatch: number } {
    const toolNameTokens = this.extractTokens(tool.name)
    const toolDescTokens = tool.description ? this.extractTokens(tool.description) : []
    const toolCategory = (tool as any)._mcpCategory || ''

    // 1. Name matching (exact matches and partial matches)
    const nameMatch = this.calculateTokenOverlap(promptTokens, toolNameTokens)

    // 2. Description matching
    const descriptionMatch = this.calculateTokenOverlap(promptTokens, toolDescTokens)

    // 3. Parameter matching
    let parameterMatch = 0
    if (tool.inputSchema?.properties) {
      const paramNames = Object.keys(tool.inputSchema.properties)
      const paramDescriptions = Object.values(tool.inputSchema.properties)
        .map((p: any) => p.description || '')
        .join(' ')

      const paramTokens = this.extractTokens(paramNames.join(' ') + ' ' + paramDescriptions)
      parameterMatch = this.calculateTokenOverlap(promptTokens, paramTokens)
    }

    // 4. Category matching
    const categories = this.detectCategories(fullPrompt)
    const categoryMatch = categories.includes(toolCategory) ? 1.0 : 0

    return {
      nameMatch,
      descriptionMatch,
      parameterMatch,
      categoryMatch
    }
  }

  private calculateTokenOverlap(promptTokens: string[], toolTokens: string[]): number {
    if (promptTokens.length === 0 || toolTokens.length === 0) return 0

    let matches = 0
    const toolTokenSet = new Set(toolTokens)

    promptTokens.forEach(token => {
      if (toolTokenSet.has(token)) {
        matches++
      }
    })

    // Also check for partial matches (substring matching)
    promptTokens.forEach(promptToken => {
      toolTokens.forEach(toolToken => {
        // Check if one contains the other (e.g., "compile" matches "compiler")
        if (promptToken.length > 3 && toolToken.length > 3) {
          if (promptToken.includes(toolToken) || toolToken.includes(promptToken)) {
            matches += 0.5 // Partial match bonus
          }
        }
      })
    })

    // Normalize by prompt token count (favor tools that match more of the prompt)
    return Math.min(matches / promptTokens.length, 1.0)
  }

  public detectCategories(prompt: string): string[] {
    const lower = prompt.toLowerCase()
    const matched = new Set<string>()

    for (const [keyword, categories] of Object.entries(this.keywordMap)) {
      if (lower.includes(keyword)) {
        categories.forEach(cat => matched.add(cat))
      }
    }

    return Array.from(matched)
  }

  private isToolInCategories(tool: IMCPTool, categories: string[]): boolean {
    const toolCategory = (tool as any)._mcpCategory
    if (!toolCategory) return false
    return categories.includes(toolCategory)
  }

  selectToolsWithMetadata(
    allTools: IMCPTool[],
    userPrompt: string,
    maxTools: number = 15
  ): IToolSelectionResult {
    const selectedTools = this.selectTools(allTools, userPrompt, maxTools)
    const detectedCategories = this.detectCategories(userPrompt)

    return {
      selectedTools,
      detectedCategories,
      method: 'keyword'
    }
  }
}