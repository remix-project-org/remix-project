/**
 * Prompt builders for ZK DApp generation via RemixAI chat.
 * Similar to quickDappTheGraphPrompts.ts but for ZK circuits with zkVerify.
 */

export interface QuickDappZkPromptContext {
  circuitName: string
  circuitPath: string
  provingScheme: 'groth16'
  primeValue: 'bn128' | 'bls12381'
  signalInputs: string[]
  wasmPath: string
  zkeyPath: string
  verificationKey: Record<string, any>
  zkVerifyNetwork?: 'testnet' | 'mainnet'
  userDescription?: string
}

/**
 * Build a prompt to create a ZK DApp from a compiled circom circuit.
 * This prompt is sent to the AI assistant to initiate the DApp generation flow.
 */
export const buildCreateZkDappPrompt = (args: {
  zkContext: QuickDappZkPromptContext
  isDesktop?: boolean
}): string => {
  const { zkContext, isDesktop = false } = args

  const locationLine = isDesktop
    ? '1. **Location**: Inline in /frontend only (Remix Desktop requirement - only option)'
    : '1. **Location**: Workspace (new dedicated workspace, default) or Inline (/frontend folder)?'

  return [
    'I want to create a QuickDapp for a ZK circuit with in-browser proof generation and zkVerify verification.',
    '',
    '=== ZK CIRCUIT INFORMATION (ALL DATA PROVIDED - DO NOT ASK FOR ANY OF THIS) ===',
    `Circuit Name: ${zkContext.circuitName}`,
    `Circuit Path: ${zkContext.circuitPath}`,
    `Proving Scheme: ${zkContext.provingScheme}`,
    `Prime Field: ${zkContext.primeValue}`,
    `Signal Inputs: ${zkContext.signalInputs.join(', ')}`,
    `Wasm Path: ${zkContext.wasmPath}`,
    `Zkey Path: ${zkContext.zkeyPath}`,
    `Verification Key: [FULL JSON OBJECT PROVIDED IN ZK_CONTEXT_JSON BELOW]`,
    '=== END ZK CIRCUIT INFORMATION ===',
    '',
    'CRITICAL: All circuit data above is ALREADY provided. Do NOT ask me for ZK_CONTEXT_JSON or any circuit details.',
    '',
    'STEP 1 - ASK ALL FOUR SETUP OPTIONS:',
    'Ask me once: "How should I create your ZK DApp?"',
    '',
    locationLine,
    '',
    `2. **DApp Description** (optional): How should users interact with your DApp to generate proofs? For example: "Users deposit ETH and receive a commitment note, then use the note to withdraw privately" (like Tornado Cash). If you skip this, I'll create a simple form with the signal inputs: ${zkContext.signalInputs.join(', ')}.`,
    '',
    '3. **Wallet Connection**: Should users be able to connect their wallet? This is useful if your DApp uses wallet data (address, balance, etc.) as inputs for proof generation.',
    '   - No (default)',
    '   - Yes (if yes, which data: address, chainId, balance, nonce?)',
    '',
    '4. **Design**: Any style preferences or UI description? Or use defaults?',
    '',
    'Ask exactly those four options only. Do not ask for circuit details, ZK_CONTEXT_JSON, Theme, Primary Color, DApp Title, or any other questions.',
    'After asking, STOP and wait for my reply.',
    '',
    'STEP 2 - AFTER I ANSWER:',
    'Call generate_zk_dapp with these exact values extracted from this prompt:',
    `- circuitName: "${zkContext.circuitName}"`,
    `- circuitPath: "${zkContext.circuitPath}"`,
    `- signalInputs: ${JSON.stringify(zkContext.signalInputs)}`,
    `- provingScheme: "${zkContext.provingScheme}"`,
    `- primeValue: "${zkContext.primeValue}"`,
    `- wasmPath: "${zkContext.wasmPath}"`,
    `- zkeyPath: "${zkContext.zkeyPath}"`,
    '- verificationKey: [use the full JSON object from ZK_CONTEXT_JSON below]',
    '- frontendMode: based on my Location choice ("workspace" or "inline")',
    '- setupOptionsConfirmed: true',
    '- setupOptionsSummary: summary of my confirmed options',
    '- description: based on my Design choice',
    '- interactionDescription: based on my DApp Description (if provided, otherwise omit)',
    '- enableWalletConnect: true/false based on my Wallet Connection choice',
    '- walletDataFields: ["address", "balance", etc.] if wallet enabled',
    '',
    'ZK_CONTEXT_JSON (contains verificationKey - use this for generate_zk_dapp):',
    '```json',
    JSON.stringify(zkContext, null, 2),
    '```',
    '',
    'Start by asking STEP 1 only, then STOP.'
  ].join('\n')
}

/**
 * Build a quick description for the ZK DApp prompt for simpler use cases.
 */
export const buildZkDappDescription = (zkContext: QuickDappZkPromptContext): string => {
  return `ZK DApp for ${zkContext.circuitName} circuit with ${zkContext.signalInputs.length} signal input(s): ${zkContext.signalInputs.join(', ')}. ` +
    `Uses ${zkContext.provingScheme} proving scheme with ${zkContext.primeValue} prime field. ` +
    `Includes in-browser proof generation using snarkjs and zkVerify verification.`
}
