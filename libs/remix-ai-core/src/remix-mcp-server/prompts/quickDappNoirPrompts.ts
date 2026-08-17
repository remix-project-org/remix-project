/**
 * Prompt builders for Noir ZK DApp generation via RemixAI chat.
 * Similar to quickDappZkPrompts.ts, but Noir circuits only support on-chain
 * verification (there is no zkVerify integration for Noir) and proof generation
 * happens via a round-trip to the noir-compiler backend rather than in-browser wasm.
 */

export interface QuickDappNoirOnChainVerifier {
  address: string
  abi: any[]
  chainId: string | number
  networkName?: string
  contractName?: string
}

export interface QuickDappNoirPromptContext {
  circuitName: string
  circuitPath: string
  projectRoot: string
  nargoTomlPath: string
  circuitSourcePaths: string[]
  proverTomlPath: string
  programJsonPath: string
  verifierContractPath: string
  backendUrl: string
  wsUrl: string
  userDescription?: string
  onChainVerifier: QuickDappNoirOnChainVerifier
}

/**
 * Build a prompt to create a ZK DApp from a compiled Noir circuit.
 * This prompt is sent to the AI assistant to initiate the DApp generation flow.
 * Noir DApps are always on-chain-verified - there is no zkVerify option to ask about.
 */
export const buildCreateNoirZkDappPrompt = (args: {
  noirContext: QuickDappNoirPromptContext
  isDesktop?: boolean
}): string => {
  const { noirContext, isDesktop = false } = args

  const locationLine = isDesktop
    ? '1. **Location**: Inline in /frontend only (Remix Desktop requirement - only option)'
    : '1. **Location**: Workspace (new dedicated workspace, default) or Inline (/frontend folder)?'

  const setupQuestions = [
    'STEP 1 - ASK ALL THREE SETUP OPTIONS:',
    'Ask me once: "How should I create your ZK DApp?"',
    '',
    locationLine,
    '',
    `2. **DApp Description** (optional): How should users interact with your DApp to generate proofs? For example: "Users input 4 values and verify their hash commitment on-chain." If you skip this, I'll create a simple form built from the circuit's abi parameters.`,
    '',
    `3. **Design**: Any style preferences or UI description? Or use defaults?`,
    '',
    'Ask exactly those three options only. Do not ask about wallet connection - this DApp verifies proofs on-chain, so wallet connect is required and already enabled. Do not ask for circuit details, NOIR_CONTEXT_JSON, Theme, Primary Color, DApp Title, or any other questions.',
    'After asking, STOP and wait for my reply.'
  ]

  const generateArgs = [
    'STEP 2 - AFTER I ANSWER:',
    'Call generate_noir_zk_dapp with these exact values extracted from this prompt:',
    `- circuitName: "${noirContext.circuitName}"`,
    `- circuitPath: "${noirContext.circuitPath}"`,
    `- nargoTomlPath: "${noirContext.nargoTomlPath}"`,
    `- circuitSourcePaths: ${JSON.stringify(noirContext.circuitSourcePaths)}`,
    `- proverTomlPath: "${noirContext.proverTomlPath}"`,
    `- programJsonPath: "${noirContext.programJsonPath}"`,
    `- verifierContractPath: "${noirContext.verifierContractPath}"`,
    `- backendUrl: "${noirContext.backendUrl}"`,
    `- wsUrl: "${noirContext.wsUrl}"`,
    '- onChainVerifier: [use the full JSON object from NOIR_CONTEXT_JSON below]',
    '- frontendMode: based on my Location choice ("workspace" or "inline")',
    '- setupOptionsConfirmed: true',
    '- setupOptionsSummary: summary of my confirmed options',
    '- description: based on my Design choice',
    '- interactionDescription: based on my DApp Description (if provided, otherwise omit)',
    '- enableWalletConnect: true (always true - required for on-chain verification)'
  ]

  return [
    `I want to create a QuickDapp for a Noir ZK circuit with in-browser proof generation and on-chain verifier contract verification.`,
    '',
    '=== NOIR CIRCUIT INFORMATION (ALL DATA PROVIDED - DO NOT ASK FOR ANY OF THIS) ===',
    `Circuit Name: ${noirContext.circuitName}`,
    `Circuit Path: ${noirContext.circuitPath}`,
    `Project Root: ${noirContext.projectRoot}`,
    `Backend URL: ${noirContext.backendUrl}`,
    `On-Chain Verifier: [FULL JSON OBJECT PROVIDED IN NOIR_CONTEXT_JSON BELOW]`,
    '=== END NOIR CIRCUIT INFORMATION ===',
    '',
    'CRITICAL: All circuit data above is ALREADY provided. Do NOT ask me for NOIR_CONTEXT_JSON or any circuit details.',
    '',
    ...setupQuestions,
    '',
    ...generateArgs,
    '',
    'NOIR_CONTEXT_JSON (contains onChainVerifier - use this for generate_noir_zk_dapp):',
    '```json',
    JSON.stringify(noirContext, null, 2),
    '```',
    '',
    'Start by asking STEP 1 only, then STOP.'
  ].join('\n')
}

/**
 * Build a quick description for the Noir ZK DApp prompt for simpler use cases.
 */
export const buildNoirZkDappDescription = (noirContext: QuickDappNoirPromptContext): string => {
  return `ZK DApp for ${noirContext.circuitName} Noir circuit. ` +
    `Generates a fresh proof per user input via the Noir backend and verifies it on-chain against a deployed verifier contract.`
}
