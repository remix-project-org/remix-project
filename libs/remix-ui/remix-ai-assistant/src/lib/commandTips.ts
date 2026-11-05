/**
 * Contextual tips shown above the composer. Each one teaches a /command that
 * fits the conversation so far.
 */

export interface CommandTip {
  /** Command name, without the slash. */
  command: string
  text: string
}

export const COMMAND_TIPS: Record<string, CommandTip> = {
  generate: { command: 'generate', text: 'describes a contract and RemixAI writes it into your workspace.' },
  compile: { command: 'compile', text: 'compiles the file and fixes the errors for you.' },
  deploy: { command: 'deploy', text: 'deploys the open contract, no need to switch panels.' },
  audit: { command: 'audit', text: 'runs a full security audit and writes a report.' },
  createDapp: { command: 'create-dapp', text: 'builds a frontend for your deployed contracts.' }
}

/** The fields of a chat message the rules look at. */
export interface TipMessage {
  role: string
  content: string
  fileChanges?: unknown[]
}

const SECURITY = /\b(security|secure|safe(ty)?|vulnerab\w*|audit\w*|exploit\w*|reentran\w*)\b/i
const DEPLOY = /\b(deploy\w*|testnet|mainnet|sepolia|network)\b/i
const DEPLOYED = /\bdeployed\b/i
const ADDRESS = /\b0x[0-9a-fA-F]{40}\b/
const SOLIDITY = /```\s*(solidity|sol)\b|pragma solidity/i

/** Tips that apply to one message, most specific first. */
const tipsFor = (message: TipMessage): CommandTip[] => {
  const tips: CommandTip[] = []
  const content = message.content || ''
  if (message.role === 'assistant') {
    if (DEPLOYED.test(content) && ADDRESS.test(content)) tips.push(COMMAND_TIPS.createDapp)
    if ((message.fileChanges && message.fileChanges.length > 0) || SOLIDITY.test(content)) tips.push(COMMAND_TIPS.compile)
  }
  if (SECURITY.test(content)) tips.push(COMMAND_TIPS.audit)
  if (DEPLOY.test(content)) tips.push(COMMAND_TIPS.deploy)
  return tips
}

/**
 * Picks the tip for the conversation: the first rule that matches, newest
 * message first. Commands the user has already used, or can't use on their
 * plan, are skipped. Returns null when nothing fits.
 */
export function pickTip(
  messages: TipMessage[],
  usedCommands: string[],
  canUse: (command: string) => boolean = () => true
): CommandTip | null {
  const usable = (tip: CommandTip) => !usedCommands.includes(tip.command) && canUse(tip.command)
  if (messages.length === 0) return usable(COMMAND_TIPS.generate) ? COMMAND_TIPS.generate : null
  for (let i = messages.length - 1; i >= 0; i--) {
    const tip = tipsFor(messages[i]).find(usable)
    if (tip) return tip
  }
  return null
}

/** The command a prompt starts with ("/compile fix it" → "compile"), if any. */
export function commandOf(prompt: string): string | null {
  const match = /^\s*\/([\w-]+)/.exec(prompt)
  return match ? match[1] : null
}
