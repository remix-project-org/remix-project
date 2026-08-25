import { z } from 'zod'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage, HumanMessage } from '@langchain/core/messages'
import { remixAILogger } from './logger'

export type StructuredMethod = 'functionCalling' | 'jsonSchema' | 'jsonMode'

export interface StructuredOutputOptions {
  /** Tool/schema name surfaced to the provider. */
  name?: string
  /**
   * Enforcement mechanism. 'functionCalling' (default) works across all
   * providers Remix uses; 'jsonSchema' enables strict json-schema mode on
   * OpenAI/Anthropic.
   */
  method?: StructuredMethod
  /** How many repair re-prompts to attempt on validation failure (default 1). */
  maxRepairs?: number
}

/**
 * Generate schema-constrained output from a LangChain chat model.
 *
 * Uses `model.withStructuredOutput(schema)` — the provider constrains the model
 * (via tool-calling or json-schema) to the shape, and LangChain parses it. If
 * parsing/validation still fails, we run a bounded repair loop: re-invoke with
 * the validation error appended, asking for a value that matches the schema.
 * This mirrors the single-retry philosophy already used for tool-input schema
 * mismatches in `DeepAgentInferencer` (see its runAgent retry).
 *
 * Throws the last validation error if every attempt fails — callers decide how
 * to surface that (fallback message, retry, etc.).
 */
export async function generateStructured<T>(
  model: BaseChatModel,
  schema: z.ZodType<T>,
  messages: BaseMessage[],
  opts: StructuredOutputOptions = {}
): Promise<T> {
  const { name = 'extract', method, maxRepairs = 1 } = opts

  // Cast: withStructuredOutput's overloads are picky about zod version generics;
  // the runtime behaviour is identical.
  const structured = (model as any).withStructuredOutput(schema, {
    name,
    ...(method ? { method } : {})
  })

  const runningMessages: BaseMessage[] = [...messages]
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    try {
      const raw = await structured.invoke(runningMessages)
      // Double-validate: some providers return loosely-typed objects.
      return schema.parse(raw)
    } catch (error: any) {
      lastError = error
      if (attempt === maxRepairs) break
      const detail = error?.message ? String(error.message) : String(error)
      remixAILogger.warn(`[structuredOutput] "${name}" attempt ${attempt + 1} failed, repairing:`, detail)
      runningMessages.push(
        new HumanMessage(
          `Your previous response did not match the required schema (${detail}). ` +
          'Reply again with ONLY a value that strictly matches the schema — no prose, no markdown fences.'
        )
      )
    }
  }

  remixAILogger.error(`[structuredOutput] "${name}" failed after ${maxRepairs + 1} attempt(s)`, lastError)
  throw lastError
}
