import { DappConfig, AppState } from './types';

const initialInstanceState = {
  name: '',
  address: '',
  network: '',
  htmlTemplate: '',
  abi: {},
  title: '',
  details: '',
  logo: null,
  userInput: { methods: {} },
  natSpec: { checked: false, methods: {} },
};

export const appInitialState: AppState = {
  loading: { screen: true },
  isAiLoading: false,
  view: 'loading',
  dapps: [],
  activeDapp: null,
  instance: { ...initialInstanceState },
  dappProcessing: {},
};

export type AppAction =
  | { type: 'SET_LOADING'; payload: { screen?: boolean } }
  | { type: 'SET_VIEW'; payload: AppState['view'] }
  | { type: 'SET_DAPPS'; payload: DappConfig[] }
  | { type: 'SET_AI_LOADING'; payload: boolean }
  | { type: 'SET_ACTIVE_DAPP'; payload: DappConfig | null }
  | { type: 'SET_INSTANCE'; payload: any }
  | { type: 'SET_DAPP_PROCESSING'; payload: { slug: string; isProcessing: boolean } }
  | { type: 'RESET_INSTANCE' };

export const appReducer = (state = appInitialState, action: AppAction): AppState => {
  switch (action.type) {
  case 'SET_LOADING':
    return { ...state, loading: { ...state.loading, ...action.payload } };

  case 'SET_VIEW':
    if (action.payload === 'create') {
      return {
        ...state,
        view: action.payload,
        activeDapp: null,
        instance: { ...initialInstanceState }
      };
    }
    return { ...state, view: action.payload };

  case 'SET_DAPPS':
    return { ...state, dapps: action.payload || []};

  case 'SET_AI_LOADING':
    return { ...state, isAiLoading: action.payload };

  case 'SET_ACTIVE_DAPP': {
    const dapp = action.payload as DappConfig | null;

    if (!dapp) {
      return {
        ...state,
        activeDapp: null,
        instance: { ...initialInstanceState }
      };
    }

    return {
      ...state,
      activeDapp: dapp,
      instance: {
        ...state.instance,
        name: dapp.name,
        address: dapp.contract.address,
        abi: dapp.contract.abi,
        title: dapp.config?.title || '',
        details: dapp.config?.details || '',
        logo: dapp.config?.logo || null,
        htmlTemplate: 'loaded',
      }
    };
  }

  case 'SET_INSTANCE':
    return { ...state, instance: { ...state.instance, ...action.payload } };

  case 'SET_DAPP_PROCESSING':
    return {
      ...state,
      dappProcessing: {
        ...state.dappProcessing,
        [action.payload.slug]: action.payload.isProcessing
      }
    };

  case 'RESET_INSTANCE':
    return { ...state, instance: { ...initialInstanceState } };

  default:
    return state;
  }
};
