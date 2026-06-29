import { ToolUIStringRegistry, getFileName, truncateAddress } from './types'

export const deploymentToolStrings: ToolUIStringRegistry = {
  deploy_contract: (args) =>
    args.contractName ? `Deploying contract ${args.contractName}` : 'Deploying contract...',

  call_contract: (args) =>
    args.functionName ? `Calling ${args.functionName}` : 'Calling contract...',

  send_transaction: () =>
    'Sending transaction...',

  simulate_transaction: () =>
    'Simulating transaction...',

  get_deployed_contracts: () =>
    'Getting deployed contracts...',

  set_execution_environment: (args) =>
    args.environment ? `Setting environment to ${args.environment}` : 'Setting execution environment...',

  get_current_environment: () =>
    'Getting current environment...',

  get_account_balance: (args) =>
    args.address ? `Getting balance for ${truncateAddress(args.address)}` : 'Getting account balance...',

  get_balance: (args) =>
    args.address ? `Getting balance for ${truncateAddress(args.address)}` : 'Getting account balance...',

  get_user_accounts: () =>
    'Getting user accounts...',

  set_selected_account: (args) =>
    args.address ? `Setting account to ${truncateAddress(args.address)}` : 'Setting selected account...',

  run_script: (args) =>
    args.scriptPath ? `Running script ${getFileName(args.scriptPath)}` : 'Running script...',

  execute_script: (args) =>
    args.path ? `Executing script ${getFileName(args.path)}` : 'Executing script...',

  get_transaction: (args) =>
    args.hash ? `Retrieving transaction ${truncateAddress(args.hash)}` : 'Retrieving transaction...',

  get_contract_code: (args) =>
    args.address ? `Getting contract code at ${truncateAddress(args.address)}` : 'Getting contract code...',

  estimate_gas: () =>
    'Estimating gas...'
}
