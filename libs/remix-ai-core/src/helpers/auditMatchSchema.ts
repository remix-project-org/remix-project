import { z } from 'zod'
import { AuditMatchRequest, renderTaxonomyBlock } from './auditTaxonomy'

/** Skeleton digest ceiling. Sections are trimmed in priority order below. */
const MAX_SKELETON_CHARS = 8000
const MAX_TAXONOMY_CHARS = 12000

/**
 * Schema for the model's reply.
 */
export function buildAuditMatchSchema(allowedPaths: string[], maxMatches = 12) {
  return z.object({
    matches: z.array(z.object({
      path: z.string().describe(
        `A category path copied VERBATIM from this list: ${allowedPaths.join(' | ')}`
      ),
      confidence: z.enum(['high', 'medium', 'low'])
        .describe('high = the feature is unmistakable; low = plausible but weakly evidenced.'),
      reason: z.string().describe(
        'One short sentence naming the concrete evidence (a function name, import, inherited base, state variable or modifier). Max 200 characters.'
      )
    })).max(maxMatches).describe(
      `The most relevant audit categories for this contract, at most ${maxMatches}, ordered by confidence.`
    ),
    skipped_reason: z.string().optional()
      .describe('Set only when matches is empty: why no category applied.')
  })
}

export type AuditMatchSchema = ReturnType<typeof buildAuditMatchSchema>

/**
 * Trim a skeleton digest to budget.
 */
export function trimSkeleton(skeleton: string, maxChars = MAX_SKELETON_CHARS): string {
  if (typeof skeleton !== 'string') return ''
  if (skeleton.length <= maxChars) return skeleton

  const trimOrder = ['IMPORTS', 'STATE VARIABLES', 'FUNCTION SIGNATURES']
  const sections = skeleton.split(/(?=\/\/ === )/)
  const result = [...sections]

  for (const target of trimOrder) {
    if (result.join('').length <= maxChars) break
    const index = result.findIndex(s => s.startsWith(`// === ${target} ===`))
    if (index === -1) continue
    const lines = result[index].split('\n')
    // Keep shrinking this section (halving its body) until it stops being the problem.
    while (lines.length > 2 && result.join('').length > maxChars) {
      const dropped = Math.max(1, Math.floor((lines.length - 1) / 2))
      lines.splice(1 + (lines.length - 1 - dropped), dropped)
      result[index] = `${lines.join('\n')}\n// …truncated (${dropped} more lines)\n`
    }
  }

  const joined = result.join('')
  return joined.length <= maxChars ? joined : joined.slice(0, maxChars) + '\n// …truncated\n'
}

/**
 * Build the request-specific prompt. The static rules live in
 * AUDIT_CATEGORY_MATCH_PROMPT; everything here is per-contract data.
 */
export function buildAuditMatchPrompt(request: AuditMatchRequest): { system: string; human: string } {
  const maxMatches = request.maxMatches ?? 12
  const taxonomy = request.taxonomy ?? []
  const contract = request.contract ?? { path: 'unknown', skeleton: '' }

  const system = `Select at most ${maxMatches} categories. Copy each path verbatim from the list in the user message.`

  const names = contract.contractNames?.length
    ? `Compiled deployable contracts: ${contract.contractNames.join(', ')}\n`
    : ''

  const human = [
    `# Audit categories — choose ONLY from these ${taxonomy.length} paths`,
    renderTaxonomyBlock(taxonomy, { maxChars: MAX_TAXONOMY_CHARS }),
    '',
    `# Contract: ${contract.path}`,
    names + '```solidity',
    trimSkeleton(contract.skeleton),
    '```',
    '',
    `Return at most ${maxMatches} matches, each with a path copied verbatim from the list above.`
  ].join('\n')

  return { system, human }
}
