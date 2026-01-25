import axios from 'axios';
import { omitBy } from 'lodash';
import semver from 'semver';
import { execution } from '@remix-project/remix-lib';
import SurgeClient from '@drafish/surge-client';
import remixClient from '../remix-client';
import { themeMap } from '../components/DeployPanel/theme';
import { endpointUrls } from "@remix-endpoints-helper"

const { encodeFunctionId } = execution.txHelper;

const surgeClient = new SurgeClient({
  // Surge backend doesn't support cross-domain requests, so a proxy is required.
  // Proxy implementation: https://github.com/remix-project-org/remix-wildcard/blob/master/src/hosts/common-corsproxy.ts
  proxy: endpointUrls.commonCorsProxy,
  onError: (err: Error) => {
    console.log(err);
  },
});

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

export const deploy = async (payload: any, callback: any) => {
  const surgeToken = localStorage.getItem('__SURGE_TOKEN');
  const surgeEmail = localStorage.getItem('__SURGE_EMAIL');
  let isLogin = false;
  if (surgeToken && surgeEmail === payload.email) {
    try {
      await surgeClient.whoami();
      isLogin = true;
    } catch (error) {
      /* empty */
    }
  }
  if (!isLogin) {
    try {
      await surgeClient.login({
        user: payload.email,
        password: payload.password,
      });
      localStorage.setItem('__SURGE_EMAIL', payload.email);
      localStorage.setItem('__SURGE_PASSWORD', payload.password);
      localStorage.setItem('__DISQUS_SHORTNAME', payload.shortname);
    } catch (error: any) {
      callback({ code: 'ERROR', error: error.message });
      return;
    }
  }

  const { data } = await axios.get(
    // This JSON file contains all static file paths for the dapp-template.
    // It's generated through the build process automatically.
    `${window.origin}/plugins/remix-dapp/manifest.json`
  );

  const paths = Object.keys(data);

  const { logo, ...instance } = state.instance;

  const instanceJson = JSON.stringify({
    ...instance,
    shortname: payload.shortname,
    shareTo: payload.shareTo,
    showLogo: !!logo,
  })

  const files: Record<string, string> = {
    'dir/assets/instance.json': instanceJson,
  };

  // console.log(
  //   JSON.stringify({
  //     ...instance,
  //     shareTo: payload.shareTo,
  //   })
  // );

  for (let index = 0; index < paths.length; index++) {
    const path = paths[index];
    // download all the static files from the dapp-template domain.
    // dapp-template repository: https://github.com/drafish/remix-dapp
    const resp = await axios.get(`${window.origin}/plugins/remix-dapp/${path}`);
    files[`dir/${path}`] = resp.data;
  }

  if (logo) {
    files['dir/assets/logo.png'] = logo
  }
  files['dir/CORS'] = '*'
  files['dir/index.html'] = files['dir/index.html'].replace(
    'assets/css/themes/remix-dark_tvx1s2.css',
    themeMap[instance.theme].url
  );

  try {
    await surgeClient.publish({
      files,
      domain: `${payload.subdomain}.surge.sh`,
      onProgress: ({
        id,
        progress,
        file,
      }: {
        id: string;
        progress: number;
        file: string;
      }) => {
        // console.log({ id, progress, file });
      },
      onTick: (tick: string) => {},
    });
  } catch ({ message }: any) {
    if (message === '403') {
      callback({ code: 'ERROR', error: 'this domain belongs to someone else' });
    } else {
      callback({ code: 'ERROR', error: 'gateway timeout, please try again' });
    }
    return;
  }

  try {
    // Sometimes deployment reports success even if it actually failed,
    // so an additional verification request is required.
    const instanceResp = await axios.get(`https://${payload.subdomain}.surge.sh/assets/instance.json`);
    if (instanceResp.status === 200 && JSON.stringify(instanceResp.data) === instanceJson) {
      callback({ code: 'SUCCESS', error: '' });
      return;
    }
  } catch (error) {}
  callback({ code: 'ERROR', error: 'deploy failed, please try again' });
  return;

};

export const teardown = async (payload: any, callback: any) => {
  const surgeToken = localStorage.getItem('__SURGE_TOKEN');
  const surgeEmail = localStorage.getItem('__SURGE_EMAIL');
  let isLogin = false;
  if (surgeToken && surgeEmail === payload.email) {
    try {
      await surgeClient.whoami();
      isLogin = true;
    } catch (error) {
      /* empty */
    }
  }
  if (!isLogin) {
    try {
      await surgeClient.login({
        user: payload.email,
        password: payload.password,
      });
      localStorage.setItem('__SURGE_EMAIL', payload.email);
      localStorage.setItem('__SURGE_PASSWORD', payload.password);
      localStorage.setItem('__DISQUS_SHORTNAME', payload.shortname);
    } catch (error: any) {
      callback({ code: 'ERROR', error: error.message });
      return;
    }
  }

  try {
    await surgeClient.teardown(`${payload.subdomain}.surge.sh`);
  } catch ({ message }: any) {
    if (message === '403') {
      callback({ code: 'ERROR', error: 'this domain belongs to someone else' });
    } else {
      callback({ code: 'ERROR', error: 'gateway timeout, please try again' });
    }
    return;
  }
  callback({ code: 'SUCCESS', error: '' });
  return;
}

export const initInstance = async ({
  methodIdentifiers,
  devdoc,
  solcVersion,
  ...payload
}: any) => {
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
  const ids = Object.keys(abi);
  const items =
    ids.length > 2
      ? {
        A: ids.slice(0, ids.length / 2 + 1),
        B: ids.slice(ids.length / 2 + 1),
      }
      : { A: ids };

  // const logo = await axios.get('https://dev.remix-dapp.pages.dev/logo.png', { responseType: 'arraybuffer' })

  await dispatch({
    type: 'SET_INSTANCE',
    payload: {
      ...payload,
      abi,
      items,
      containers: Object.keys(items),
      natSpec,
      solcVersion: getVersion(solcVersion),
      ...lowLevel,
      // logo: logo.data,
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
      abi: {},
      items: {},
      containers: [],
      title: '',
      details: '',
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
