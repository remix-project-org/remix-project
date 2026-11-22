import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createModelInstance } from '../inferencers/deepagent/ModelFactory'
import { generateStructured } from '../helpers/structuredOutput'
import { SecurityCheck, SecurityCheckSchema } from '../types/schemas'
import { IUserApiKeyConfig } from '../types/deepagent'

/**
 * Light security check: one cheap, structured call made in the background
 * after a deployment, to show the user a quick "looks fine / something is
 * wrong" verdict and promote the full security audit.
 *
 * The call is forced through the `security_check` tool (`generateStructured`
 * name), which the AI proxy turns into the `security_check` operation, so the
 * hidden per-plan free allowance drains before the user's credits.
 */

/**
 * Pinned so verdicts stay stable; override with the `security_check.light_model` app config key.
 * The model must honour a forced tool call (some cheap models, e.g. deepseek-v4-flash or
 * qwen3.7-flash, ignore `tool_choice` and answer in prose). gpt-oss-120b does, catches
 * the obvious exploits without flagging safe contracts, and costs well under 1 credit per check.
 */
export const LIGHT_SECURITY_CHECK_DEFAULT_MODEL = 'openai/gpt-oss-120b'

/** Room for the model's reasoning plus a short structured answer. */
export const LIGHT_SECURITY_CHECK_MAX_TOKENS = 4096

/** Promo verdicts must not cry wolf: only concrete, high-impact issues count. */
export const LIGHT_SECURITY_CHECK_PROMPT = `You are a smart-contract security reviewer doing a quick, low-cost scan of a Solidity contract that was just deployed.

Report only concrete, high-impact issues with a realistic exploit path that could lead to loss or locking of funds, unauthorized control, or a scam / rug pull. For example:
- reentrancy around ETH or token transfers
- missing or broken access control on privileged or state-changing functions
- unprotected selfdestruct or delegatecall, or authorization through tx.origin
- unchecked results of external calls that move value
- owner backdoors: hidden minting, arbitrary transfers or approvals, blocking withdrawals
- predictable randomness that decides value

Do not report gas optimizations, style, missing events or NatSpec, floating pragmas, compiler versions, or theoretical concerns without a concrete exploit path.

Answer "Yes" if at least one such issue exists, otherwise "No" with empty lists. Give at most 5 reasons, each one sentence naming the affected function, and one short suggestion per reason.`

/**
 * For code just pasted into the editor, often copied from the internet: besides exploitable bugs,
 * look for code written to steal from whoever deploys or uses it.
 */
export const LIGHT_SECURITY_CHECK_PASTED_PROMPT = `You are a smart-contract security reviewer doing a quick, low-cost scan of Solidity code a user just pasted into their editor, often copied from a tutorial, a chat or a "make money" video. It may be incomplete.

Report only concrete, high-impact problems. Look first for code written to steal from whoever deploys or uses it, for example:
- "trading", "arbitrage", "MEV" or "front-running bot" contracts that just forward deposited ETH or tokens to a hardcoded, encoded or computed address
- addresses hidden in hex, string or arithmetic tricks, or obfuscated assembly that moves value
- hidden owner backdoors: minting, draining, pausing transfers, blacklisting, changing fees to 100%
- honeypot tokens that can be bought but not sold, unlimited approvals to arbitrary spenders
- approval drainers: functions that call transferFrom (directly or through a low-level call) to move tokens out of an address other than msg.sender
Also report exploitable bugs that put funds at risk: reentrancy around transfers, missing access control on privileged functions (anyone can change the owner, withdraw, mint), unprotected selfdestruct or delegatecall, authorization through tx.origin.

Do not report gas optimizations, style, missing events or NatSpec, floating pragmas, compiler versions, missing code in an incomplete snippet, or theoretical concerns without a concrete exploit path.

Answer "Yes" if at least one such problem exists, otherwise "No" with empty lists. Give at most 5 reasons, each one sentence naming the affected function, and one short suggestion per reason.`

/** `deployed`: a contract that was just deployed. `pasted`: code just pasted into the editor. */
export type LightSecurityCheckMode = 'deployed' | 'pasted'

export interface LightSecurityCheckInput {
  /** Solidity source of the file to check. */
  source: string
  fileName: string
  contractName?: string
  modelId?: string
  userApiKeys?: IUserApiKeyConfig
  mode?: LightSecurityCheckMode
}

/**
 * What a light check ended with, as returned by `remixAI.light_security_check`.
 *  - `ok`          — verdict in `result`
 *  - `signin`      — the user isn't signed in (or the session expired)
 *  - `exhausted`   — no free allowance and no credits left
 *  - `unavailable` — disabled by config, or the model isn't open to this account
 *  - `error`       — anything else (network, provider, unreadable answer)
 */
export type LightSecurityCheckOutcome =
  | { status: 'ok', result: SecurityCheck, model: string }
  | { status: 'signin' | 'exhausted' | 'unavailable' | 'error', code?: string, message?: string }

export function buildLightSecurityCheckRequest (input: Pick<LightSecurityCheckInput, 'source' | 'fileName' | 'contractName'>): string {
  const header = [`File: ${input.fileName}`, input.contractName ? `Deployed contract: ${input.contractName}` : ''].filter(Boolean).join('\n')
  return `${header}\n\n\`\`\`solidity\n${input.source}\n\`\`\``
}

/** Runs the light check. Throws the transport error as-is so the caller can classify it (sign-in, no credits, …). */
export async function runLightSecurityCheck (input: LightSecurityCheckInput): Promise<SecurityCheck> {
  const model = await createModelInstance(
    // no fallback list: OpenRouter would serve a fallback (often a pricier one) instead of the pinned model
    { provider: 'openrouter', modelId: input.modelId || LIGHT_SECURITY_CHECK_DEFAULT_MODEL, fallbacks: false },
    LIGHT_SECURITY_CHECK_MAX_TOKENS,
    input.userApiKeys
  )
  return generateStructured(model, SecurityCheckSchema, [
    new SystemMessage(input.mode === 'pasted' ? LIGHT_SECURITY_CHECK_PASTED_PROMPT : LIGHT_SECURITY_CHECK_PROMPT),
    new HumanMessage(buildLightSecurityCheckRequest(input))
  // functionCalling: the forced `security_check` tool call is what the proxy recognises as the
  // security_check operation (free allowance). Left to choose, LangChain may send response_format instead.
  ], { name: 'security_check', method: 'functionCalling' })
}
