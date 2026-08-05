import { PTAU_LIST } from '../actions/constant'
import { Actions, AppState } from '../types'
import { compiler_list } from 'circom_wasm'
import isElectron from 'is-electron'

const VersionList = isElectron() ? { ...compiler_list.wasm_builds,
  "latest": {
    "name": "latest",
    "version": "latest",
    "repo": "",
    "build_source": ""
  }
} : compiler_list.wasm_builds

export const appInitialState: AppState = {
  version: compiler_list.latest,
  versionList: compiler_list.wasm_builds,
  versionDownloadList: [],
  filePath: "",
  filePathToId: {},
  status: "idle",
  primeValue: "bn128",
  autoCompile: false,
  hideWarnings: false,
  signalInputs: [],
  compilerFeedback: null,
  computeFeedback: null,
  proofFeedback: null,
  setupExportFeedback: null,
  setupExportStatus: null,
  provingScheme: 'groth16',
  ptauList: PTAU_LIST,
  ptauValue: "final_14.ptau",
  exportVerificationContract: true,
  exportVerificationKey: true,
  exportVerifierCalldata: true,
  exportWtnsJson: false,
  verificationKey: null,
  zKey: null,
  zkVerifyStatus: 'idle',
  zkVerifyAttestation: null
}

export const appReducer = (state = appInitialState, action: Actions): AppState => {
  switch (action.type) {

  case 'SET_COMPILER_VERSION':
    return {
      ...state,
      version: action.payload
    }

  case 'SET_FILE_PATH':
    return {
      ...state,
      filePath: action.payload
    }

  case 'SET_COMPILER_STATUS':
    return {
      ...state,
      status: action.payload
    }

  case 'SET_PRIME_VALUE':
    return {
      ...state,
      primeValue: action.payload
    }

  case 'SET_AUTO_COMPILE':
    return {
      ...state,
      autoCompile: action.payload
    }

  case 'SET_HIDE_WARNINGS':
    return {
      ...state,
      hideWarnings: action.payload
    }

  case 'SET_SIGNAL_INPUTS':
    return {
      ...state,
      signalInputs: action.payload
    }

  case 'SET_COMPILER_FEEDBACK':
    return {
      ...state,
      compilerFeedback: action.payload
    }

  case 'SET_COMPUTE_FEEDBACK':
    return {
      ...state,
      computeFeedback: action.payload
    }

  case 'SET_SETUP_EXPORT_FEEDBACK':
    return {
      ...state,
      setupExportFeedback: action.payload
    }

  case 'SET_PROOF_FEEDBACK':
    return {
      ...state,
      proofFeedback: action.payload
    }

  case 'SET_FILE_PATH_TO_ID':
    return {
      ...state,
      filePathToId: action.payload
    }

  case 'SET_PROVING_SCHEME':
    return {
      ...state,
      provingScheme: action.payload
    }

  case 'SET_PTAU_VALUE':
    return {
      ...state,
      ptauValue: action.payload
    }

  case 'SET_EXPORT_VERIFICATION_CONTRACT':
    return {
      ...state,
      exportVerificationContract: action.payload
    }

  case 'SET_EXPORT_VERIFICATION_KEY':
    return {
      ...state,
      exportVerificationKey: action.payload
    }

  case 'SET_EXPORT_VERIFIER_CALLDATA':
    return {
      ...state,
      exportVerifierCalldata: action.payload
    }

  case 'SET_SETUP_EXPORT_STATUS':
    return {
      ...state,
      setupExportStatus: action.payload
    }

  case 'SET_EXPORT_WTNS_JSON':
    return {
      ...state,
      exportWtnsJson: action.payload
    }

  case 'SET_VERIFICATION_KEY':
    return {
      ...state,
      verificationKey: action.payload
    }

  case 'SET_ZKEY':
    return {
      ...state,
      zKey: action.payload
    }

  case 'SET_VERSION_DOWNLOAD_LIST':
    return {
      ...state,
      versionDownloadList: action.payload
    }

  case 'REMOVE_VERSION_FROM_DOWNLOAD_LIST':
    return {
      ...state,
      versionDownloadList: state.versionDownloadList.filter(version => version !== action.payload)
    }

  case 'SET_ZKVERIFY_STATUS':
    return {
      ...state,
      zkVerifyStatus: action.payload
    }

  case 'SET_ZKVERIFY_ATTESTATION':
    return {
      ...state,
      zkVerifyAttestation: action.payload
    }

  default:
    throw new Error()
  }
}
