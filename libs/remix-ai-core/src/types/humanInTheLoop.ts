/**
 * Human-in-the-Loop types for DeepAgent tool approval
 */

/**
 * What a screen capture is about to send, phrased for the consent card rather
 * than for the model. Only present on `screen_capture` requests.
 */
export interface ScreenCaptureConsentInfo {
  /** The model's own `reason` argument — the thing its schema has always promised to show. */
  reason?: string
  /** What is being captured: "the whole Remix IDE window", a selector, or a described element. */
  targetLabel: string
  /** False when the model asked for one region rather than the entire IDE. */
  wholeIde: boolean
  /** Display name of the model the image would be sent to. */
  modelName?: string
}

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
  /** Set for `screen_capture` only — drives the consent card. */
  consent?: ScreenCaptureConsentInfo
}

export interface ToolApprovalResponse {
  requestId: string
  approved: boolean
  modifiedArgs?: Record<string, any>
  timedOut?: boolean
  /**
   * How long the decision holds. Only sent by the screen-capture consent card.
   * Absent means "this once, remember nothing" — which is also what a
   * cancelled run resolves to, so a stop is never mistaken for a decision.
   */
  scope?: ApprovalScope
}

export type ToolCategory = 'file_write' | 'file_delete' | 'deployment' | 'transaction' | 'dapp' | 'screen_capture' | 'other'
/** Emitted (as 'onAIFileChanged') after the agent has written a file */
export interface AIFileChange {
  path: string
  existed: boolean
  oldContent: string
  newContent: string
  timestamp: number
  deleted?: boolean
  /** Set when the file was moved: its previous path */
  movedFrom?: string
  /** 'rejected': the user rejected the change, newContent is what the agent proposed */
  status?: 'rejected'
}

/** An AIFileChange as kept on the assistant message, with where it happened */
export interface AIFileChangeRecord extends AIFileChange {
  workspace?: string
  /** HEAD commit at the time of the change, when the workspace is a git repo */
  gitHead?: string
  /** Chat bubble that was streaming when the change happened */
  messageId?: string
  /** End of that bubble's text at that moment: where the change is shown in the answer */
  anchor?: string
}

export type ToolRisk = 'low' | 'medium' | 'high'
/**
 * What the model is told when its run stopped before the user answered. Kept
 * apart from REJECTED: the user said nothing, so this must not read as a "no".
 */
export const APPROVAL_CANCELLED_REASON = 'CANCELLED: The run stopped before the user answered this approval request, so the operation was NOT performed. This is not a rejection by the user — if the work is still needed, it can be requested again in a new turn.'

export type ToolApprovalPolicy = 'always_ask' | 'ask_risky' | 'auto_approve'
export type ApprovalScope = 'once' | 'session' | 'always' | 'deny'

/** Persisted screen-capture policy, stored at `settings/ai-screen-capture-consent`. */
export type ScreenCapturePolicy = 'ask' | 'always' | 'never'
export const SCREEN_CAPTURE_SETTING = 'ai-screen-capture-consent'

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
  'list_dapps', 'dapp_list', 'dapp_get_status', 'dapp_open', 'dapp_navigate',

  // --- Skills (deepagents built-in, read-only) ---
  'get_skill', 'list_skills',

  // --- Utilities (pure computation, no side effects) ---
  'wei_to_ether', 'ether_to_wei', 'decimal_to_hex', 'hex_to_decimal', 'timestamp_to_date',
  'chartjs_generate',

  // --- Tutorials (read-only) ---
  'tutorials_list', 'start_tutorial',

  // --- AMP (read-only queries) ---
  'amp_query', 'amp_dataset_manifest',

  // --- UI vision (read-only introspection of what is on screen) ---
  // `capture_ui_screenshot` is deliberately NOT here: it reads the screen the
  // same way, but it ships a picture of the user's editor to a model provider.
  // That needs consent, not a risk score — see CONSENT_TOOLS.
  'inspect_ui', 'get_ui_state', 'get_ui_map', 'scroll_element',

  // --- DApp generation/update setup ---
  // update_dapp only prepares the target workspace and returns file-edit instructions.
  // Actual source changes still go through write_file/edit_file approval.
  'generate_dapp',
  'update_dapp',
  'fetch_figma_design',
  // Read-only view of the model catalogue.
  'list_models',
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
  // Actual MCP tool names used by DAppGeneratorHandler
  generate_dapp:    { category: 'dapp', risk: 'low' },
  update_dapp:      { category: 'dapp', risk: 'medium' },
  // Sends a picture of the user's screen to a model provider.
  capture_ui_screenshot: { category: 'screen_capture', risk: 'medium' },
  // UI automation drives the user's IDE directly — always confirm.
  click_element:     { category: 'other', risk: 'high' },
  type_into_element: { category: 'other', risk: 'high' },
  // Changes a setting the user chose and can change what their usage costs, so
  // the approval modal is the confirmation step on the agent-driven path.
  switch_model:     { category: 'other', risk: 'medium' },
}

/**
 * Tools whose gate is consent, not risk. These always reach the gate —
 * the approval *policy* (including 'auto_approve') must not be able to answer
 * a privacy question on the user's behalf. What they ask, and whether the
 * answer is remembered, is decided by the screen-capture policy instead.
 */
export const CONSENT_TOOLS = new Set(['capture_ui_screenshot'])

export function isConsentTool(toolName: string): boolean {
  return CONSENT_TOOLS.has(toolName)
}

export function isSafeTool(toolName: string): boolean {
  return SAFE_TOOLS.has(toolName)
}

export function getToolMetadata(toolName: string): { category: ToolCategory; risk: ToolRisk } {
  return TOOL_METADATA[toolName] || { category: 'other', risk: 'medium' }
}

export function shouldRequireApproval(toolName: string, policy: ToolApprovalPolicy): boolean {
  // Consent tools bypass the policy entirely — see CONSENT_TOOLS.
  if (isConsentTool(toolName)) return true
  if (isSafeTool(toolName)) return false
  if (policy === 'auto_approve') return false
  if (policy === 'always_ask') return true
  // 'ask_risky': only ask for medium+ risk
  const meta = getToolMetadata(toolName)
  return meta.risk === 'medium' || meta.risk === 'high'
}
