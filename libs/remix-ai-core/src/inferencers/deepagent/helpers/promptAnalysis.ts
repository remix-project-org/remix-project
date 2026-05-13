import {
  COMPLEXITY_WORD_COUNT_THRESHOLD,
  COMPLEXITY_INDICATORS,
  SECURITY_KEYWORDS
} from '../constants'

export type PromptComplexity = 'simple' | 'complex'


export function analyzePromptForAutoSelection(prompt: string): PromptComplexity {
  const lowerPrompt = prompt.toLowerCase()

  const complexityCount = COMPLEXITY_INDICATORS.filter(keyword =>
    lowerPrompt.includes(keyword)
  ).length

  const securityCount = SECURITY_KEYWORDS.filter(keyword =>
    lowerPrompt.includes(keyword)
  ).length

  const wordCount = prompt.split(/\s+/).length
  const hasMultipleQuestions = (prompt.match(/\?/g) || []).length > 1
  const hasCodeBlocks = /```[\s\S]*?```/.test(prompt)

  // Determine complexity based on multiple factors
  if (securityCount > 0 || complexityCount >= 2 || wordCount > COMPLEXITY_WORD_COUNT_THRESHOLD ||
      hasMultipleQuestions || hasCodeBlocks) {
    return 'complex'
  }

  return 'simple'
}

export function hasSecurityKeywords(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase()
  return SECURITY_KEYWORDS.some(keyword => lowerPrompt.includes(keyword))
}

export function countComplexityIndicators(prompt: string): number {
  const lowerPrompt = prompt.toLowerCase()
  return COMPLEXITY_INDICATORS.filter(keyword =>
    lowerPrompt.includes(keyword)
  ).length
}
