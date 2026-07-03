import type { DynamicStructuredTool } from '@langchain/core/tools'

export function getBasicFileToolsForGasOptimizer(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const basicFileToolNames: string[] = []

  const basicFileTools = tools.filter(tool =>
    basicFileToolNames.includes(tool.name)
  )
  return basicFileTools
}

export function getSecurityToolsForSecurityAuditor(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const coordinationToolNames: string[] = [
    'slither_scan'
  ]

  const coordinationTools = tools.filter(tool =>
    coordinationToolNames.includes(tool.name)
  )
  return coordinationTools
}

export function getEducationToolsForWeb3Educator(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const educationToolNames = [
    'start_tutorial',
    'tutorials_list'
  ]

  const educationTools = tools.filter(tool =>
    educationToolNames.includes(tool.name)
  )
  return educationTools
}

export function getDebugToolsForDebugSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const debugToolNames = [
    // Debug session management
    'start_debug_session',
    // Variable decoding
    'decode_local_variable',
    'decode_state_variable',
    // Variable extraction
    'extract_locals_at',
    'decode_locals_at',
    'extract_state_at',
    'decode_state_at',
    // Storage and stack inspection
    'storage_view_at',
    'get_stack_at',
    // Navigation and scope analysis
    'jump_to',
    'get_scopes_with_root',
    // Source mapping
    'get_valid_source_location_from_vm_trace_index'
  ]

  const debugTools = tools.filter(tool =>
    debugToolNames.includes(tool.name)
  )
  return debugTools
}

export function getSolidityToolsForSolidityEngineer(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const solidityTools = tools.filter(tool => {
    // Check if tool name starts with "solidity"
    return tool.name.toLowerCase().startsWith('solidity') && tool.name.toLowerCase() !== 'solidity_compile' // Exclude general compiler tool if it exists
  })

  return solidityTools
}

export function getWebSearchToolsForWebSearchSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const webSearchToolNames = [
    'full_web_search',
    'get_web_search_summaries',
    'get_single_web_page_content'
  ]

  const webSearchTools = tools.filter(tool =>
    webSearchToolNames.includes(tool.name)
  )

  return webSearchTools
}

export function getToolForSolidityCompiler(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const classifierToolNames = [
    'solidity_compile', 'get_compilation_result', 'get_compilation_result_sources_by_file_path', 'set_compiler_config',
    'get_compiler_config', 'get_compiler_versions'
  ]

  const classifierTools = tools.filter(tool =>
    classifierToolNames.includes(tool.name)
  )

  return classifierTools
}

export function getToolsForDeployer(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const classifierToolNames = [
    'deploy_contract', 'call_contract', 'send_transaction', 'get_deployed_contracts', 'set_execution_environment', 'get_account_balance',
    'get_user_accounts', 'set_selected_account', 'get_current_environment', 'run_script', 'simulate_transaction', 'add_instance'
  ]

  const classifierTools = tools.filter(tool =>
    classifierToolNames.includes(tool.name)
  )

  return classifierTools
}

export function getToolForClassifierSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const classifierToolNames = [
    'classify_contract'
  ]

  const classifierTools = tools.filter(tool =>
    classifierToolNames.includes(tool.name)
  )

  return classifierTools
}

export function getConversionToolsForConversionSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const conversionToolNames = [
    'wei_to_ether',
    'ether_to_wei',
    'decimal_to_hex',
    'hex_to_decimal',
    'timestamp_to_date'
  ]

  const conversionTools = tools.filter(tool =>
    conversionToolNames.includes(tool.name)
  )

  return conversionTools
}

export function getEtherscanToolsForEtherscanSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const etherscanTools = tools.filter(tool => {
    // Check if tool comes from Etherscan MCP server
    const description = tool.description.toLowerCase()
    return description.includes('[etherscan]') ||
      tool.name.toLowerCase().includes('etherscan') ||
      description.includes('etherscan')
  })

  return etherscanTools
}

export function getTheGraphToolsForTheGraphSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const theGraphTools = tools.filter(tool => {
    // Check if tool comes from TheGraph MCP server
    const description = tool.description.toLowerCase()
    return description.includes('[the graph api]') ||
      description.includes('[thegraph]') ||
      tool.name.toLowerCase().includes('thegraph') ||
      tool.name.toLowerCase().includes('graph') ||
      description.includes('thegraph') ||
      description.includes('subgraph') ||
      description.includes('graphql')
  })

  return theGraphTools
}

export function getAlchemyToolsForAlchemySpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const alchemyTools = tools.filter(tool => {
    // Check if tool comes from Alchemy MCP server
    const description = tool.description.toLowerCase()
    return description.includes('[alchemy]') ||
      tool.name.toLowerCase().includes('alchemy') ||
      description.includes('alchemy')
  })

  return alchemyTools
}

export function getCircleToolsForCircleSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const circleToolNames = [
    'search_circle_documentation',
    'get_circle_product_summary',
    'list_available_coding_resources',
    'get_coding_resource_details'
  ]

  const circleTools = tools.filter(tool =>
    circleToolNames.includes(tool.name)
  )

  return circleTools
}

export function filterOutSpecialistTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const etherscanToolNames = new Set(getEtherscanToolsForEtherscanSpecialist(tools).map(t => t.name))
  const theGraphToolNames = new Set(getTheGraphToolsForTheGraphSpecialist(tools).map(t => t.name))
  const alchemyToolNames = new Set(getAlchemyToolsForAlchemySpecialist(tools).map(t => t.name))
  const circleToolNames = new Set(getCircleToolsForCircleSpecialist(tools).map(t => t.name))
  const educationToolNames = new Set(getEducationToolsForWeb3Educator(tools).map(t => t.name))
  const securityToolNames = new Set(getSecurityToolsForSecurityAuditor(tools).map(t => t.name))
  const debugToolNames = new Set(getDebugToolsForDebugSpecialist(tools).map(t => t.name))
  const solidityToolNames = new Set(getSolidityToolsForSolidityEngineer(tools).map(t => t.name))
  const webSearchToolNames = new Set(getWebSearchToolsForWebSearchSpecialist(tools).map(t => t.name))
  const frontendToolNames = new Set(getQuickDappToolsForQuickDappSpecialist(tools).map(t => t.name))
  const conversionToolNames = new Set(getConversionToolsForConversionSpecialist(tools).map(t => t.name))
  const soldityComplierToolNames = new Set(getToolForSolidityCompiler(tools).map(t => t.name))
  const contractRunnerToolNames = new Set(getToolsForDeployer(tools).map(t => t.name))

  const filteredTools = tools.filter(tool =>
    !etherscanToolNames.has(tool.name) &&
    !theGraphToolNames.has(tool.name) &&
    !alchemyToolNames.has(tool.name) &&
    !circleToolNames.has(tool.name) &&
    !educationToolNames.has(tool.name) &&
    !securityToolNames.has(tool.name) &&
    !debugToolNames.has(tool.name) &&
    !solidityToolNames.has(tool.name) &&
    !webSearchToolNames.has(tool.name) &&
    !conversionToolNames.has(tool.name) &&
    !frontendToolNames.has(tool.name) &&
    !soldityComplierToolNames.has(tool.name) &&
    !contractRunnerToolNames.has(tool.name)
  )
  return filteredTools
}

export function getFileOperationTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const fileOperationToolNames = [
    'directory_list',
    'read_file_chunk',
    'grep_file'
  ]

  // Return tools that start with 'file_' or are in the specific list
  const fileOperationTools = tools.filter(tool =>
    tool.name.startsWith('file_') ||
    fileOperationToolNames.includes(tool.name)
  )

  return fileOperationTools
}

export function filterOutFileOperationTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const fileOperationToolNames = [
    'directory_list',
    'read_file_chunk',
    'grep_file'
  ]

  // Filter tools that start with 'file_' or are in the specific list
  const filteredTools = tools.filter(tool =>
    !tool.name.startsWith('file_') &&
    !fileOperationToolNames.includes(tool.name)
  )

  return filteredTools
}

export function getQuickDappToolsForQuickDappSpecialist(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const quickDappToolNames = [
    'generate_dapp',
    'generate_graph_dapp',
    'update_dapp',
    'list_dapps',
    'finalize_dapp_generation',
    'fetch_figma_design',
    'get_deployed_contracts',
    'get_current_environment'
  ]
  return tools.filter(tool => quickDappToolNames.includes(tool.name))
}
