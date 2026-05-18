
import { ToolUIStringRegistry, formatToolName } from './types'
import { fileToolStrings } from './fileToolStrings'
import { compilationToolStrings } from './compilationToolStrings'
import { deploymentToolStrings } from './deploymentToolStrings'
import { debuggingToolStrings } from './debuggingToolStrings'
import { utilityToolStrings } from './utilityToolStrings'

// Merge all tool string registries
const toolStringRegistry: ToolUIStringRegistry = {
  ...fileToolStrings,
  ...compilationToolStrings,
  ...deploymentToolStrings,
  ...debuggingToolStrings,
  ...utilityToolStrings
}

export function resolveToolUIString(toolName: string, toolInput?: Record<string, any>): string {
  const args = toolInput || {}

  if (toolName === 'call_tool' && args.toolName) {
    return resolveToolUIString(args.toolName, args.arguments)
  }

  const resolver = toolStringRegistry[toolName]
  if (resolver) {
    return resolver(args)
  }
  const formattedName = formatToolName(toolName)
  return `${formattedName.charAt(0).toUpperCase() + formattedName.slice(1)}...`
}

export { ToolUIStringRegistry, getFileName, truncateAddress, formatToolName } from './types'
