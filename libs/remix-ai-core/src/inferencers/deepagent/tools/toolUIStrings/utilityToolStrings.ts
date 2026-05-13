
import { ToolUIStringRegistry } from './types'

export const utilityToolStrings: ToolUIStringRegistry = {
  dapp_create: (args) =>
    args.name ? `Creating DApp ${args.name}` : 'Creating DApp...',

  dapp_update: (args) =>
    args.name ? `Updating DApp ${args.name}` : 'Updating DApp...',

  dapp_list: () =>
    'Listing DApps...',

  dapp_get_status: () =>
    'Getting DApp status...',

  dapp_open: (args) =>
    args.name ? `Opening DApp ${args.name}` : 'Opening DApp...',

  dapp_navigate: () =>
    'Navigating in DApp...',

  get_skill: (args) =>
    args.name ? `Getting skill ${args.name}` : 'Getting skill...',

  list_skills: () =>
    'Listing available skills...',

  wei_to_ether: (args) =>
    args.wei ? `Converting ${args.wei} wei to ether` : 'Converting Wei to Ether...',

  ether_to_wei: (args) =>
    args.ether ? `Converting ${args.ether} ether to wei` : 'Converting Ether to Wei...',

  decimal_to_hex: (args) =>
    args.decimal ? `Converting ${args.decimal} to hex` : 'Converting decimal to hex...',

  hex_to_decimal: (args) =>
    args.hex ? `Converting ${args.hex} to decimal` : 'Converting hex to decimal...',

  timestamp_to_date: () =>
    'Converting timestamp to date...',

  chartjs_generate: (args) =>
    args.chartType ? `Generating ${args.chartType}` : 'Generating chart...',

  tutorials_list: () =>
    'Listing tutorials...',

  tutorials: (args) =>
    args.tutorial ? `Starting tutorial ${args.tutorial}` : 'Starting tutorial...',

  start_tutorial: (args) =>
    args.tutorial ? `Starting tutorial ${args.tutorial}` : 'Starting tutorial...',

  get_foundry_hardhat_info: () =>
    'Getting Foundry/Hardhat info...',

  amp_dataset_manifest: () =>
    'Getting AMP dataset manifest...',

  get_tool_schema: (args) =>
    args.toolName ? `Getting schema for ${args.toolName}` : 'Getting tool schema...',

  write_todos: () =>
    'Updating task list...',

  web_search: (args) =>
    args.query ? `Searching web: ${args.query}` : 'Searching web...'
}
