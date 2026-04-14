/**
 * Human-in-the-Loop types for DeepAgent tool approval
 */

export interface ToolApprovalRequest {
  requestId: string
  toolName: string
  toolArgs: Record<string, any>
  toolDescription?: string
  category: ToolCategory
  risk: ToolRisk
  existingContent?: string
  proposedContent?: string
  filePath?: string
  timestamp: number
}

export interface ToolApprovalResponse {
  requestId: string
  approved: boolean
  modifiedArgs?: Record<string, any>
}

export type ToolCategory = 'file_write' | 'file_delete' | 'deployment' | 'transaction' | 'dapp' | 'other'
export type ToolRisk = 'low' | 'medium' | 'high'
export type ToolApprovalPolicy = 'always_ask' | 'ask_risky' | 'auto_approve'

export interface ToolPolicyConfig {
  defaultPolicy: ToolApprovalPolicy
  perToolOverrides?: Record<string, ToolApprovalPolicy>
}

// Read-only tools that never require approval
// Covers both deepagents built-in names and MCP tool names
const SAFE_TOOLS = new Set([
  'read_file', 'file_read', 'list_directory', 'ls',
  'get_current_file', 'get_opened_files', 'open_file',
  'get_contract_abi', 'get_compiler_config',
  'compile_solidity', 'solidity_compile', 'analyze_contract',
  'dapp_list', 'dapp_get_status', 'dapp_open', 'dapp_navigate',
  'get_deployed_contracts', 'debug_transaction'
])

const TOOL_METADATA: Record<string, { category: ToolCategory; risk: ToolRisk }> = {
  // deepagents built-in names
  write_file:       { category: 'file_write', risk: 'high' },
  edit_file:        { category: 'file_write', risk: 'high' },
  // MCP tool names (in case they differ)
  file_write:       { category: 'file_write', risk: 'high' },
  file_create:      { category: 'file_write', risk: 'high' },
  file_delete:      { category: 'file_delete', risk: 'high' },
  deploy_contract:  { category: 'deployment', risk: 'high' },
  set_compiler_config: { category: 'other', risk: 'medium' },
  send_transaction: { category: 'transaction', risk: 'high' },
  dapp_create:      { category: 'dapp', risk: 'medium' },
  dapp_update:      { category: 'dapp', risk: 'medium' },
}

export function isSafeTool(toolName: string): boolean {
  return SAFE_TOOLS.has(toolName)
}

export function getToolMetadata(toolName: string): { category: ToolCategory; risk: ToolRisk } {
  return TOOL_METADATA[toolName] || { category: 'other', risk: 'medium' }
}

export function shouldRequireApproval(toolName: string, policy: ToolApprovalPolicy): boolean {
  if (isSafeTool(toolName)) return false
  if (policy === 'auto_approve') return false
  if (policy === 'always_ask') return true
  // 'ask_risky': only ask for medium+ risk
  const meta = getToolMetadata(toolName)
  return meta.risk === 'medium' || meta.risk === 'high'
}
