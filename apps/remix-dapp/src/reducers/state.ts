export const appInitialState: any = {
  instance: {
    name: '',
    address: '',
    balance: 0,
    network: '',
    decodedResponse: {},
    abi: [],
    solcVersion: {},
    containers: []
  },
  settings: {
    sendValue: '0',
    sendUnit: 'wei',
    gasLimit: 3000000,
    networkName: 'Sepolia',
    loadedAccounts: {},
    isRequesting: false,
    isSuccessful: false,
    error: null,
    selectedAccount: '',
    selectedLocaleCode: 'en',
    provider: window.ethereum ? 'metamask' : 'walletconnect',
  },
  terminal: { journalBlocks: [], hidden: false, height: 250 },
};

export const appReducer = (state = appInitialState, action: any): any => {
  switch (action.type) {
  case 'SET_INSTANCE':
    return {
      ...state,
      instance: { ...state.instance, ...action.payload },
    };

  case 'SET_SETTINGS':
    return {
      ...state,
      settings: { ...state.settings, ...action.payload },
    };

  case 'SET_TERMINAL':
    return {
      ...state,
      terminal: { ...state.terminal, ...action.payload },
    };

  default:
    throw new Error();
  }
};
