import { ToolUIStringRegistry, getFileName, truncateAddress } from './types'

export const compilationToolStrings: ToolUIStringRegistry = {
  solidity_compile: (args) => {
    const file = args.path || args.filePath || args.fileName
    return file ? `Compiling ${getFileName(file)}` : 'Compiling Solidity contract...'
  },

  compile_solidity: (args) => {
    const file = args.path || args.filePath || args.fileName
    return file ? `Compiling ${getFileName(file)}` : 'Compiling Solidity contract...'
  },

  get_compilation_result: () =>
    'Getting compilation results...',

  get_compilation_result_sources_by_file_path: () =>
    'Getting compilation sources...',

  get_compiler_config: () =>
    'Getting compiler configuration...',

  set_compiler_config: (args) =>
    args.version ? `Setting compiler config (v${args.version})` : 'Setting compiler config...',

  get_compiler_versions: () =>
    'Getting available compiler versions...',

  get_contract_abi: (args) =>
    args.contractName ? `Getting ABI for ${args.contractName}` : 'Getting contract ABI...',

  get_verified_contract_from_etherscan: (args) =>
    args.address ? `Fetching verified contract ${truncateAddress(args.address)}` : 'Fetching verified contract from Etherscan...',

  compile_with_hardhat: () =>
    'Compiling with Hardhat...',

  hardhat_compile: () =>
    'Compiling with Hardhat...',

  compile_with_foundry: () =>
    'Compiling with Foundry...',

  foundry_compile: () =>
    'Compiling with Foundry...',

  compile_with_truffle: () =>
    'Compiling with Truffle...',

  hardhat_sync: () =>
    'Syncing Hardhat artifacts...',

  foundry_sync: () =>
    'Syncing Foundry artifacts...',

  analyze_contract: (args) =>
    args.contractName ? `Analyzing contract ${args.contractName}` : 'Analyzing contract...',

  slither_scan: (args) =>
    args.path ? `Running Slither scan on ${getFileName(args.path)}` : 'Running Slither security scan...',

  solidity_scan: (args) =>
    args.filePath ? `Scanning contract ${getFileName(args.filePath)}` : 'Scanning contract...',

  solidity_answer: () =>
    'Analyzing Solidity code...'
}
