import { remixAILogger } from '../../../helpers/logger'
import { IAutoModelConfig, ModelSelection } from '../../../types/deepagent'
import { analyzePromptForAutoSelection } from './promptAnalysis'

/**
 * Select the optimal model for a DeepAgent run.
 *
 * NO literal model fallbacks: if Auto Mode is off, the caller's current
 * selection wins. If Auto Mode is on, we prefer Claude Sonnet whenever
 * the user is permitted to use it (deepagents middleware injects
 * Anthropic-flavored content blocks the Mistral adapter rejects on
 * turn one). When no Sonnet is allowed, we keep the caller's selection
 * and let the safety net in DeepAgentInferencer.answer() decide.
 *
 * Throws if both currentModelSelection and allowedModels are empty \u2014
 * that means /permissions hasn't loaded yet and we have nothing to run.
 */
export function selectOptimalModel(
  prompt: string,
  context?: string,
  autoModeConfig?: IAutoModelConfig,
  currentModelSelection?: ModelSelection,
  allowedModels: string[] = []
): ModelSelection {
  if (!autoModeConfig?.enabled) {
    if (!currentModelSelection) {
      throw new Error('[selectOptimalModel] Auto Mode disabled but no currentModelSelection \u2014 caller must wait for /permissions before invoking the agent')
    }
    return currentModelSelection
  }

  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt
  const complexity = analyzePromptForAutoSelection(fullPrompt)
  const securityKeywords = autoModeConfig.securityKeywords || [
    'security', 'audit', 'vulnerability', 'exploit', 'attack'
  ]
  const hasSecurityKeywords = securityKeywords.some(keyword =>
    fullPrompt.toLowerCase().includes(keyword)
  )

  remixAILogger.log('[DeepAgentInferencer] Auto selection analysis:', {
    complexity,
    hasSecurityKeywords,
    promptLength: fullPrompt.length
  })

  // Prefer Sonnet whenever it's allowed \u2014 deepagents middleware is
  // structurally Anthropic-shaped (see DeepAgentInferencer.answer safety net).
  const sonnetModelId = allowedModels.find(model => model.includes('sonnet'))
  if (sonnetModelId) {
    remixAILogger.log(`[DeepAgentInferencer] Auto: chose Anthropic Sonnet (${complexity}, security=${hasSecurityKeywords})`)
    return { provider: 'anthropic', modelId: sonnetModelId }
  }

  // No Sonnet \u2014 keep the caller's current selection. Don't substitute
  // a literal Mistral id: the safety net in answer() handles structural
  // incompatibility, and the caller's selection comes from /permissions.
  if (!currentModelSelection) {
    throw new Error('[selectOptimalModel] Auto Mode on, no Sonnet allowed, and no currentModelSelection \u2014 nothing to run')
  }
  remixAILogger.log('[DeepAgentInferencer] Auto: no Sonnet allowed, keeping caller selection', currentModelSelection)
  return currentModelSelection
}
