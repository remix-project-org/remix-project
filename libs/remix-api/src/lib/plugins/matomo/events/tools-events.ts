/**
 * Tools Events - Developer tools and utilities tracking events
 *
 * This file contains events for debugger, editor, testing, and other developer tools.
 */

import { MatomoEventBase } from '../core/base-types';

export interface DebuggerEvent extends MatomoEventBase {
  category: 'debugger';
  action:
    | 'start'
    | 'step'
    | 'breakpoint'
    | 'startDebugging';
}

export interface EditorEvent extends MatomoEventBase {
  category: 'editor';
  action:
    | 'open'
    | 'save'
    | 'format'
    | 'autocomplete'
    | 'publishFromEditor'
    | 'runScript'
    | 'runScriptWithEnv'
    | 'clickRunFromEditor'
    | 'onDidPaste';
}

export interface SolidityUnitTestingEvent extends MatomoEventBase {
  category: 'solidityUnitTesting';
  action:
    | 'runTest'
    | 'generateTest'
    | 'testPassed'
    | 'hardhat'
    | 'runTests';
}

export interface SolidityStaticAnalyzerEvent extends MatomoEventBase {
  category: 'solidityStaticAnalyzer';
  action:
    | 'analyze'
    | 'warningFound';
}

export interface DesktopDownloadEvent extends MatomoEventBase {
  category: 'desktopDownload';
  action:
    | 'download'
    | 'click';
}

export interface GridViewEvent extends MatomoEventBase {
  category: 'gridView';
  action:
    | 'toggle'
    | 'resize'
    | 'rearrange'
    | 'filterWithTitle';
}

export interface XTERMEvent extends MatomoEventBase {
  category: 'xterm';
  action:
    | 'terminal'
    | 'command';
}

export interface SolidityScriptEvent extends MatomoEventBase {
  category: 'SolidityScript';
  action:
    | 'execute'
    | 'deploy'
    | 'run'
    | 'compile';
}

export interface RemixGuideEvent extends MatomoEventBase {
  category: 'remixGuide';
  action:
    | 'start'
    | 'step'
    | 'complete'
    | 'skip'
    | 'navigate'
    | 'playGuide';
}

export interface TemplateSelectionEvent extends MatomoEventBase {
  category: 'template-selection';
  action:
    | 'selectTemplate'
    | 'createWorkspace'
    | 'cancel'
    | 'addToCurrentWorkspace';
}

export interface TemplateExplorerModalEvent extends MatomoEventBase {
  category: 'templateExplorerModal';
  action:
    | 'openModal'
    | 'closeModal'
    | 'search'
    | 'addScriptsToWorkspace'
    | 'addContractFileToWorkspace'
    | 'selectWorkspaceTemplate'
    | 'createWorkspaceFromTemplate'
    | 'createWorkspaceWithAiRequestSent'
    | 'createWorkspaceWithAiFailed'
    | 'createWorkspaceWithAiSucceeded'
    | 'topCardImportProject'
    | 'topCardContractWizard'
    | 'topCardCreateWithAi'
    | 'topCardCreateFileWithAi'
    | 'topCardImportFiles'
    | 'topCardCreateContractWithWizard'
    | 'topCardContractWizardCreateFile'
    | 'clearFilterButtonClick'
    | 'tagSelected'
    | 'topCardCreateBlankWorkspace'
    | 'topCardCreateBlankFile'
    | 'createWorkspaceWithBasicTemplate'
    | 'contractTypeSelectedInContractWizard'
    | 'initializeAsGitRepoSelectedInContractWizard'
    | 'initializeAsGitRepoSelectedInOtherTemplates'
    | 'createWorkspaceWithContractWizard'
    | 'createFileWithContractWizard'
    | 'createWorkspaceWithGenericTemplate'
    | 'importFiles'
    | 'importHttps'
}

export interface ScriptExecutorEvent extends MatomoEventBase {
  category: 'ScriptExecutor';
  action:
    | 'execute'
    | 'deploy'
    | 'run'
    | 'compile'
    | 'CompileAndRun';
}



/**
 * Editor Events - Type-safe builders
 */

/**
 * Solidity Unit Testing Events - Type-safe builders
 */

/**
 * Static Analyzer Events - Type-safe builders
 */

/**
 * Desktop Download Events - Type-safe builders
 */

/**
 * Terminal Events - Type-safe builders
 */

/**
 * Solidity Script Events - Type-safe builders
 */

/**
 * Remix Guide Events - Type-safe builders
 */

/**
 * Template Selection Events - Type-safe builders
 */

/**
 * Script Executor Events - Type-safe builders
 */

/**
 * Grid View Events - Type-safe builders
 */

/**
 * Solidity UML Generation Events - Type-safe builders
 */
export interface SolidityUMLGenEvent extends MatomoEventBase {
  category: 'solidityumlgen';
  action:
    | 'umlpngdownload'
    | 'umlpdfdownload'
    | 'generate'
    | 'export'
    | 'umlgenerated'
    | 'activated';
}




/**
 * 
 * Circuit Compiler Events - Type-safe builders
 */
export interface CircuitCompilerEvent extends MatomoEventBase {
  category: 'circuit-compiler';
  action:
    | 'compile'
    | 'generateProof'
    | 'error'
    | 'generateR1cs'
    | 'compiler.generate_witness'
    | 'template'
    | 'runSetupAndExport';
}


/**
 * Noir Compiler Events - Type-safe builders
 */
export interface NoirCompilerEvent extends MatomoEventBase {
  category: 'noir-compiler';
  action:
    | 'template'
    | 'compile'
    | 'generate_proof'
    | 'view_file';
}


/**
 * Contract Verification Events - Type-safe builders
 */
export interface ContractVerificationEvent extends MatomoEventBase {
  category: 'contractVerification';
  action:
    | 'verify'
    | 'lookup';
}


/**
 * Learneth Events - Type-safe builders
 */
export interface LearnethEvent extends MatomoEventBase {
  category: 'learneth';
  action:
    | 'start'
    | 'complete'
    | 'lesson'
    | 'tutorial'
    | 'error'
    | 'display_file'
    | 'display_file_error'
    | 'test_step'
    | 'test_step_error'
    | 'show_answer'
    | 'show_answer_error'
    | 'test_solidity_compiler'
    | 'test_solidity_compiler_error'
    | 'start_workshop'
    | 'select_repo'
    | 'import_repo'
    | 'navigate_next'
    | 'navigate_finish'
    | 'start_course'
    | 'step_slide_in'
    | 'load_repo'
    | 'load_repo_error'
    | 'reset_all';
}


/**
 * Script Runner Plugin Events - Type-safe builders
 */
export interface ScriptRunnerPluginEvent extends MatomoEventBase {
  category: 'scriptRunnerPlugin';
  action:
    | 'loadScriptRunnerConfig'
    | 'error_reloadScriptRunnerConfig'
    | 'executeScript'
    | 'configChanged';
}


/**
 * Quick DApp V2 Events - Type-safe builders
 */
export interface QuickDappV2Event extends MatomoEventBase {
  category: 'quick-dapp-v2';
  action:
    | 'generate'
    | 'update'
    | 'deploy_ipfs'
    | 'register_ens'
    | 'error';
}