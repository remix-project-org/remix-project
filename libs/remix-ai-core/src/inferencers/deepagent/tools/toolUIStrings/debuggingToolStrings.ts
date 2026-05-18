import { ToolUIStringRegistry, truncateAddress } from './types'

export const debuggingToolStrings: ToolUIStringRegistry = {
  debug_transaction: (args) =>
    args.txHash ? `Debugging transaction ${truncateAddress(args.txHash)}` : 'Debugging transaction...',

  start_debug_session: () =>
    'Starting debug session...',

  decode_local_variable: (args) =>
    args.name ? `Decoding local variable ${args.name}` : 'Decoding local variable...',

  decode_state_variable: (args) =>
    args.name ? `Decoding state variable ${args.name}` : 'Decoding state variable...',

  get_valid_source_location_from_vm_trace_index: () =>
    'Getting source location...',

  extract_locals_at: () =>
    'Extracting local variables...',

  decode_locals_at: () =>
    'Decoding local variables...',

  extract_state_at: () =>
    'Extracting state...',

  decode_state_at: () =>
    'Decoding state...',

  storage_view_at: () =>
    'Viewing storage...',

  jump_to: (args) =>
    args.step ? `Jumping to step ${args.step}` : 'Jumping to location...',

  get_stack_at: () =>
    'Getting stack...',

  get_scopes_with_root: () =>
    'Getting scopes...',

  set_breakpoint: (args) =>
    args.line ? `Setting breakpoint at line ${args.line}` : 'Setting breakpoint...'
}
