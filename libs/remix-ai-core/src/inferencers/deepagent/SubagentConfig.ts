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
  filesystemBackend: any
): Promise<(SubAgent | CompiledSubAgent)[]> {
  // Check permissions
  const plugin = filesystemBackend.plugin
  const hasAuditorPermission = await plugin.call('auth', 'hasPermission', 'ai:auditor')
  const hasTheGraphPermission = await plugin.call('auth', 'hasPermission', 'mcp:thegraph')
  const hasEtherscanPermission = await plugin.call('auth', 'hasPermission', 'mcp:etherscan')
  const hasAlchemyPermission = await plugin.call('auth', 'hasPermission', 'mcp:alchemy')
  const hasWebSearchPermission = await plugin.call('auth', 'hasPermission', 'mcp:web-search')
  const hasCirclePermission = await plugin.call('auth', 'hasPermission', 'mcp:circle')
  const hasOZpermission = await plugin.call('auth', 'hasPermission', 'mcp:openzeppelin')
  const hasQuickdappPermission = await plugin.call('auth', 'hasPermission', 'dapp:quickdapp')

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
  const quickDappTools = getQuickDappToolsForQuickDappSpecialist(tools)
  const solidityCompilerTools = getToolForSolidityCompiler(tools)
  const deployerTools = getToolsForDeployer(tools)

  const modelAny = model as any
  const agents: (SubAgent | CompiledSubAgent)[] = [
    // Always available
    {
      name: 'Solidity Compiler',
      systemPrompt: CONTRACT_COMPILER_PROMPT,
      model,
      tools: solidityCompilerTools,
      description: CONTRACT_COMPILER_PROMPT
    },
    {
      name: 'Contract Runner',
      systemPrompt: CONTRACT_RUNNER_PROMPT,
      model,
      tools: deployerTools,
      description: CONTRACT_RUNNER_PROMPT
    },

    {
      name: 'Debug Specialist',
      systemPrompt: DEBUG_SPECIALIST_SUBAGENT_PROMPT,
      model: modelAny,
      tools: debugTools,
      description: 'Specializes in debugging and troubleshooting smart contract issues.'
    },
    {
      name: 'Conversion Utilities Specialist',
      systemPrompt: CONVERSION_UTILITIES_SUBAGENT_PROMPT,
      model: modelAny,
      tools: conversionTools,
      description: 'Specializes in providing conversion utilities for various data formats.'
    }
  ]

  // dapp:quickdapp permission required
  if (hasQuickdappPermission) {
    agents.push({
      name: 'QuickDapp Specialist',
      systemPrompt: QUICKDAPP_SPECIALIST_SUBAGENT_PROMPT,
      model: modelAny,
      tools: quickDappTools,
      description: 'Specializes in generating and updating React-based DApp frontends using file_write tools.'
    })
  }

  // ai:auditor permission required
  if (hasAuditorPermission) {
    agents.push(
      {
        name: 'Gas Optimizer',
        systemPrompt: GAS_OPTIMIZER_SUBAGENT_PROMPT,
        model,
        tools: basicFileTools,
        description: 'Specializes in optimizing gas usage in smart contracts.',
        skills: ['/skills/solidity-gas-optimization']
      },
      {
        name: 'Contract Classifier',
        systemPrompt: CONTRACT_CLASSIFIER_PROMPT,
        model,
        tools: classifierTools,
        description: 'Specializes in analyzing and classifying smart contract features and architectural patterns for targeted analysis.'
      },
      {
        systemPrompt: COMPREHENSIVE_AUDITOR_SUBAGENT_PROMPT,
        tools: securityTools,
        name: 'Comprehensive Auditor',
        description: 'Specializes in comprehensive auditing and analysis of smart contracts.',
      }
    )
  }

  if (hasWebSearchPermission) {
    agents.push(
      {
        name: 'Web Search Specialist',
        systemPrompt: WEB_SEARCH_SUBAGENT_PROMPT,
        model,
        tools: webSearchTools,
        description: 'Specializes in searching and retrieving information from web sources.'
      }
    )
  }

  if (hasCirclePermission) {
    agents.push({
      name: 'Circle Specialist',
      systemPrompt: CIRCLE_SUBAGENT_PROMPT,
      model,
      tools: circleTools,
      description: 'Specializes in Circle product documentation, APIs, and development resources.'
    })
  }

  if (hasEtherscanPermission) {
    agents.push(
      {
        name: 'Etherscan Specialist',
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
        name: 'TheGraph Specialist',
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
        name: 'Alchemy Specialist',
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
        name: 'Advanced Solidity Developer',
        systemPrompt: SOLIDITY_CODE_GENERATION_PROMPT,
        model,
        tools: solidityTools,
        description: 'Specializes in writting solidity code using openzeppelin libraries'
      }
    )
  }

  return agents
}
