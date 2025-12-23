export interface ToolExecutionInfo {
  toolName: string
  arguments?: Record<string, any>
}

export function getToolExecutionMessage(toolInfo: ToolExecutionInfo): string {
  const { toolName, arguments: args } = toolInfo

  switch (toolName) {
  // Compilation tools
  case 'solidity_compile':
    return `Compiling Solidity contract in ${args?.file}`

  case 'get_compilation_result':
    return 'Getting compilation results'

  case 'set_compiler_config':
    return `Setting compiler config${args?.version ? ` (v${args.version})` : ''}`

  case 'get_compiler_config':
    return 'Getting compiler config'

  case 'compile_with_hardhat':
    return 'Compiling with Hardhat'

  case 'compile_with_foundry':
    return 'Compiling with Foundry'

  case 'compile_with_truffle':
    return 'Compiling with Truffle'

  case 'get_compiler_versions':
    return 'Getting compiler versions'

  case 'foundry_compile':
    return 'Compiling with Foundry'

  case 'foundry_sync':
    return 'Syncing Foundry artifacts'

  case 'hardhat_compile':
    return 'Compiling with Hardhat'

  case 'hardhat_sync':
    return 'Syncing Hardhat artifacts'

  // File management tools
  case 'file_read':
    return `Reading file${args?.path ? ` ${args.path.split('/').pop()}` : ''}`

  case 'file_write':
    return `Writing file${args?.path ? ` ${args.path.split('/').pop()}` : ''}`

  case 'file_create':
    return `Creating ${args?.type || 'file'}${args?.path ? ` ${args.path.split('/').pop()}` : ''}`

  case 'file_delete':
    return `Deleting file${args?.path ? ` ${args.path.split('/').pop()}` : ''}`

  case 'file_move':
    return `Moving file${args?.sourcePath ? ` ${args.sourcePath.split('/').pop()}` : ''}`

  case 'file_copy':
    return `Copying file${args?.sourcePath ? ` ${args.sourcePath.split('/').pop()}` : ''}`

  case 'directory_list':
    return `Listing directory${args?.path ? ` ${args.path.split('/').pop()}` : ''}`

  case 'file_exists':
    return `Checking if file exists${args?.path ? ` ${args.path.split('/').pop()}` : ''}`

  // Deployment tools
  case 'deploy_contract':
    return `Deploying contract${args?.contractName ? ` ${args.contractName}` : ''}`

  case 'call_contract':
    return `Calling contract${args?.functionName ? ` ${args.functionName}` : ''}`

  case 'send_transaction':
    return 'Sending transaction'

  case 'get_deployed_contracts':
    return 'Getting deployed contracts'

  case 'set_execution_environment':
    return `Setting environment${args?.environment ? ` to ${args.environment}` : ''}`

  case 'get_account_balance':
    return `Getting balance${args?.address ? ` for ${args.address.substring(0, 10)}...` : ''}`

  case 'get_user_accounts':
    return 'Getting user accounts'

  case 'set_selected_account':
    return `Setting account${args?.address ? ` to ${args.address.substring(0, 10)}...` : ''}`

  case 'get_current_environment':
    return 'Getting current environment'

  case 'run_script':
    return `Running script${args?.scriptPath ? ` ${args.scriptPath.split('/').pop()}` : ''}`

  case 'simulate_transaction':
    return 'Simulating transaction'

  // Debugging tools
  case 'start_debug_session':
    return 'Starting debug session'

  case 'set_breakpoint':
    return `Setting breakpoint${args?.line ? ` at line ${args.line}` : ''}`

  // Analysis tools
  case 'solidity_scan':
    return `Scanning contract${args?.filePath ? ` ${args.filePath.split('/').pop()}` : ''}`

  case 'solidity_answer':
    return 'Analyzing Solidity code'

  // Tutorial tools
  case 'tutorials':
    return `Starting tutorial${args?.tutorial ? ` ${args.tutorial}` : ''}`

  // Data query tools
  case 'amp_query':
    return 'Querying blockchain data'

  // Math utilities
  case 'wei_to_ether':
    return `Converting ${args?.wei || ''} wei to ether`

  case 'ether_to_wei':
    return `Converting ${args?.ether || ''} ether to wei`

  // Visualization tools
  case 'chartjs_generate':
    return `Generating ${args?.chartType || 'chart'}`

  // Legacy/other tools
  case 'file_search':
    return 'Searching files'

  case 'execute_script':
    return 'Executing script'

  case 'get_balance':
    return `Getting balance${args?.address ? ` for ${args.address.substring(0, 10)}...` : ''}`

  case 'get_transaction':
    return `Retrieving transaction${args?.hash ? ` ${args.hash.substring(0, 10)}...` : ''}`

  case 'estimate_gas':
    return 'Estimating gas'

  case 'get_contract_code':
    return `Getting contract code${args?.address ? ` at ${args.address.substring(0, 10)}...` : ''}`

  case 'web_search':
    return `Searching web${args?.query ? `: ${args.query}` : ''}`

  default:
    return `Executing ${toolName.replace(/_/g, ' ')}`
  }
}
