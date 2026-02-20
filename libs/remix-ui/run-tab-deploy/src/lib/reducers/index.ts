import { Actions, DeployWidgetState } from '../types'

export const deployInitialState: DeployWidgetState = {
  contracts: {
    contractList: []
  },
  selectedContractIndex: 0,
  value: 0,
  valueUnit: 'wei',
  gasLimit: 0,
  gasPriceStatus: false,
  confirmSettings: false,
  maxFee: '',
  maxPriorityFee: '.0001',
  baseFeePerGas: '',
  gasPrice: ''
}

export const deployReducer = (state = deployInitialState, action: Actions): DeployWidgetState => {
  switch (action.type) {

  case 'ADD_CONTRACT_FILE': {
    const existingContractFile = state.contracts.contractList.findIndex((contract) => contract.filePath === action.payload.filePath)

    if (existingContractFile > -1) {
      return {
        ...state,
        selectedContractIndex: existingContractFile
      }
    } else {
      const contract = {
        name: action.payload.name,
        filePath: action.payload.filePath,
        contractData: null,
        isUpgradeable: false,
        isCompiled: false,
        isCompiling: false
      }

      return {
        ...state,
        contracts: {
          ...state.contracts,
          contractList: [...state.contracts.contractList, contract]
        },
        selectedContractIndex: state.contracts.contractList.length
      }
    }
  }

  case 'UPDATE_COMPILED_CONTRACT': {
    const contract = {
      name: action.payload.name,
      filePath: action.payload.filePath,
      contractData: action.payload.contractData,
      isUpgradeable: action.payload.isUpgradeable,
      deployOptions: action.payload.deployOptions,
      isCompiled: true,
      isCompiling: false
    }
    const existingContract = state.contracts.contractList.find((contract) => contract.name === action.payload.name && contract.filePath === action.payload.filePath)

    if (existingContract) {
      existingContract.contractData = action.payload.contractData
      existingContract.isUpgradeable = action.payload.isUpgradeable
      existingContract.deployOptions = action.payload.deployOptions
      existingContract.isCompiled = true
      existingContract.isCompiling = false
    } else {
      state.contracts.contractList.push(contract)
    }

    return {
      ...state,
      contracts: {
        ...state.contracts,
        contractList: [...state.contracts.contractList]
      }
    }
  }

  case 'REMOVE_CONTRACT_FILE': {
    const contractList = state.contracts.contractList.filter((contract) => contract.filePath !== action.payload)
    return {
      ...state,
      contracts: { ...state.contracts, contractList }
    }
  }

  case 'SET_VALUE': {
    return {
      ...state,
      value: action.payload
    }
  }

  case 'SET_VALUE_UNIT': {
    return {
      ...state,
      valueUnit: action.payload
    }
  }

  case 'SET_GAS_LIMIT': {
    return {
      ...state,
      gasLimit: action.payload
    }
  }

  case 'SET_COMPILING': {
    const contractList = state.contracts.contractList.map((contract) => {
      if (contract.filePath === action.payload) {
        return {
          ...contract,
          isCompiling: true,
          isCompiled: false
        }
      }
      return contract
    })
    return {
      ...state,
      contracts: {
        ...state.contracts,
        contractList
      }
    }
  }

  case 'SET_GAS_PRICE_STATUS': {
    return {
      ...state,
      gasPriceStatus: action.payload
    }
  }

  case 'SET_CONFIRM_SETTINGS': {
    return {
      ...state,
      confirmSettings: action.payload
    }
  }

  case 'SET_MAX_PRIORITY_FEE': {
    return {
      ...state,
      maxPriorityFee: action.payload
    }
  }

  case 'SET_GAS_PRICE': {
    return {
      ...state,
      gasPrice: action.payload
    }
  }

  case 'SET_MAX_FEE': {
    return {
      ...state,
      maxFee: action.payload
    }
  }

  case 'SET_BASE_FEE_PER_GAS': {
    return {
      ...state,
      baseFeePerGas: action.payload
    }
  }

  case 'SET_SELECTED_CONTRACT_INDEX': {
    return {
      ...state,
      selectedContractIndex: action.payload
    }
  }

  default:
    return state
  }
}

