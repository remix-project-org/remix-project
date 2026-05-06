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
