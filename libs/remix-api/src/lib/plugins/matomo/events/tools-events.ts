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
  category: 'solidityScript';
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
  category: 'templateSelection';
  action: 
    | 'selectTemplate'
    | 'createWorkspace'
    | 'cancel'
    | 'addToCurrentWorkspace';
}

export interface ScriptExecutorEvent extends MatomoEventBase {
  category: 'scriptExecutor';
  action: 
    | 'execute'
    | 'deploy'
    | 'run'
    | 'compile'
    | 'compileAndRun';
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
  category: 'solidityUMLGen';
  action:
    | 'umlpngdownload'
    | 'umlpdfdownload'
    | 'generate'
    | 'export'
    | 'umlgenerated'
    | 'activated';
}




/**
 * Circuit Compiler Events - Type-safe builders
 */
export interface CircuitCompilerEvent extends MatomoEventBase {
  category: 'circuitCompiler';
  action:
    | 'compile'
    | 'generateProof'
    | 'error'
    | 'generateR1cs'
    | 'computeWitness'
    | 'runSetupAndExport';
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
    | 'displayFile'
    | 'displayFileError'
    | 'testStep'
    | 'testStepError'
    | 'showAnswer'
    | 'showAnswerError'
    | 'testSolidityCompiler'
    | 'testSolidityCompilerError'
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

