/**
 * DeepAgent Integration for Remix IDE
 * Exports all DeepAgent components
 */

export { DeepAgentInferencer } from './DeepAgentInferencer'
export { RemixFilesystemBackend } from './RemixFilesystemBackend'
export { RemixToolAdapter, ToolApprovalGate, createRemixTools } from './RemixToolAdapter'
export {
  REMIX_DEEPAGENT_SYSTEM_PROMPT,
  SOLIDITY_CODE_GENERATION_PROMPT,
  SECURITY_ANALYSIS_PROMPT,
  CODE_EXPLANATION_PROMPT
} from './DeepAgentLightPrompts'

// DApp Generator exports
export {
  DAPP_GENERATOR_SUBAGENT_PROMPT,
  buildDAppSystemPrompt,
  buildDAppUserMessage,
  parsePages,
  findMissingImports,
  isLocalVMChainId,
  REQUIRED_DAPP_FILES,
  cleanFileContent,
  ensureCompleteHtml,
  type DAppPromptContext,
  type DAppContractInfo,
  type DAppUserMessageOptions
} from './DAppGeneratorPrompts'

