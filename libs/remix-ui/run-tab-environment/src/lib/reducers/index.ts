import { Actions, WidgetState } from '../types'

export const widgetInitialState: WidgetState = {
  providers: {
    defaultProvider: 'vm-osaka',
    selectedProvider: 'vm-osaka',
    providerList: [],
    isRequesting: false,
    isSuccessful: false,
    error: null
  },
  accounts: {
    selectedAccount: '',
    smartAccounts: [],
    defaultAccounts: [],
    delegations: {},
    isRequesting: false,
    isSuccessful: false,
    error: null
  },
  fork: {
    isVisible: {
      forkUI: false,
      resetUI: false
    },
    isRequesting: false,
    isSuccessful: false,
    error: null
  },
  network: {
    chainId: '',
    name: ''
  },
  matchPassphrase: null,
  deployedContractsCount: 0,
  transactionRecorderCount: 0
}

export const widgetReducer = (state = widgetInitialState, action: Actions): WidgetState => {
// @ts-ignore
  switch (action.type) {

  case 'LOADING_ALL_PROVIDERS':
    return {
      ...state,
      providers: {
        ...state.providers,
        isRequesting: true,
        isSuccessful: false
      }
    }

  case 'COMPLETED_LOADING_ALL_PROVIDERS':
    return {
      ...state,
      providers: {
        ...state.providers,
        isRequesting: false,
        isSuccessful: true
      }
    }

  case 'LOADING_ALL_ACCOUNTS':
    return {
      ...state,
      accounts: {
        ...state.accounts,
        isRequesting: true,
        isSuccessful: false
      }
    }

  case 'COMPLETED_LOADING_ALL_ACCOUNTS':
    return {
      ...state,
      accounts: {
        ...state.accounts,
        isRequesting: false,
        isSuccessful: true
      }
    }

  case 'SET_CURRENT_PROVIDER':
    return {
      ...state,
      providers: {
        ...state.providers,
        selectedProvider: action.payload
      }
    }

  case 'ADD_PROVIDER': {
    const payload = action.payload
    const length = state.providers.providerList.length
    // Create a new array copy to avoid mutating the original
    const providerList = [...state.providers.providerList]

    if (length === 0) {
      providerList.push(payload)
    } else {
      let index = 0
      for (const provider of providerList) {
        if (provider.position >= payload.position) {
          providerList.splice(index, 0, payload)
          break;
        }
        index++
      }
      if (length === providerList.length) {
        providerList.push(payload)
      }
    }
    return {
      ...state,
      providers: {
        ...state.providers,
        providerList
      }
    }
  }

  case 'REMOVE_PROVIDER': {
    const payload = action.payload
    const name = payload.name
    const providerList = state.providers.providerList
    const providers = (providerList[payload.category] || []).filter((el) => el.name !== name)

    return {
      ...state,
      providers: {
        ...state.providers,
        providerList: {
          ...providerList,
          [payload.category]: providers
        }
      }
    }
  }

  case 'SET_ACCOUNTS': {
    return {
      ...state,
      accounts: {
        ...state.accounts,
        defaultAccounts: action.payload
      }
    }
  }

  case 'SET_SMART_ACCOUNTS': {
    return {
      ...state,
      accounts: {
        ...state.accounts,
        smartAccounts: action.payload
      }
    }
  }

  case 'SET_SELECTED_ACCOUNT': {
    return {
      ...state,
      accounts: {
        ...state.accounts,
        selectedAccount: action.payload
      }
    }
  }

  case 'SHOW_FORK_UI': {
    return {
      ...state,
      fork: {
        ...state.fork,
        isVisible: {
          ...state.fork.isVisible,
          forkUI: true
        }
      }
    }
  }

  case 'HIDE_FORK_UI': {
    return {
      ...state,
      fork: {
        ...state.fork,
        isVisible: {
          ...state.fork.isVisible,
          forkUI: false
        }
      }
    }
  }

  case 'SHOW_RESET_UI': {
    return {
      ...state,
      fork: {
        ...state.fork,
        isVisible: {
          ...state.fork.isVisible,
          resetUI: true
        }
      }
    }
  }

  case 'HIDE_RESET_UI': {
    return {
      ...state,
      fork: {
        ...state.fork,
        isVisible: {
          ...state.fork.isVisible,
          resetUI: false
        }
      }
    }
  }

  case 'REQUEST_FORK': {
    return {
      ...state,
      fork: {
        ...state.fork,
        isRequesting: true,
        isSuccessful: false,
        error: null
      }
    }
  }

  case 'COMPLETED_FORK': {
    return {
      ...state,
      fork: {
        ...state.fork,
        isRequesting: false,
        isSuccessful: true,
        error: null
      }
    }
  }

  case 'ERROR_FORK': {
    return {
      ...state,
      fork: {
        ...state.fork,
        isRequesting: false,
        isSuccessful: false,
        error: action.payload
      }
    }
  }

  case 'SET_MATCH_PASSPHRASE': {
    return {
      ...state,
      matchPassphrase: action.payload
    }
  }

  case 'SET_NETWORK_STATUS': {
    return {
      ...state,
      network: action.payload
    }
  }

  case 'SET_DELEGATION': {
    return {
      ...state,
      accounts: {
        ...state.accounts,
        delegations: {
          ...state.accounts.delegations,
          [action.payload.account]: action.payload.address
        }
      }
    }
  }

  case 'REMOVE_DELEGATION': {
    const delegations = { ...state.accounts.delegations }
    delete delegations[action.payload]
    return {
      ...state,
      accounts: {
        ...state.accounts,
        delegations
      }
    }
  }

  case 'SET_DEPLOYED_CONTRACTS_COUNT': {
    return {
      ...state,
      deployedContractsCount: action.payload
    }
  }

  case 'SET_TRANSACTION_RECORDER_COUNT': {
    return {
      ...state,
      transactionRecorderCount: action.payload
    }
  }

  default:
    throw new Error()
  }
}
