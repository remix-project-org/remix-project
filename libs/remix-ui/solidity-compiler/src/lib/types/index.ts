import React from 'react'
import { ICompilerApi, ConfigurationSettings, iSolJsonBinData } from '@remix-project/remix-lib'
import { CompileTabLogic } from '../logic/compileTabLogic'
export type onCurrentFileChanged = (fileName: string) => void

//// SolidityScan Types

export interface SolidityCompilerProps {
  api: ICompilerApi
}

export interface CompilerContainerProps {
  api: ICompilerApi,
  pluginProps: SolidityCompilerProps,
  compileTabLogic: CompileTabLogic,
  isHardhatProject: boolean,
  isTruffleProject: boolean,
  isFoundryProject: boolean,
  workspaceName: string,
  workspaceReloadFlag: number,
  tooltip: (message: string | JSX.Element) => void,
  modal: (title: string, message: string | JSX.Element, okLabel: string, okFn: () => void, donotHideOnOkClick?: boolean, cancelLabel?: string, cancelFn?: () => void) => void,
  compiledFileName: string,
  updateCurrentVersion: any,
  configurationSettings: ConfigurationSettings,
  solJsonBinData: iSolJsonBinData,
  setCompileErrors: (errors: Record<string, CompileErrors>) => void
  setBadgeStatus: (badgeStatus: Record<string, { key: string | number; title?: string; type?: string }>) => void
  // the compile results, rendered right under the Compile button
  renderResults?: (opts: { compiling: boolean, via?: string, footer?: React.ReactNode }) => React.ReactNode
}

export interface ContractSelectionProps {
  api: ICompilerApi,
  compiledFileName: string,
  contractList: { file: string, name: string, path?: string }[],
  compilerInput: Record<string, any>
  modal: (title: string, message: string | JSX.Element, okLabel: string, okFn: () => void, donotHideOnOkClick?: boolean, cancelLabel?: string, cancelFn?: () => void) => void,
  contractsDetails: Record<string, any>
}

interface CompileError {
  mode?: string,
  severity?: string,
  formattedMessage?: string,
  type?: string
}

export interface CompileErrors {
  error: CompileError,
  errors: CompileError[]
}

export interface CompilationDetails {
  contractList: { file: string, name: string, path?: string }[],
  contractsDetails: Record<string, any>,
  target?: string,
  input?: Record<string, any>
}

export interface ContractsFile {
 [currentFile: string]: CompilationDetails
}

export type ContractPropertyName = 'compilerInput' | 'name' | 'metadata' | 'bytecode' | 'abi' | 'storageLayout'
  | 'web3Deploy' | 'metadataHash' | 'functionHashes' | 'gasEstimates' | 'devdoc' | 'userdoc' | 'Runtime Bytecode'
  | 'Assembly'
