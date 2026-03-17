import { Actions, DeployedContractsWidgetState } from '../types'

export const deployedContractsInitialState: DeployedContractsWidgetState = {
  deployedContracts: [],
  isLoading: false,
  showAddDialog: false,
  addressInput: '',
  showClearAllDialog: false,
  loadType: 'other',
  currentFile: '',
  lastLoadedChainId: null,
  lastLoadedWorkspace: null
}

export const deployedContractsReducer = (state: DeployedContractsWidgetState, action: Actions): DeployedContractsWidgetState => {
  switch (action.type) {
  case 'SET_CONTRACTS':
    return {
      ...state,
      deployedContracts: action.payload
    }
  case 'ADD_CONTRACT': {
    const duplicateContract = state.deployedContracts.find(contract => contract.address === action.payload.address)

    return {
      ...state,
      deployedContracts: !duplicateContract ? [...state.deployedContracts, action.payload] : state.deployedContracts,
      showAddDialog: false,
      addressInput: ''
    }
  }
  case 'REMOVE_CONTRACT':
    return {
      ...state,
      deployedContracts: state.deployedContracts.filter((contract) => contract.address !== action.payload)
    }
  case 'CLEAR_ALL_CONTRACTS':
    return {
      ...state,
      deployedContracts: [],
      showClearAllDialog: false
    }
  case 'SET_LOADING':
    return {
      ...state,
      isLoading: action.payload
    }
  case 'SHOW_ADD_DIALOG':
    return {
      ...state,
      showAddDialog: action.payload
    }
  case 'SET_ADDRESS_INPUT':
    return {
      ...state,
      addressInput: action.payload
    }
  case 'PIN_CONTRACT':
    return {
      ...state,
      deployedContracts: state.deployedContracts.map((contract, index) =>
        index === action.payload.index
          ? { ...contract, isPinned: true, pinnedAt: action.payload.pinnedAt, filePath: action.payload.filePath }
          : contract
      )
    }
  case 'UNPIN_CONTRACT':
    return {
      ...state,
      deployedContracts: state.deployedContracts.map((contract, index) =>
        index === action.payload
          ? { ...contract, isPinned: false, pinnedAt: undefined, filePath: undefined }
          : contract
      )
    }
  case 'SHOW_CLEAR_ALL_DIALOG':
    return {
      ...state,
      showClearAllDialog: action.payload
    }

  case 'SET_LOAD_TYPE':
    return {
      ...state,
      loadType: action.payload
    }

  case 'SET_CURRENT_FILE':
    return {
      ...state,
      currentFile: action.payload
    }

  case 'SET_DECODED_RESPONSE':
    return {
      ...state,
      deployedContracts: state.deployedContracts.map((contract, index) =>
        index === action.payload.instanceIndex
          ? {
            ...contract,
            decodedResponse: {
              ...contract.decodedResponse,
              [action.payload.funcIndex]: action.payload.response
            }
          }
          : contract
      )
    }

  case 'UPDATE_CONTRACT_BALANCE':
    return {
      ...state,
      deployedContracts: state.deployedContracts.map((contract) =>
        contract.address === action.payload.address
          ? { ...contract, balance: action.payload.balance }
          : contract
      )
    }

  case 'SET_LAST_LOADED_CHAIN_ID':
    return {
      ...state,
      lastLoadedChainId: action.payload
    }

  case 'SET_LAST_LOADED_WORKSPACE':
    return {
      ...state,
      lastLoadedWorkspace: action.payload
    }

  default:
    return state
  }
}
