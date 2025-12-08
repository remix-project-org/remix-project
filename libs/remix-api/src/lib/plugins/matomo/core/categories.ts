/**
 * Matomo Category Constants
 *
 * Single source of truth for all Matomo event categories and actions.
 * These are used for type-safe event creation.
 */

// Type-Safe Constants - Access categories and actions via types instead of string literals
export const MatomoCategories = {
  FILE_EXPLORER: 'fileExplorer' as const,
  COMPILER: 'compiler' as const,
  HOME_TAB: 'hometab' as const,
  AI: 'AI' as const,
  UDAPP: 'udapp' as const,
  GIT: 'git' as const,
  WORKSPACE: 'workspace' as const,
  XTERM: 'xterm' as const,
  LAYOUT: 'layout' as const,
  REMIX_AI: 'remixAI' as const,
  SETTINGS: 'settings' as const,
  SOLIDITY: 'solidity' as const,
  CONTRACT_VERIFICATION: 'ContractVerification' as const,
  CIRCUIT_COMPILER: 'circuit-compiler' as const,
  LEARNETH: 'learneth' as const,
  REMIX_GUIDE: 'remixGuide' as const,
  TEMPLATE_SELECTION: 'template-selection' as const,
  TEMPLATE_EXPLORER_MODAL: 'templateExplorerModal' as const,
  SOLIDITY_UML_GEN: 'solidityumlgen' as const,
  SOLIDITY_SCRIPT: 'SolidityScript' as const,
  SCRIPT_EXECUTOR: 'ScriptExecutor' as const,
  LOCALE_MODULE: 'localeModule' as const,
  THEME_MODULE: 'themeModule' as const,
  STATUS_BAR: 'statusBar' as const,
  NOIR_COMPILER: 'noir-compiler' as const,
  QUICK_DAPP_V2: 'quick-dapp-v2' as const
}

// Common action constants used across multiple categories
export const FileExplorerActions = {
  CONTEXT_MENU: 'contextMenu' as const,
  WORKSPACE_MENU: 'workspaceMenu' as const,
  FILE_ACTION: 'fileAction' as const,
  DRAG_DROP: 'dragDrop' as const
}

export const CompilerActions = {
  COMPILED: 'compiled' as const,
  ERROR: 'error' as const,
  WARNING: 'warning' as const
}
