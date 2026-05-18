import type { DynamicStructuredTool } from '@langchain/core/tools'

export function getBasicMcpToolsForSecurityAuditor(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const basicToolNames = [
    'slither_scan'
  ]

  const basicTools = tools.filter(tool =>
    basicToolNames.includes(tool.name)
  )
  return basicTools
}

export function getBasicFileToolsForGasOptimizer(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const basicFileToolNames: string[] = []

  const basicFileTools = tools.filter(tool =>
    basicFileToolNames.includes(tool.name)
  )
  return basicFileTools
}

export function getCoordinationToolsForComprehensiveAuditor(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const coordinationToolNames: string[] = [
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

export function getSecurityToolsForSecurityAuditor(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  const securityTools = tools.filter(tool => {
    // Check if tool comes from Security Auditor MCP server
    const description = tool.description.toLowerCase()
    return description.includes('[security]') ||
           tool.name.toLowerCase().includes('slither_scan') ||
           description.includes('security')
  })

  return securityTools
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
  const conversionToolNames = new Set(getConversionToolsForConversionSpecialist(tools).map(t => t.name))

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
    !conversionToolNames.has(tool.name)
  )
  return filteredTools
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
