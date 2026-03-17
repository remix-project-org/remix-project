import { ContractData } from '@remix-project/core-plugin'
import { ContractList, DeployOptions, RunTabState } from '../types'
import { ADD_INSTANCE, PIN_INSTANCE, UNPIN_INSTANCE, UPDATE_INSTANCES_BALANCE, ADD_PROVIDER, CLEAR_INSTANCES, CLEAR_RECORDER_COUNT, DISPLAY_NOTIFICATION, FETCH_ACCOUNTS_LIST_FAILED, FETCH_ACCOUNTS_LIST_REQUEST, FETCH_ACCOUNTS_LIST_SUCCESS, FETCH_CONTRACT_LIST_FAILED, FETCH_CONTRACT_LIST_REQUEST, FETCH_CONTRACT_LIST_SUCCESS, HIDE_NOTIFICATION, REMOVE_INSTANCE, REMOVE_PROVIDER, RESET_STATE, SET_BASE_FEE_PER_GAS, SET_CONFIRM_SETTINGS, SET_CHAIN_ID, SET_CURRENT_CONTRACT, SET_CURRENT_FILE, SET_DECODED_RESPONSE, SET_DEPLOY_OPTIONS, SET_EXECUTION_ENVIRONMENT, SET_EXTERNAL_WEB3_ENDPOINT, SET_GAS_LIMIT, SET_GAS_PRICE, SET_GAS_PRICE_STATUS, SET_LOAD_TYPE, SET_MATCH_PASSPHRASE, SET_MAX_FEE, SET_MAX_PRIORITY_FEE, SET_NETWORK_NAME, SET_PASSPHRASE, SET_PATH_TO_SCENARIO, SET_RECORDER_COUNT, SET_SELECTED_ACCOUNT, SET_SEND_UNIT, SET_SEND_VALUE, ADD_DEPLOY_OPTION, REMOVE_DEPLOY_OPTION, SET_REMIXD_ACTIVATED, FETCH_PROXY_DEPLOYMENTS, NEW_PROXY_DEPLOYMENT, RESET_PROXY_DEPLOYMENTS } from '../constants'

declare const window: any
interface Action {
  type: string
  payload: any
}

export const runTabInitialState: RunTabState = {
  contracts: {
    contractList: {},
    deployOptions: {} as any,
    compilationSource: '',
    loadType: 'other',
    currentFile: '',
    currentContract: '',
    compilationCount: 0,
    isRequesting: false,
    isSuccessful: false,
    error: null
  },
  externalEndpoint: 'http://127.0.0.1:8545',
  instances: {
    instanceList: [],
    error: null
  },
  recorder: {
    pathToScenario: 'scenario.json',
    transactionCount: 0
  },
  remixdActivated: false,
}

export const runTabReducer = (state: RunTabState = runTabInitialState, action: Action) => {
  switch (action.type) {

  case SET_EXTERNAL_WEB3_ENDPOINT: {
    const payload: string = action.payload

    return {
      ...state,
      externalEndpoint: payload
    }
  }

  case FETCH_CONTRACT_LIST_REQUEST: {
    return {
      ...state,
      contracts: {
        ...state.contracts,
        isRequesting: true,
        isSuccessful: false,
        error: null
      }
    }
  }

  case FETCH_CONTRACT_LIST_SUCCESS: {
    const payload: ContractList = action.payload

    return {
      ...state,
      contracts: {
        ...state.contracts,
        contractList: { ...state.contracts.contractList, ...payload },
        isSuccessful: true,
        isRequesting: false,
        error: null
      }
    }
  }

  case FETCH_CONTRACT_LIST_FAILED: {
    const payload: string = action.payload

    return {
      ...state,
      contracts: {
        ...state.contracts,
        isRequesting: false,
        isSuccessful: false,
        error: payload
      }
    }
  }

  case SET_CURRENT_CONTRACT: {
    const payload: string = action.payload

    return {
      ...state,
      contracts: {
        ...state.contracts,
        currentContract: payload
      }
    }
  }

  case SET_LOAD_TYPE: {
    const payload: 'abi' | 'sol' | 'other' = action.payload

    return {
      ...state,
      contracts: {
        ...state.contracts,
        loadType: payload
      }
    }
  }

  case SET_CURRENT_FILE: {
    const payload: string = action.payload

    return {
      ...state,
      contracts: {
        ...state.contracts,
        currentFile: payload,
        compilationCount: state.contracts.compilationCount + 1
      }
    }
  }

  case ADD_INSTANCE: {
    const payload: { contractData?: ContractData, address: string, name: string, abi?: any, isPinned?: boolean, pinnedAt?: number } = action.payload

    return {
      ...state,
      instances: {
        ...state.instances,
        instanceList: [...state.instances.instanceList, payload]
      }
    }
  }

  case UPDATE_INSTANCES_BALANCE: {
    const payload: Array<{ contractData: ContractData, address: string, balance: number, name: string, abi?: any, decodedResponse?: Record<number, any> }> = action.payload

    return {
      ...state,
      instances: {
        ...state.instances,
        instanceList: payload
      }
    }
  }

  case REMOVE_INSTANCE: {
    const payload: { index: number } = action.payload
    return {
      ...state,
      instances: {
        ...state.instances,
        instanceList: state.instances.instanceList.filter((_, index) => index !== payload.index)
      }
    }
  }

  case PIN_INSTANCE: {
    const payload: { index: number, pinnedAt: number, filePath: string } = action.payload
    state.instances.instanceList[payload.index].isPinned = true
    state.instances.instanceList[payload.index].pinnedAt = payload.pinnedAt
    state.instances.instanceList[payload.index].filePath = payload.filePath
    return {
      ...state,
      instances: {
        ...state.instances,
      }
    }
  }

  case UNPIN_INSTANCE: {
    const payload: { index: number } = action.payload
    state.instances.instanceList[payload.index].isPinned = false
    return {
      ...state,
      instances: {
        ...state.instances,
      }
    }
  }

  case CLEAR_INSTANCES: {
    return {
      ...state,
      instances: {
        instanceList: [],
        error: null
      }
    }
  }

  case SET_DECODED_RESPONSE: {
    const payload: { instanceIndex: number, funcIndex: number, response: any } = action.payload
    return {
      ...state,
      instances: {
        ...state.instances,
        instanceList: state.instances.instanceList.map((instance, index) => {
          if (payload.instanceIndex === index) instance.decodedResponse[payload.funcIndex] = payload.response
          return instance
        })
      }
    }
  }

  case SET_PATH_TO_SCENARIO: {
    const payload: string = action.payload

    return {
      ...state,
      recorder: {
        ...state.recorder,
        pathToScenario: payload
      }
    }
  }

  case SET_RECORDER_COUNT: {
    const payload: number = action.payload

    return {
      ...state,
      recorder: {
        ...state.recorder,
        transactionCount: payload
      }
    }
  }

  case CLEAR_RECORDER_COUNT: {
    return {
      ...state,
      recorder: {
        ...state.recorder,
        transactionCount: 0
      }
    }
  }

  case ADD_DEPLOY_OPTION: {
    const payload: { [file: string]: { [name: string]: DeployOptions } } = action.payload

    return {
      ...state,
      contracts: {
        ...state.contracts,
        deployOptions: { ...state.contracts.deployOptions, ...payload }
      }
    }
  }

  case REMOVE_DEPLOY_OPTION: {
    const payload: string = action.payload
    const options = state.contracts.deployOptions

    delete options[payload]
    return {
      ...state,
      contracts: {
        ...state.contracts,
        deployOptions: options
      }
    }
  }

  case SET_DEPLOY_OPTIONS: {
    const payload: { [file: string]: { [name: string]: DeployOptions } } = action.payload

    return {
      ...state,
      contracts: {
        ...state.contracts,
        deployOptions: payload
      }
    }
  }

  case SET_REMIXD_ACTIVATED: {
    const payload: boolean = action.payload
    return {
      ...state,
      remixdActivated: payload
    }
  }

  default:
    return state
  }
}
