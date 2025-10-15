/**
 * Compiler Events - Solidity compilation and related tracking events
 * 
 * This file contains all compilation-related Matomo events.
 */

import { MatomoEventBase } from '../core/base-types';

export interface CompilerEvent extends MatomoEventBase {
  category: 'compiler';
  action: 
    | 'compiled'
    | 'compilerDetails';
}

export interface SolidityCompilerEvent extends MatomoEventBase {
  category: 'solidityCompiler';
  action: 
    | 'runStaticAnalysis'
    | 'solidityScan'
    | 'staticAnalysis'
    | 'initiate';
}

export interface CompilerContainerEvent extends MatomoEventBase {
  category: 'compilerContainer';
  action: 
    | 'compile'
    | 'compileAndRun'
    | 'autoCompile'
    | 'includeNightlies'
    | 'hideWarnings'
    | 'optimization'
    | 'useConfigurationFile'
    | 'compilerSelection'
    | 'languageSelection'
    | 'evmVersionSelection'
    | 'addCustomCompiler'
    | 'viewLicense'
    | 'advancedConfigToggle';
}





