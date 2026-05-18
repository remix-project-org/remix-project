import { IAutoModelConfig, ModelSelection } from '../../../types/deepagent'
import { analyzePromptForAutoSelection } from './promptAnalysis'
import { DEFAULT_MODEL_PROVIDER, DEFAULT_MODEL_ID } from '../constants'

/**
 * Select the optimal model based on prompt complexity and configuration
 */
export function selectOptimalModel(
  prompt: string,
  context?: string,
  autoModeConfig?: IAutoModelConfig,
  currentModelSelection?: ModelSelection,
  allowedModels: string[] = []
): ModelSelection {
  // If auto mode is disabled, use current selection
  if (!autoModeConfig?.enabled || !currentModelSelection) {
    return currentModelSelection || {
      provider: DEFAULT_MODEL_PROVIDER,
      modelId: DEFAULT_MODEL_ID
    }
  }

  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt
  const complexity = analyzePromptForAutoSelection(fullPrompt)
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
        modelId: allowedModels.find(model => model.includes('mistral-medium')) || DEFAULT_MODEL_ID
      }
    }
  } else {
    console.log('[DeepAgentInferencer] Selected Mistral for simple task')
    return {
      provider: 'mistralai',
      modelId: allowedModels.find(model => model.includes('mistral-medium')) || DEFAULT_MODEL_ID
    }
  }
}

export function getDefaultModelSelection(): ModelSelection {
  return {
    provider: DEFAULT_MODEL_PROVIDER,
    modelId: DEFAULT_MODEL_ID
  }
}
