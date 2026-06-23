import { SubAgent, CompiledSubAgent, createDeepAgent } from 'deepagents'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
  FRONTEND_SPECIALIST_SUBAGENT_PROMPT,
  ETHERSCAN_SUBAGENT_PROMPT,
  THEGRAPH_SUBAGENT_PROMPT,
  ALCHEMY_SUBAGENT_PROMPT,
  GAS_OPTIMIZER_SUBAGENT_PROMPT,
  COMPREHENSIVE_AUDITOR_SUBAGENT_PROMPT,
  CONVERSION_UTILITIES_SUBAGENT_PROMPT,
  DEBUG_SPECIALIST_SUBAGENT_PROMPT,
  WEB_SEARCH_SUBAGENT_PROMPT,
  CIRCLE_SUBAGENT_PROMPT,
  QUICKDAPP_SPECIALIST_SUBAGENT_PROMPT,
  CONTRACT_RUNNER_PROMPT,
  CONTRACT_COMPILER_PROMPT,
  CONTRACT_CLASSIFIER_PROMPT,
  SOLIDITY_CODE_GENERATION_PROMPT
} from './prompts/system/lightPrompts'
import {
  getBasicFileToolsForGasOptimizer,
  getDebugToolsForDebugSpecialist,
  getSolidityToolsForSolidityEngineer,
  getWebSearchToolsForWebSearchSpecialist,
  getConversionToolsForConversionSpecialist,
  getEtherscanToolsForEtherscanSpecialist,
  getAlchemyToolsForAlchemySpecialist,
  getTheGraphToolsForTheGraphSpecialist,
  getCircleToolsForCircleSpecialist,
  getFileOperationTools,
  getToolForClassifierSpecialist,
  getQuickDappToolsForQuickDappSpecialist,
  getToolForSolidityCompiler,
  getToolsForDeployer,
  getSecurityToolsForSecurityAuditor
} from './helpers/subagentToolFilters'
import { Features } from '@remix-api'

export interface SubagentConfigItem {
  name: string
  systemPrompt: string
  model: BaseChatModel
  tools: DynamicStructuredTool[]
  backend?: any
  description?: string | undefined
}

export async function buildSubagentConfigs(
  tools: DynamicStructuredTool[],
  model: BaseChatModel,
  filesystemBackend: any,
  fallbackModel: BaseChatModel,
): Promise<(SubAgent | CompiledSubAgent)[]> {
  // Check permissions
  const plugin = filesystemBackend.plugin
  const hasFeature = async (feature: string): Promise<boolean> => {
    try {
      return !!(await plugin.call('assistantState', 'hasFeature', feature))
    } catch {
      return false
    }
  }

  const hasAuditorPermission = await hasFeature(Features.AI_AUDITOR)
  const hasTheGraphPermission = await hasFeature(Features.MCP_THEGRAPH)
  const hasEtherscanPermission = await hasFeature(Features.MCP_ETHERSCAN)
  const hasAlchemyPermission = await hasFeature(Features.MCP_ALCHEMY)
  const hasWebSearchPermission = await hasFeature(Features.MCP_WEB_SEARCH)
  const hasCirclePermission = await hasFeature(Features.MCP_CIRCLE)
  const hasOZpermission = await hasFeature(Features.MCP_OPENZEPPELIN)
  const hasQuickdappPermission = await hasFeature(Features.DAPP_QUICKDAPP)

  const etherscanTools = getEtherscanToolsForEtherscanSpecialist(tools)
  const theGraphTools = getTheGraphToolsForTheGraphSpecialist(tools)
  const alchemyTools = getAlchemyToolsForAlchemySpecialist(tools)
  const circleTools = getCircleToolsForCircleSpecialist(tools)
  const basicFileTools = getBasicFileToolsForGasOptimizer(tools)
  const fileOperationTools = getFileOperationTools(tools)
  const securityTools = [...getSecurityToolsForSecurityAuditor(tools), ...fileOperationTools]
  const debugTools = getDebugToolsForDebugSpecialist(tools)
  const solidityTools = [...getSolidityToolsForSolidityEngineer(tools), ...fileOperationTools]
  const webSearchTools = getWebSearchToolsForWebSearchSpecialist(tools)
  const conversionTools = getConversionToolsForConversionSpecialist(tools)
  const classifierTools = getToolForClassifierSpecialist(tools)
  // Merge in fileOperationTools (file_write, file_read, directory_list, …) the same
  // way Solidity Engineer / Comprehensive Auditor do — the QUICKDAPP_SPECIALIST
  // prompt explicitly tells the LLM to "use file_write for implementation", so
  // file_* tools must be exposed. Without these the specialist also cannot emit
  // per-file tool cards ("Writing index.html…") during DApp generation.
  const quickDappTools = getQuickDappToolsForQuickDappSpecialist(tools)
  const solidityCompilerTools = getToolForSolidityCompiler(tools)
  const deployerTools = getToolsForDeployer(tools)

  const modelAny = model as any
  const agents: (SubAgent | CompiledSubAgent)[] = [
    // Always available
    {
      name: 'Solidity_Compiler',
      systemPrompt: CONTRACT_COMPILER_PROMPT,
      model,
      tools: solidityCompilerTools,
      description: CONTRACT_COMPILER_PROMPT
    },
    {
      name: 'Contract_Runner',
      systemPrompt: CONTRACT_RUNNER_PROMPT,
      model,
      tools: deployerTools,
      description: CONTRACT_RUNNER_PROMPT
    },

    {
      name: 'Debug_Specialist',
      systemPrompt: DEBUG_SPECIALIST_SUBAGENT_PROMPT,
      model: modelAny,
      tools: debugTools,
      description: 'Specializes in debugging and troubleshooting smart contract issues.'
    },
    {
      name: 'Conversion_Utilities_Specialist',
      systemPrompt: CONVERSION_UTILITIES_SUBAGENT_PROMPT,
      model: modelAny,
      tools: conversionTools,
      description: 'Specializes in providing conversion utilities for various data formats.'
    }
  ]

  // dapp:quickdapp permission required
  if (hasQuickdappPermission) {
    agents.push({
      name: 'QuickDapp_Specialist',
      systemPrompt: QUICKDAPP_SPECIALIST_SUBAGENT_PROMPT,
      model: fallbackModel,
      tools: quickDappTools,
      description: 'Used whenever you are tasked with generating and updating DApp frontends. When you are proposing a solution that involves writing a frontend app only mention the quickdapp specialist agent.'
    })
  }

  // ai:auditor permission required
  if (hasAuditorPermission) {
    agents.push(
      {
        name: 'Gas_Optimizer',
        systemPrompt: GAS_OPTIMIZER_SUBAGENT_PROMPT,
        model: fallbackModel,
        tools: basicFileTools,
        description: 'Specializes in optimizing gas usage in smart contracts.',
        skills: ['/skills/solidity-gas-optimization']
      },
      {
        name: 'Contract_Classifier',
        systemPrompt: CONTRACT_CLASSIFIER_PROMPT,
        model,
        tools: classifierTools,
        description: 'Specializes in analyzing and classifying smart contract features and architectural patterns for targeted analysis.'
      },
      {
        systemPrompt: COMPREHENSIVE_AUDITOR_SUBAGENT_PROMPT,
        model: fallbackModel,
        tools: securityTools,
        name: 'Comprehensive_Auditor',
        description: 'Specializes in comprehensive auditing and analysis of smart contracts.',
      }
    )
  }

  if (hasWebSearchPermission) {
    agents.push(
      {
        name: 'Web_Search_Specialist',
        systemPrompt: WEB_SEARCH_SUBAGENT_PROMPT,
        model,
        tools: webSearchTools,
        description: 'Specializes in searching and retrieving information from web sources.'
      }
    )
  }

  if (hasCirclePermission) {
    agents.push({
      name: 'Circle_Specialist',
      systemPrompt: CIRCLE_SUBAGENT_PROMPT,
      model,
      tools: circleTools,
      description: 'Specializes in Circle product documentation, APIs, and development resources.'
    })
  }

  if (hasEtherscanPermission) {
    agents.push(
      {
        name: 'Etherscan_Specialist',
        systemPrompt: ETHERSCAN_SUBAGENT_PROMPT,
        model,
        tools: etherscanTools,
        description: 'Specializes in analyzing and retrieving data from the Etherscan blockchain explorer.'
      }
    )
  }

  if (hasTheGraphPermission) {
    agents.push(
      {
        name: 'TheGraph_Specialist',
        systemPrompt: THEGRAPH_SUBAGENT_PROMPT,
        model,
        tools: theGraphTools,
        description: 'Specializes in analyzing and retrieving data from TheGraph decentralized query protocol.'
      }
    )
  }

  if (hasAlchemyPermission) {
    agents.push(
      {
        name: 'Alchemy_Specialist',
        systemPrompt: ALCHEMY_SUBAGENT_PROMPT,
        model,
        tools: alchemyTools,
        description: 'Specializes in analyzing and retrieving data from the Alchemy blockchain infrastructure.'
      }
    )
  }
  if (hasOZpermission) {
    agents.push(
      {
        name: 'Advanced_Solidity_Developer',
        systemPrompt: SOLIDITY_CODE_GENERATION_PROMPT,
        model: fallbackModel,
        tools: solidityTools,
        description: 'Specializes in writing solidity code using openzeppelin libraries. Always pass the current solidity configuration to this subagent. When asked to generate solidity code, always start with the Advanced_Solidity_Developer subagent.'
      }
    )
  }

  return agents
}
