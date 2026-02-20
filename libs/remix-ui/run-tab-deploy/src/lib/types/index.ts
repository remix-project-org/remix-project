import { Engine, Plugin } from "@remixproject/engine"
import { Dispatch } from 'react'
import { CompilationResult, CompilationSourceCode } from '@remix-project/remix-solidity'
import type { ContractData, DeployOption } from "@remix-project/core-plugin"
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import type { DeployPlugin } from 'apps/remix-ide/src/app/udapp/udappDeploy'
import { SolcInput, SolcOutput } from "@openzeppelin/upgrades-core"

type FilePath = string

export interface DeployAppContextType {
  plugin: DeployPlugin
  widgetState: DeployWidgetState
  dispatch: Dispatch<Actions>
  themeQuality: string
}

export interface DeployWidgetState {
  contracts: {
    contractList: (CompiledContractPayload & {
      isCompiled: boolean,
      isCompiling: boolean
    })[]
  }
  selectedContractIndex: number | null
  value: number
  valueUnit: 'wei' | 'gwei' | 'finney' | 'ether'
  gasLimit: number
  gasPriceStatus: boolean
  confirmSettings: boolean
  maxFee: string
  maxPriorityFee: string
  baseFeePerGas: string
  gasPrice: string
}

export interface ActionPayloadTypes {
  ADD_CONTRACT_FILE: { name: string, filePath: FilePath },
  UPDATE_COMPILED_CONTRACT: CompiledContractPayload,
  REMOVE_CONTRACT_FILE: FilePath,
  SET_SELECTED_CONTRACT_INDEX: number | null,
  SET_VALUE: number,
  SET_VALUE_UNIT: 'wei' | 'gwei' | 'finney' | 'ether',
  SET_GAS_LIMIT: number,
  SET_COMPILING: FilePath,
  SET_GAS_PRICE_STATUS: boolean,
  SET_CONFIRM_SETTINGS: boolean,
  SET_MAX_PRIORITY_FEE: string,
  SET_GAS_PRICE: string,
  SET_MAX_FEE: string,
  SET_BASE_FEE_PER_GAS: string
}

export interface Action<T extends keyof ActionPayloadTypes> {
  type: T
  payload: ActionPayloadTypes[T]
}

export type Actions = {[A in keyof ActionPayloadTypes]: Action<A>}[keyof ActionPayloadTypes]

export type CompilationRawResult = {
  file: string,
  source: CompilationSourceCode,
  languageVersion: string,
  data: CompilationResult,
  input?: any
}

export type VisitedContract = {
  name: string,
  object: any,
  file: string
}

export type CompiledContractPayload = {
  name: string,
  filePath: FilePath,
  contractData: ContractData,
  isUpgradeable: boolean,
  deployOptions?: DeployOption['inputs']
}

export type DeployUdappTx = {
  from: string,
  to: string,
  data: string,
  gasLimit?: string
}

export type DeployUdappNetwork = {
  name: string,
  lastBlock: {
    baseFeePerGas: string
  }
}

export type OZDeployMode = {
  deployWithProxy: boolean,
  upgradeWithProxy: boolean,
  deployArgs?: string
}
export interface NetworkDeploymentFile {
  id: string,
  network: string,
  deployments: {
      [proxyAddress: string]: {
          date: Date,
          contractName: string,
          fork: string,
          implementationAddress: string
      }
  }[]
}

export interface SolcBuildFile {
  solcInput: SolcInput,
  solcOutput: SolcOutput
}
