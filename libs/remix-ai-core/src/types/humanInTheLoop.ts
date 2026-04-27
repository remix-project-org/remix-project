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
  timedOut?: boolean
}

export type ToolCategory = 'file_write' | 'file_delete' | 'deployment' | 'transaction' | 'dapp' | 'other'
export type ToolRisk = 'low' | 'medium' | 'high'
export type ToolApprovalPolicy = 'always_ask' | 'ask_risky' | 'auto_approve'

export interface ToolPolicyConfig {
  defaultPolicy: ToolApprovalPolicy
  perToolOverrides?: Record<string, ToolApprovalPolicy>
}

// Read-only tools that never require approval.
// Any tool NOT in this set and NOT in TOOL_METADATA defaults to { risk: 'medium' },
// which triggers the approval modal under the 'ask_risky' policy.
// When adding new MCP tools, register read-only ones here.
const SAFE_TOOLS = new Set([
  // --- File system (read-only) ---
  'read_file', 'file_read', 'read_file_chunk', 'grep_file',
  'list_directory', 'directory_list', 'ls',
  'get_current_file', 'get_opened_files', 'open_file',
  'file_exists',

  // --- Compilation & analysis (read-only results) ---
  'compile_solidity', 'solidity_compile', 'analyze_contract',
  'get_compilation_result', 'get_compilation_result_sources_by_file_path',
  'get_compiler_config', 'get_compiler_versions',
  'get_verified_contract_from_etherscan',
  'compile_with_hardhat', 'compile_with_foundry', 'compile_with_truffle',
  'get_contract_abi', 'slither_scan',

  // --- Debugging (read-only introspection) ---
  'debug_transaction', 'start_debug_session',
  'decode_local_variable', 'decode_state_variable',
  'get_valid_source_location_from_vm_trace_index',
  'extract_locals_at', 'decode_locals_at',
  'extract_state_at', 'decode_state_at',
  'storage_view_at', 'jump_to', 'get_stack_at', 'get_scopes_with_root',

  // --- Environment & account queries (read-only) ---
  'get_deployed_contracts', 'get_current_environment',
  'get_account_balance', 'get_user_accounts',
  'get_foundry_hardhat_info',

  // --- DApp (read-only) ---
  'dapp_list', 'dapp_get_status', 'dapp_open', 'dapp_navigate',

  // --- Skills (deepagents built-in, read-only) ---
  'get_skill', 'list_skills',

  // --- Utilities (pure computation, no side effects) ---
  'wei_to_ether', 'ether_to_wei', 'decimal_to_hex', 'hex_to_decimal', 'timestamp_to_date',
  'chartjs_generate',

  // --- Tutorials (read-only) ---
  'tutorials_list', 'start_tutorial',

  // --- AMP (read-only queries) ---
  'amp_query', 'amp_dataset_manifest',
])

/**
 * Tools where ToolApprovalGate should write the file directly after approval,
 * bypassing the handler's execute() which would trigger a second review via showCustomDiff.
 * This prevents the double-approval problem.
 */
export const DIRECT_WRITE_TOOLS = new Set([
  'file_write', 'file_create', 'file_replace'
])

const TOOL_METADATA: Record<string, { category: ToolCategory; risk: ToolRisk }> = {
  // deepagents built-in names
  write_file:       { category: 'file_write', risk: 'high' },
  edit_file:        { category: 'file_write', risk: 'high' },
  // MCP tool names
  file_write:       { category: 'file_write', risk: 'high' },
  file_create:      { category: 'file_write', risk: 'high' },
  file_replace:     { category: 'file_write', risk: 'high' },
  file_delete:      { category: 'file_delete', risk: 'high' },
  file_move:        { category: 'file_write', risk: 'high' },
  file_copy:        { category: 'file_write', risk: 'medium' },
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
