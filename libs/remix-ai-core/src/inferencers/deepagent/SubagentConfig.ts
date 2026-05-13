import { SubAgent, CompiledSubAgent } from 'deepagents'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
  SECURITY_AUDITOR_SUBAGENT_PROMPT,
  CODE_REVIEWER_SUBAGENT_PROMPT,
  FRONTEND_SPECIALIST_SUBAGENT_PROMPT,
  ETHERSCAN_SUBAGENT_PROMPT,
  THEGRAPH_SUBAGENT_PROMPT,
  ALCHEMY_SUBAGENT_PROMPT,
  GAS_OPTIMIZER_SUBAGENT_PROMPT,
  COMPREHENSIVE_AUDITOR_SUBAGENT_PROMPT,
  WEB3_EDUCATOR_SUBAGENT_PROMPT,
  CONVERSION_UTILITIES_SUBAGENT_PROMPT,
  DEBUG_SPECIALIST_SUBAGENT_PROMPT,
  SOLIDITY_ENGINEER_SUBAGENT_PROMPT,
  WEB_SEARCH_SUBAGENT_PROMPT,
  CIRCLE_SUBAGENT_PROMPT
} from './prompts/system/lightPrompts'
import {
  getBasicMcpToolsForSecurityAuditor,
  getBasicFileToolsForGasOptimizer,
  getCoordinationToolsForComprehensiveAuditor,
  getEducationToolsForWeb3Educator,
  getDebugToolsForDebugSpecialist,
  getSolidityToolsForSolidityEngineer,
  getWebSearchToolsForWebSearchSpecialist,
  getConversionToolsForConversionSpecialist,
  getEtherscanToolsForEtherscanSpecialist,
  getAlchemyToolsForAlchemySpecialist,
  getTheGraphToolsForTheGraphSpecialist,
  getCircleToolsForCircleSpecialist
} from './helpers/subagentToolFilters'

export interface SubagentConfigItem {
  name: string
  systemPrompt: string
  model: BaseChatModel
  tools: DynamicStructuredTool[]
  backend?: any
  description?: string | undefined
}

export function buildSubagentConfigs(
  tools: DynamicStructuredTool[],
  model: BaseChatModel,
  filesystemBackend: any
): (SubAgent | CompiledSubAgent)[] {
  const etherscanTools = getEtherscanToolsForEtherscanSpecialist(tools)
  const theGraphTools = getTheGraphToolsForTheGraphSpecialist(tools)
  const alchemyTools = getAlchemyToolsForAlchemySpecialist(tools)
  const circleTools = getCircleToolsForCircleSpecialist(tools)
  const basicMcpTools = getBasicMcpToolsForSecurityAuditor(tools)
  const basicFileTools = getBasicFileToolsForGasOptimizer(tools)
  const coordinationTools = getCoordinationToolsForComprehensiveAuditor(tools)
  const educationTools = getEducationToolsForWeb3Educator(tools)
  const debugTools = getDebugToolsForDebugSpecialist(tools)
  const solidityTools = getSolidityToolsForSolidityEngineer(tools)
  const webSearchTools = getWebSearchToolsForWebSearchSpecialist(tools)
  const conversionTools = getConversionToolsForConversionSpecialist(tools)

  return [
    {
      name: 'Solidity Engineer',
      systemPrompt: SOLIDITY_ENGINEER_SUBAGENT_PROMPT,
      model,
      tools: solidityTools,
      description: 'Expert in Solidity development, code generation, and smart contract architecture. Can write, explain, and optimize Solidity code.'
    },
    {
      name: 'Web Search Specialist',
      systemPrompt: WEB_SEARCH_SUBAGENT_PROMPT,
      model,
      tools: webSearchTools,
      description: 'Specializes in searching and retrieving information from web sources.'
    },
    {
      name: 'Security Auditor',
      systemPrompt: SECURITY_AUDITOR_SUBAGENT_PROMPT,
      model,
      tools: basicMcpTools,
      description: 'Specializes in auditing and reviewing code for security vulnerabilities.'
    },
    {
      name: 'Gas Optimizer',
      systemPrompt: GAS_OPTIMIZER_SUBAGENT_PROMPT,
      model,
      tools: basicFileTools,
      description: 'Specializes in optimizing gas usage in smart contracts.'
    },
    {
      name: 'Code Reviewer',
      systemPrompt: CODE_REVIEWER_SUBAGENT_PROMPT,
      model,
      tools: [],
      description: 'Specializes in reviewing and providing feedback on code quality and best practices.'
    },
    {
      name: 'Comprehensive Auditor',
      systemPrompt: COMPREHENSIVE_AUDITOR_SUBAGENT_PROMPT,
      model,
      tools: coordinationTools,
      description: 'Specializes in comprehensive auditing and analysis of smart contracts.'
    },
    {
      name: 'Web3 Educator',
      systemPrompt: WEB3_EDUCATOR_SUBAGENT_PROMPT,
      model,
      tools: educationTools,
      description: 'Specializes in teaching and explaining Web3 concepts and technologies.'
    },
    {
      name: 'Frontend Specialist',
      systemPrompt: FRONTEND_SPECIALIST_SUBAGENT_PROMPT,
      model,
      tools: [],
      description: 'Specializes in frontend development and user interface design.'
    },
    {
      name: 'Etherscan Specialist',
      systemPrompt: ETHERSCAN_SUBAGENT_PROMPT,
      model,
      tools: etherscanTools,
      description: 'Specializes in analyzing and retrieving data from the Etherscan blockchain explorer.'
    },
    {
      name: 'TheGraph Specialist',
      systemPrompt: THEGRAPH_SUBAGENT_PROMPT,
      model,
      tools: theGraphTools,
      description: 'Specializes in analyzing and retrieving data from TheGraph decentralized query protocol.'
    },
    {
      name: 'Alchemy Specialist',
      systemPrompt: ALCHEMY_SUBAGENT_PROMPT,
      model,
      tools: alchemyTools,
      description: 'Specializes in analyzing and retrieving data from the Alchemy blockchain infrastructure.'
    },
    {
      name: 'Debug Specialist',
      systemPrompt: DEBUG_SPECIALIST_SUBAGENT_PROMPT,
      model,
      tools: debugTools,
      description: 'Specializes in debugging and troubleshooting smart contract issues.'
    },
    {
      name: 'Conversion Utilities Specialist',
      systemPrompt: CONVERSION_UTILITIES_SUBAGENT_PROMPT,
      model,
      tools: conversionTools,
      description: 'Specializes in providing conversion utilities for various data formats.'
    },
    {
      name: 'Circle Specialist',
      systemPrompt: CIRCLE_SUBAGENT_PROMPT,
      model,
      tools: circleTools,
      description: 'Specializes in Circle product documentation, APIs, and development resources.'
    }
  ]
}
