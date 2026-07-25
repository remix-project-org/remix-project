import { compiler_list } from 'circom_wasm'
import { Dispatch } from 'react'
import type { CircomPluginClient } from '../services/circomPluginClient'
import { CompilerReport } from '@remix-ui/helper'

export type CompilerStatus = "compiling" | "computing" | "idle" | "errored" | "warning" | "exporting" | "proving"

export type ZkVerifyStatus = 'idle' | 'verifying' | 'verified' | 'failed'

export type ProvingScheme = 'groth16' | 'plonk'

export type SetupExportStatus = 'done' | 'update'

export type PtauFile = {
  name: string,
  power: number,
  maxConstraint: string,
  ipfsHash: string,
  blake2bHash: string
}
export interface ICircuitAppContext {
  appState: AppState
  dispatch: Dispatch<Actions>,
  plugin: CircomPluginClient
}

export interface ActionPayloadTypes {
  SET_COMPILER_VERSION: string,
  SET_VERSION_DOWNLOAD_LIST: string[],
  REMOVE_VERSION_FROM_DOWNLOAD_LIST: string,
  SET_FILE_PATH: string,
  SET_COMPILER_STATUS: CompilerStatus,
  SET_PRIME_VALUE: PrimeValue,
  SET_AUTO_COMPILE: boolean,
  SET_HIDE_WARNINGS: boolean,
  SET_SIGNAL_INPUTS: string[],
  SET_COMPILER_FEEDBACK: string | CompilerReport[],
  SET_COMPUTE_FEEDBACK: string | CompilerReport[],
  SET_PROOF_FEEDBACK: string | CompilerReport[],
  SET_SETUP_EXPORT_FEEDBACK: string | CompilerReport[],
  SET_FILE_PATH_TO_ID: Record<number, string>,
  SET_PROVING_SCHEME: ProvingScheme,
  SET_PTAU_VALUE: string,
  SET_EXPORT_VERIFICATION_CONTRACT: boolean,
  SET_EXPORT_VERIFICATION_KEY: boolean,
  SET_EXPORT_VERIFIER_CALLDATA: boolean,
  SET_EXPORT_WTNS_JSON: boolean,
  SET_SETUP_EXPORT_STATUS: SetupExportStatus,
  SET_VERIFICATION_KEY: Record<string, any>,
  SET_ZKEY: any,
  SET_ZKVERIFY_STATUS: ZkVerifyStatus,
  SET_ZKVERIFY_ATTESTATION: string | null
}
export interface Action<T extends keyof ActionPayloadTypes> {
  type: T
  payload: ActionPayloadTypes[T]
}

export type Actions = {[A in keyof ActionPayloadTypes]: Action<A>}[keyof ActionPayloadTypes]

export interface AppState {
  version: string,
  versionList: typeof compiler_list.wasm_builds,
  versionDownloadList: string[],
  filePath: string,
  filePathToId: Record<string, string>,
  status: CompilerStatus,
  primeValue: PrimeValue,
  autoCompile: boolean,
  hideWarnings: boolean,
  signalInputs: string[],
  compilerFeedback: string | CompilerReport[],
  computeFeedback: string | CompilerReport[],
  proofFeedback: string | CompilerReport[],
  setupExportFeedback: string | CompilerReport[],
  setupExportStatus: SetupExportStatus,
  provingScheme: ProvingScheme,
  ptauList: Array<PtauFile>,
  ptauValue: string,
  exportVerificationContract: boolean,
  exportVerificationKey: boolean,
  exportVerifierCalldata: boolean,
  exportWtnsJson: boolean,
  verificationKey: Record<string, any>,
  zKey: Uint8Array,
  zkVerifyStatus: ZkVerifyStatus,
  zkVerifyAttestation: string | null
}

export type CompilationConfig = {
  prime: PrimeValue,
  version: string
}

export type PrimeValue = "bn128" | "bls12381" | "goldilocks" | "grumpkin" | "pallas" | "vesta"

export type ConfigurationsProps = {
  setPrimeValue: (prime: PrimeValue) => void,
  primeValue: PrimeValue,
  versionValue: string
}

export type CompileOptionsProps = {
  setCircuitAutoCompile: (value: boolean) => void,
  setCircuitHideWarnings: (value: boolean) => void,
  autoCompile: boolean,
  hideWarnings: boolean
}

export type ResolverOutput = {
  [name: string]: {
    content: string,
    parent: string
  }
}