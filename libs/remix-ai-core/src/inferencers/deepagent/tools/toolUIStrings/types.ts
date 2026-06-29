
export type ToolUIStringResolver = (args: Record<string, any>) => string

export interface ToolUIStringRegistry {
  [toolName: string]: ToolUIStringResolver
}

export function getFileName(path: string): string {
  return path.split('/').pop() || path
}

export function truncateAddress(address: string): string {
  if (address.length <= 13) return address
  return `${address.substring(0, 10)}...`
}

export function formatToolName(toolName: string): string {
  return toolName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim()
}
