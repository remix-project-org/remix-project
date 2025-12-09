import { DappConfig } from '../types/dapp';

export interface AppState {
  loading: { screen: boolean };
  isAiLoading: boolean;
  view: 'loading' | 'dashboard' | 'editor' | 'create';
  dapps: DappConfig[];
  activeDapp: DappConfig | null;
  instance: any;
  dappProcessing: Record<string, boolean>;
}

export const appInitialState: AppState = {
  loading: { screen: true },
  isAiLoading: false,
  view: 'loading',
  dapps: [],
  activeDapp: null,
  instance: {
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
  },
  dappProcessing: {},
};

export const appReducer = (state = appInitialState, action: any): AppState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: { ...state.loading, ...action.payload } };
    
    case 'SET_VIEW':
      return { ...state, view: action.payload };

    case 'SET_DAPPS':
      return { ...state, dapps: action.payload };

    case 'SET_AI_LOADING':
      return { ...state, isAiLoading: action.payload };

    case 'SET_ACTIVE_DAPP':
      const dapp = action.payload as DappConfig | null;
      if (!dapp) {
        return { 
          ...state, 
          activeDapp: null,
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
            title: dapp.config.title,
            details: dapp.config.details,
            htmlTemplate: 'loaded', 
        }
      };

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

    default:
      return state;
  }
};