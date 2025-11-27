export const appInitialState: any = {
  loading: { screen: true },
  isAiLoading: false,
  instance: {
    name: '',
    address: '',
    network: '',
    htmlTemplate: '',
    abi: {},
    items: {},
    containers: [],
    theme: 'Dark',
    userInput: { methods: {} },
    natSpec: { checked: false, methods: {} },
    logo: null,
  },
};

export const appReducer = (state = appInitialState, action: any): any => {
  switch (action.type) {
  case 'SET_LOADING':
    return {
      ...state,
      loading: { ...state.loading, ...action.payload },
    };

  case 'SET_INSTANCE':
    return {
      ...state,
      instance: { ...state.instance, ...action.payload },
    };

  case 'SET_AI_LOADING':
    return {
      ...state,
      isAiLoading: action.payload,
    };

  default:
    throw new Error();
  }
};
