import { Actions, EezWidgetState } from '../types'

export const eezInitialState: EezWidgetState = {
  networks: [],
  originNetworkChainId: null,
  addressInput: '',
  isResolving: false,
  resolutionRows: [],
  resolutionError: null,
  showCreateDialog: false,
  createdProxies: [],
  creator: {
    originNetworkId: '',
    originAddress: '',
    isPreviewing: false,
    previewAddress: null,
    previewIsDeployed: null,
    previewError: null,
    isCreating: false,
    createError: null,
    createdTxHash: null
  },
  traceTxHash: '',
  isTracing: false,
  traceResult: null,
  traceError: null
}

export const eezReducer = (state: EezWidgetState, action: Actions): EezWidgetState => {
  switch (action.type) {
  case 'SET_NETWORKS':
    return { ...state, networks: action.payload }

  case 'SET_ORIGIN_NETWORK_CHAIN_ID':
    return { ...state, originNetworkChainId: action.payload }

  case 'SET_ADDRESS_INPUT':
    return { ...state, addressInput: action.payload }

  case 'SHOW_CREATE_DIALOG':
    return { ...state, showCreateDialog: action.payload }

  case 'START_RESOLVE':
    return { ...state, isResolving: true, resolutionError: null }

  case 'RESOLVE_SUCCESS':
    return { ...state, isResolving: false, resolutionRows: action.payload, resolutionError: null }

  case 'RESOLVE_ERROR':
    return { ...state, isResolving: false, resolutionError: action.payload, resolutionRows: [] }

  case 'SET_CREATOR_ORIGIN_NETWORK':
    return {
      ...state,
      creator: { ...state.creator, originNetworkId: action.payload, previewAddress: null, previewError: null, createdTxHash: null, createError: null }
    }

  case 'SET_CREATOR_ORIGIN_ADDRESS':
    return {
      ...state,
      creator: { ...state.creator, originAddress: action.payload, previewAddress: null, previewError: null, createdTxHash: null, createError: null }
    }

  case 'START_PREVIEW':
    return { ...state, creator: { ...state.creator, isPreviewing: true, previewError: null } }

  case 'PREVIEW_SUCCESS':
    return {
      ...state,
      creator: {
        ...state.creator,
        isPreviewing: false,
        previewAddress: action.payload.previewAddress,
        previewIsDeployed: action.payload.previewIsDeployed,
        previewError: null
      }
    }

  case 'PREVIEW_ERROR':
    return { ...state, creator: { ...state.creator, isPreviewing: false, previewError: action.payload } }

  case 'START_CREATE':
    return { ...state, creator: { ...state.creator, isCreating: true, createError: null, createdTxHash: null } }

  case 'CREATE_SUCCESS':
    return {
      ...state,
      createdProxies: [
        {
          proxyAddress: action.payload.proxyAddress,
          txHash: action.payload.txHash,
          originNetworkLabel: action.payload.originNetworkLabel,
          originAddress: action.payload.originAddress,
          destinationNetworkLabel: action.payload.destinationNetworkLabel,
          timestamp: Date.now()
        },
        ...state.createdProxies
      ],
      creator: { ...state.creator, isCreating: false, createdTxHash: action.payload.txHash, previewIsDeployed: true }
    }

  case 'CREATE_ERROR':
    return { ...state, creator: { ...state.creator, isCreating: false, createError: action.payload } }

  case 'NETWORK_CHANGED':
    return {
      ...state,
      addressInput: '',
      isResolving: false,
      resolutionRows: [],
      resolutionError: null,
      creator: {
        ...state.creator,
        originNetworkId: '',
        originAddress: '',
        isPreviewing: false,
        previewAddress: null,
        previewIsDeployed: null,
        previewError: null,
        isCreating: false,
        createError: null,
        createdTxHash: null
      },
      traceTxHash: '',
      isTracing: false,
      traceResult: null,
      traceError: null
    }

  case 'SET_TRACE_TX_HASH':
    return { ...state, traceTxHash: action.payload, traceResult: null, traceError: null }

  case 'START_TRACE':
    return { ...state, isTracing: true, traceResult: null, traceError: null }

  case 'TRACE_SUCCESS':
    return { ...state, isTracing: false, traceResult: action.payload, traceError: null }

  case 'TRACE_ERROR':
    return { ...state, isTracing: false, traceResult: null, traceError: action.payload }

  default:
    return state
  }
}
