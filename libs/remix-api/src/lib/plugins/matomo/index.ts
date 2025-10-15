/**
 * Matomo Events - Modular Event System
 * 
 * This is the main index for the split Matomo event system. 
 * It re-exports all events to maintain backward compatibility while 
 * organizing the code into manageable modules.
 * 
 * Usage:
 *   import { trackMatomoEvent } from '@remix-api'
 *   
 *   trackMatomoEvent(plugin, { category: 'ai', action: 'remixAI', name: 'code_generation', isClick: true })
 *   trackMatomoEvent(plugin, { category: 'git', action: 'COMMIT', name: 'success', isClick: true })
 */

// Core types and categories
export * from './core/base-types';
export * from './core/categories';

// Event modules - organized by domain
export * from './events/ai-events';
export * from './events/compiler-events'; 
export * from './events/git-events';
export * from './events/ui-events';
export * from './events/file-events';
export * from './events/blockchain-events';
export * from './events/plugin-events';
export * from './events/tools-events';

// Import types for union
import type { AIEvent, RemixAIEvent, RemixAIAssistantEvent } from './events/ai-events';
import type { CompilerEvent, SolidityCompilerEvent, CompilerContainerEvent } from './events/compiler-events';
import type { GitEvent } from './events/git-events';
import type { HomeTabEvent, TopbarEvent, LayoutEvent, SettingsEvent, ThemeEvent, LocaleEvent, LandingPageEvent } from './events/ui-events';
import type { FileExplorerEvent, WorkspaceEvent, StorageEvent, BackupEvent } from './events/file-events';
import type { BlockchainEvent, UdappEvent, RunEvent } from './events/blockchain-events';
import type { PluginEvent, ManagerEvent, PluginManagerEvent, AppEvent, MatomoManagerEvent, PluginPanelEvent, MigrateEvent } from './events/plugin-events';
import type { DebuggerEvent, EditorEvent, SolidityUnitTestingEvent, SolidityStaticAnalyzerEvent, DesktopDownloadEvent, XTERMEvent, SolidityScriptEvent, RemixGuideEvent, TemplateSelectionEvent, ScriptExecutorEvent, GridViewEvent, SolidityUMLGenEvent, ScriptRunnerPluginEvent, CircuitCompilerEvent, ContractVerificationEvent, LearnethEvent } from './events/tools-events';

// Union type of all Matomo events - includes base properties for compatibility
export type MatomoEvent = (
  // AI & Assistant events
  | AIEvent
  | RemixAIEvent
  | RemixAIAssistantEvent
  
  // Compilation events
  | CompilerEvent
  | SolidityCompilerEvent
  | CompilerContainerEvent
  
  // Version Control events
  | GitEvent
  
  // User Interface events
  | HomeTabEvent
  | TopbarEvent
  | LayoutEvent
  | SettingsEvent
  | ThemeEvent
  | LocaleEvent
  | LandingPageEvent
  
  // File Management events
  | FileExplorerEvent
  | WorkspaceEvent
  | StorageEvent
  | BackupEvent
  
  // Blockchain & Contract events
  | BlockchainEvent
  | UdappEvent
  | RunEvent
  
  // Plugin Management events
  | PluginEvent
  | ManagerEvent
  | PluginManagerEvent
  | AppEvent
  | MatomoManagerEvent
  | PluginPanelEvent
  | MigrateEvent
  
  // Development Tools events
  | DebuggerEvent
  | EditorEvent
  | SolidityUnitTestingEvent
  | SolidityStaticAnalyzerEvent
  | DesktopDownloadEvent
  | XTERMEvent
  | SolidityScriptEvent
  | RemixGuideEvent
  | TemplateSelectionEvent
  | ScriptExecutorEvent
  | GridViewEvent
  | SolidityUMLGenEvent
  | ScriptRunnerPluginEvent
  | CircuitCompilerEvent
  | ContractVerificationEvent
  | LearnethEvent
  
) & {
  // Ensure all events have these base properties for backward compatibility
  name?: string;
  value?: string | number;
  isClick?: boolean;
}

// Note: This is a demonstration of the split structure
// In the full implementation, you would need to extract ALL event types from the original
// 2351-line file into appropriate category modules:
//
// - blockchain-events.ts     (BlockchainEvent, UdappEvent)
// - file-events.ts           (FileExplorerEvent, WorkspaceEvent) 
// - plugin-events.ts         (PluginEvent, ManagerEvent, etc.)
// - app-events.ts            (AppEvent, StorageEvent, etc.)
// - debug-events.ts          (DebuggerEvent, MatomoManagerEvent)
// - template-events.ts       (TemplateSelectionEvent, etc.)
// - circuit-events.ts        (CircuitCompilerEvent)
// - learneth-events.ts       (LearnethEvent)
// - desktop-events.ts        (DesktopDownloadEvent)
// - editor-events.ts         (EditorEvent)
// 
// Each would follow the same pattern:
// 1. Define the TypeScript interface
// 2. Export type-safe builder functions
// 3. Keep files focused and manageable (~200-400 lines each)

// For backward compatibility, the original matomo-events.ts file would 
// be replaced with just:
//   export * from './matomo';

// Example of how other files would be structured:

/* 
// blockchain-events.ts
export interface BlockchainEvent extends MatomoEventBase {
  category: 'blockchain';  
  action: 'providerChanged' | 'networkChanged' | 'accountChanged';
}

export const BlockchainEvents = {
  providerChanged: (name?: string, value?: string | number): BlockchainEvent => ({
    category: 'blockchain',
    action: 'providerChanged', 
    name,
    value,
    isClick: true
  })
} as const;
*/