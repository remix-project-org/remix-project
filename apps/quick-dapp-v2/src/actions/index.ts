import axios from 'axios';
import { omitBy } from 'lodash';
import semver from 'semver';
import { execution } from '@remix-project/remix-lib';
import remixClient from '../remix-client';
import { themeMap } from '../components/DeployPanel/theme';

const { encodeFunctionId } = execution.txHelper;

const getVersion = (solcVersion) => {
  let version = '0.8.25'
  try {
    const arr = solcVersion.split('+')
    if (arr && arr[0]) version = arr[0]
    if (semver.lt(version, '0.6.0')) {
      return { version: version, canReceive: false };
    } else {
      return { version: version, canReceive: true };
    }
  } catch (e) {
    return { version, canReceive: true };
  }
};

let dispatch: any, state: any;

export const initDispatch = (_dispatch: any) => {
  dispatch = _dispatch;
};

export const updateState = (_state: any) => {
  state = _state;
};

export const connectRemix = async () => {
  await dispatch({
    type: 'SET_LOADING',
    payload: {
      screen: true,
    },
  });

  await remixClient.onload();

  // @ts-expect-error
  await remixClient.call('layout', 'minimize', 'terminal', true);

  await dispatch({
    type: 'SET_LOADING',
    payload: {
      screen: false,
    },
  });
};

export const saveDetails = async (payload: any) => {
  const { abi, userInput, natSpec } = state.instance;

  await dispatch({
    type: 'SET_INSTANCE',
    payload: {
      abi: {
        ...abi,
        [payload.id]: {
          ...abi[payload.id],
          details:
            natSpec.checked && !payload.details
              ? natSpec.methods[payload.id]
              : payload.details,
        },
      },
      userInput: {
        ...omitBy(userInput, (item) => item === ''),
        methods: omitBy(
          {
            ...userInput.methods,
            [payload.id]: payload.details,
          },
          (item) => item === ''
        ),
      },
    },
  });
};

export const saveTitle = async (payload: any) => {
  const { abi } = state.instance;

  await dispatch({
    type: 'SET_INSTANCE',
    payload: {
      abi: {
        ...abi,
        [payload.id]: { ...abi[payload.id], title: payload.title },
      },
    },
  });
};

export const getInfoFromNatSpec = async (value: boolean) => {
  const { abi, userInput, natSpec } = state.instance;
  const input = value
    ? {
      ...natSpec,
      ...userInput,
      methods: { ...natSpec.methods, ...userInput.methods },
    }
    : userInput;
  Object.keys(abi).forEach((id) => {
    abi[id].details = input.methods[id] || '';
  });
  await dispatch({
    type: 'SET_INSTANCE',
    payload: {
      abi,
      title: input.title || '',
      details: input.details || '',
      natSpec: { ...natSpec, checked: value },
    },
  });
};

export const initInstance = async ({
  methodIdentifiers,
  devdoc,
  solcVersion,
  htmlTemplate,
  ...payload
}: any) => {
  // If HTML template is provided, use simplified initialization
  if (htmlTemplate) {
    await dispatch({
      type: 'SET_INSTANCE',
      payload: {
        ...payload,
        htmlTemplate,
        abi: {},
        items: {},
        containers: [],
        natSpec: { checked: false, methods: {} },
        solcVersion: solcVersion ? getVersion(solcVersion) : { version: '0.8.25', canReceive: true },
      },
    });
    return;
  }

  // Original ABI-based initialization (kept for backward compatibility)
  const functionHashes: any = {};
  const natSpec: any = { checked: false, methods: {} };
  if (methodIdentifiers && devdoc) {
    for (const fun in methodIdentifiers) {
      functionHashes[`0x${methodIdentifiers[fun]}`] = fun;
    }
    natSpec.title = devdoc.title;
    natSpec.details = devdoc.details;
    Object.keys(functionHashes).forEach((hash) => {
      const method = functionHashes[hash];
      if (devdoc.methods[method]) {
        const { details, params, returns } = devdoc.methods[method];
        const detailsStr = details ? `@dev ${details}` : '';
        const paramsStr = params
          ? Object.keys(params)
            .map((key) => `@param ${key} ${params[key]}`)
            .join('\n')
          : '';
        const returnsStr = returns
          ? Object.keys(returns)
            .map(
              (key) =>
                `@return${/^_\d$/.test(key) ? '' : ' ' + key} ${returns[key]}`
            )
            .join('\n')
          : '';
        natSpec.methods[hash] = [detailsStr, paramsStr, returnsStr]
          .filter((str) => str !== '')
          .join('\n');
      }
    });
  }

  const abi: any = {};
  const lowLevel: any = {}
  if (payload.abi) {
    payload.abi.forEach((item: any) => {
      if (item.type === 'function') {
        item.id = encodeFunctionId(item);
        abi[item.id] = item;
      }
      if (item.type === 'fallback') {
        lowLevel.fallback = item;
      }
      if (item.type === 'receive') {
        lowLevel.receive = item;
      }
    });
  }
  const ids = Object.keys(abi);
  const items =
    ids.length > 2
      ? {
        A: ids.slice(0, ids.length / 2 + 1),
        B: ids.slice(ids.length / 2 + 1),
      }
      : { A: ids };

  await dispatch({
    type: 'SET_INSTANCE',
    payload: {
      ...payload,
      abi,
      items,
      containers: Object.keys(items),
      natSpec,
      solcVersion: solcVersion ? getVersion(solcVersion) : { version: '0.8.25', canReceive: true },
      ...lowLevel,
    },
  });
};

export const resetInstance = async () => {
  const abi = state.instance.abi;
  const ids = Object.keys(abi);
  ids.forEach((id) => {
    abi[id] = { ...abi[id], title: '', details: '' };
  });
  const items =
    ids.length > 1
      ? {
        A: ids.slice(0, ids.length / 2 + 1),
        B: ids.slice(ids.length / 2 + 1),
      }
      : { A: ids };
  await dispatch({
    type: 'SET_INSTANCE',
    payload: {
      items,
      containers: Object.keys(items),
      title: '',
      details: '',
      abi,
    },
  });
};

export const emptyInstance = async () => {
  await dispatch({
    type: 'SET_INSTANCE',
    payload: {
      name: '',
      address: '',
      network: '',
      htmlTemplate: '',
      pages: {},
      abi: {},
      items: {},
      containers: [],
      title: '',
      details: '',
      logo: null,
      theme: 'Dark',
      userInput: { methods: {} },
      natSpec: { checked: false, methods: {} },
    },
  });
};

export const selectTheme = async (selectedTheme: string) => {
  await dispatch({ type: 'SET_INSTANCE', payload: { theme: selectedTheme } });

  const linkEles = document.querySelectorAll('link');
  const nextTheme = themeMap[selectedTheme]; // Theme
  for (const link of linkEles) {
    if (link.href.indexOf('/assets/css/themes/') > 0) {
      link.href = 'https://remix.ethereum.org/' + nextTheme.url;
      document.documentElement.style.setProperty('--theme', nextTheme.quality);
      break;
    }
  }
};

export const setAiLoading = async (isLoading: boolean) => {
  await dispatch({
    type: 'SET_AI_LOADING',
    payload: isLoading,
  });
};