import type { DynamicStructuredTool } from '@langchain/core/tools'
import { IAutoModelConfig } from '../../types/deepagent'

// Model provider types
type ModelProvider = 'anthropic' | 'mistralai' | 'openai' | 'ollama'

interface ModelSelection {
  provider: ModelProvider
  modelId: string
}

/**
  * Get basic MCP tools and slither_scan for Security Auditor
  */
export function getBasicMcpToolsForSecurityAuditor(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const basicToolNames = [
    // Security analysis
    'slither_scan'
  ]

  const basicTools = tools.filter(tool =>
    basicToolNames.includes(tool.name)
  )
  return basicTools
}

/**
   * Get Security tools for Security Auditor
   */
export function getSecurityToolsForSecurityAuditor(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const securityTools = tools.filter(tool => {
    // Check if tool comes from Security Auditor MCP server
    const description = tool.description.toLowerCase()
    return description.includes('[security]') ||
           tool.name.toLowerCase().includes('slither_scan') ||
           description.includes('security')
  })

  console.log(`[HelperTools] Found ${securityTools.length} Security tools`)
  return securityTools
}

/**
  * Get basic file tools for Gas Optimizer
  */
export function getBasicFileToolsForGasOptimizer(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const basicFileToolNames = []

  const basicFileTools = tools.filter(tool =>
    basicFileToolNames.includes(tool.name)
  )
  return basicFileTools
}

/**
   * Get coordination tools for Comprehensive Auditor
   * Note: Uses built-in task tool instead of custom invoke_subagent
   */
export function getCoordinationToolsForComprehensiveAuditor(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const coordinationToolNames = [
    // Coordination tools (invoke_subagent removed - using built-in task tool)
    /*'verify_findings',
    'aggregate_findings',
    'resolve_conflicts'*/
  ]

  const coordinationTools = tools.filter(tool =>
    coordinationToolNames.includes(tool.name)
  )
  return coordinationTools
}

/**
   * Get education tools for Web3 Educator
   */
export function getEducationToolsForWeb3Educator(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const educationToolNames = [
    // Tutorial tools
    'start_tutorial',
    'tutorials_list'
  ]

  const educationTools = tools.filter(tool =>
    educationToolNames.includes(tool.name)
  )
  return educationTools
}

/**
   * Get debug tools for Debug Specialist
   */
export function getDebugToolsForDebugSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const debugToolNames = [
    // Debug session management
    'start_debug_session',
    // Variable decoding
    'decode_local_variable',
    'decode_state_variable',
    // Variable extraction
    'extract_locals_at',
    'decode_locals_at',
    'extract_state_at',
    'decode_state_at',
    // Storage and stack inspection
    'storage_view_at',
    'get_stack_at',
    // Navigation and scope analysis
    'jump_to',
    'get_scopes_with_root',
    // Source mapping
    'get_valid_source_location_from_vm_trace_index'
  ]

  const debugTools = tools.filter(tool =>
    debugToolNames.includes(tool.name)
  )
  return debugTools
}

/**
   * Get Etherscan tools for Etherscan Specialist
   */
export function getEtherscanToolsForEtherscanSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const etherscanTools = tools.filter(tool => {
    // Check if tool comes from Etherscan MCP server
    const description = tool.description.toLowerCase()
    return description.includes('[etherscan]') ||
           tool.name.toLowerCase().includes('etherscan') ||
           description.includes('etherscan')
  })

  console.log(`[HelperTools] Found ${etherscanTools.length} Etherscan tools`)
  return etherscanTools
}

/**
   * Get TheGraph tools for TheGraph Specialist
   */
export function getTheGraphToolsForTheGraphSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const theGraphTools = tools.filter(tool => {
    // Check if tool comes from TheGraph MCP server
    const description = tool.description.toLowerCase()
    return description.includes('[the graph api]') ||
           description.includes('[thegraph]') ||
           tool.name.toLowerCase().includes('thegraph') ||
           tool.name.toLowerCase().includes('graph') ||
           description.includes('thegraph') ||
           description.includes('subgraph') ||
           description.includes('graphql')
  })

  console.log(`[HelperTools] Found ${theGraphTools.length} TheGraph tools`)
  return theGraphTools
}

/**
   * Get Alchemy tools for Alchemy Specialist
   */
export function getAlchemyToolsForAlchemySpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const alchemyTools = tools.filter(tool => {
    // Check if tool comes from Alchemy MCP server
    const description = tool.description.toLowerCase()
    return description.includes('[alchemy]') ||
           tool.name.toLowerCase().includes('alchemy') ||
           description.includes('alchemy')
  })

  console.log(`[HelperTools] Found ${alchemyTools.length} Alchemy tools`)
  return alchemyTools
}

/**
 * Analyze prompt complexity and content to determine optimal model
 */
export function analyzePromptForAutoSelection(prompt: string): 'simple' | 'complex' {
  const complexityIndicators = [
    'audit', 'security', 'vulnerability', 'exploit', 'attack', 'malicious',
    'comprehensive', 'detailed', 'analyze', 'review', 'optimize',
    'refactor', 'architecture', 'design pattern', 'best practice',
    'multi-step', 'complex', 'advanced', 'sophisticated'
  ]
  
  const securityKeywords = [
    'security', 'audit', 'vulnerability', 'exploit', 'attack', 'malicious',
    'reentrancy', 'overflow', 'underflow', 'access control', 'authorization',
    'authentication', 'privilege', 'permission', 'dos', 'denial of service'
  ]
  
  const lowerPrompt = prompt.toLowerCase()
  
  // Count complexity and security indicators
  const complexityCount = complexityIndicators.filter(keyword => 
    lowerPrompt.includes(keyword)
  ).length
  
  const securityCount = securityKeywords.filter(keyword => 
    lowerPrompt.includes(keyword)
  ).length
  
  // Analyze prompt length and structure
  const wordCount = prompt.split(/\s+/).length
  const hasMultipleQuestions = (prompt.match(/\?/g) || []).length > 1
  const hasCodeBlocks = /```[\s\S]*?```/.test(prompt)
  
  // Determine complexity based on multiple factors
  if (securityCount > 0 || complexityCount >= 2 || wordCount > 100 || 
      hasMultipleQuestions || hasCodeBlocks) {
    return 'complex'
  }
  
  return 'simple'
}

/**
   * Filter out Security tools from a tool list
   */
export function filterOutSecurityTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const securityToolNames = new Set(getSecurityToolsForSecurityAuditor(tools).map(t => t.name))
  const filteredTools = tools.filter(tool => !securityToolNames.has(tool.name))

  console.log(`[HelperTools] Filtered out ${tools.length - filteredTools.length} Security tools from main agent`)
  return filteredTools
}

/**
   * Filter out Etherscan tools from a tool list
   */
export function filterOutEtherscanTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const etherscanToolNames = new Set(getEtherscanToolsForEtherscanSpecialist(tools).map(t => t.name))
  const filteredTools = tools.filter(tool => !etherscanToolNames.has(tool.name))

  console.log(`[HelperTools] Filtered out ${tools.length - filteredTools.length} Etherscan tools from main agent`)
  return filteredTools
}

/**
   * Filter out TheGraph tools from a tool list
   */
export function filterOutTheGraphTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const theGraphToolNames = new Set(getTheGraphToolsForTheGraphSpecialist(tools).map(t => t.name))
  const filteredTools = tools.filter(tool => !theGraphToolNames.has(tool.name))

  console.log(`[HelperTools] Filtered out ${tools.length - filteredTools.length} TheGraph tools from main agent`)
  return filteredTools
}

/**
   * Filter out Alchemy tools from a tool list
   */
export function filterOutAlchemyTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const alchemyToolNames = new Set(getAlchemyToolsForAlchemySpecialist(tools).map(t => t.name))
  const filteredTools = tools.filter(tool => !alchemyToolNames.has(tool.name))

  console.log(`[HelperTools] Filtered out ${tools.length - filteredTools.length} Alchemy tools from main agent`)
  return filteredTools
}

/**
   * Filter out Education tools from a tool list
   */
export function filterOutEducationTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const educationToolNames = new Set(getEducationToolsForWeb3Educator(tools).map(t => t.name))
  const filteredTools = tools.filter(tool => !educationToolNames.has(tool.name))

  console.log(`[HelperTools] Filtered out ${tools.length - filteredTools.length} Education tools from main agent`)
  return filteredTools
}

/**
   * Filter out Debug tools from a tool list
   */
export function filterOutDebugTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const debugToolNames = new Set(getDebugToolsForDebugSpecialist(tools).map(t => t.name))
  const filteredTools = tools.filter(tool => !debugToolNames.has(tool.name))

  console.log(`[HelperTools] Filtered out ${tools.length - filteredTools.length} Debug tools from main agent`)
  return filteredTools
}

/**
   * Filter out all specialist tools (Security, Etherscan, TheGraph, Alchemy, Education, Debug) from a tool list
   */
export function filterOutSpecialistTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const securityToolNames = new Set(getSecurityToolsForSecurityAuditor(tools).map(t => t.name))
  const etherscanToolNames = new Set(getEtherscanToolsForEtherscanSpecialist(tools).map(t => t.name))
  const theGraphToolNames = new Set(getTheGraphToolsForTheGraphSpecialist(tools).map(t => t.name))
  const alchemyToolNames = new Set(getAlchemyToolsForAlchemySpecialist(tools).map(t => t.name))
  const educationToolNames = new Set(getEducationToolsForWeb3Educator(tools).map(t => t.name))
  const debugToolNames = new Set(getDebugToolsForDebugSpecialist(tools).map(t => t.name))
  const solidityToolNames = new Set(getSolidityToolsForSolidityEngineer(tools).map(t => t.name))
  const webSearchToolNames = new Set(getWebSearchToolsForWebSearchSpecialist(tools).map(t => t.name))

  const filteredTools = tools.filter(tool =>
    !securityToolNames.has(tool.name) &&
    !etherscanToolNames.has(tool.name) &&
    !theGraphToolNames.has(tool.name) &&
    !alchemyToolNames.has(tool.name) &&
    !educationToolNames.has(tool.name) &&
    !debugToolNames.has(tool.name) &&
    !solidityToolNames.has(tool.name) &&
    !webSearchToolNames.has(tool.name)
  )
  return filteredTools
}

/**
   * Get Solidity tools for Solidity Engineer (tools starting with "solidity")
   */
export function getSolidityToolsForSolidityEngineer(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const solidityTools = tools.filter(tool => {
    // Check if tool name starts with "solidity"
    return tool.name.toLowerCase().startsWith('solidity')
  })

  console.log(`[HelperTools] Found ${solidityTools.length} Solidity tools`)
  return solidityTools
}

/**
   * Get Web Search tools for Web Search Specialist
   */
export function getWebSearchToolsForWebSearchSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const webSearchToolNames = [
    'full_web_search',
    'get_web_search_summaries', 
    'get_single_web_page_content'
  ]

  const webSearchTools = tools.filter(tool =>
    webSearchToolNames.includes(tool.name)
  )

  console.log(`[HelperTools] Found ${webSearchTools.length} Web Search tools`)
  return webSearchTools
}

/**
 * Select optimal model based on prompt analysis and auto mode configuration
 */
export function selectOptimalModel(prompt: string, context?: string, autoModeConfig?: IAutoModelConfig, currentModelSelection?: ModelSelection, allowedModels: string[] = []): ModelSelection {
  // If auto mode is disabled, use current selection
  if (!autoModeConfig?.enabled || !currentModelSelection) {
    return currentModelSelection || {
      provider: 'mistralai',
      modelId: 'mistral-medium-latest'
    }
  }
  
  // Analyze the prompt (include context if provided)
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt
  const complexity = analyzePromptForAutoSelection(fullPrompt)
  
  // Use custom security keywords if provided
  const securityKeywords = autoModeConfig.securityKeywords || [
    'security', 'audit', 'vulnerability', 'exploit', 'attack'
  ]
  
  const hasSecurityKeywords = securityKeywords.some(keyword => 
    fullPrompt.toLowerCase().includes(keyword)
  )
  
  console.log(`[DeepAgentInferencer] Auto selection analysis:`, {
    complexity,
    hasSecurityKeywords,
    promptLength: fullPrompt.length
  })
  
  // Decision logic: complex tasks or security-related → Claude, simple → Mistral
  if (complexity === 'complex' || hasSecurityKeywords) {
    console.log('[DeepAgentInferencer] Selected Anthropic Claude for complex/security task')
    const modelId = allowedModels.find(model => model.includes('sonnet'))
    if (modelId) {
      return {
        provider: 'anthropic',
        modelId
      }
    } else {
      console.warn('[DeepAgentInferencer] Preferred Claude model not available, falling back to Mistral')
      return {
        provider: 'mistralai', 
        modelId: allowedModels.find(model => model.includes('mistral-medium')) || 'mistral-medium-latest'
      }
    }    
  } else {
    console.log('[DeepAgentInferencer] Selected Mistral for simple task')
    return {
      provider: 'mistralai', 
      modelId: allowedModels.find(model => model.includes('mistral-medium')) || 'mistral-medium-latest'
    }
  }
}
