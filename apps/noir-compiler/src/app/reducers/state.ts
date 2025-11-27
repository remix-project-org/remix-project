import { Actions, AppState } from '../types'

export const appInitialState: AppState = {
  filePath: '',
  filePathToId: {},
  autoCompile: false,
  hideWarnings: false,
  status: 'idle',
  compilerFeedback: '',
  proofingStatus: 'idle',
  formattedProof: '',
  formattedPublicInputs: []
}

export const appReducer = (state = appInitialState, action: Actions): AppState => {
  switch (action.type) {

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

  case 'SET_FILE_PATH':
    return {
      ...state,
      filePath: action.payload
    }

  case 'SET_COMPILER_FEEDBACK':
    return {
      ...state,
      compilerFeedback: action.payload
    }

  case 'SET_COMPILER_STATUS':
    if (action.payload === 'compiling') {
      return {
        ...state,
        status: action.payload,
        proofingStatus: 'idle',
        formattedProof: '',
        formattedPublicInputs: [],
        compilerFeedback: ''
      }
    }
    return {
      ...state,
      status: action.payload
    }

  case 'SET_PROOFING_STATUS':
    if (action.payload === 'proofing') {
      return {
        ...state,
        proofingStatus: action.payload,
        formattedProof: '',
        formattedPublicInputs: [],
        compilerFeedback: ''
      }
    }
    return {
      ...state,
      proofingStatus: action.payload
    }

  case 'SET_VERIFIER_INPUTS':
    return {
      ...state,
      formattedProof: action.payload.proof,
      formattedPublicInputs: action.payload.publicInputs
    }

  default:
    throw new Error()
  }
}
