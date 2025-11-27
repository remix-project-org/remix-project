import axios from 'axios';
import { AbiCoder, parseUnits } from 'ethers';
import BN from 'bn.js';
import { execution } from '@remix-project/remix-lib';
import { toBytes, addHexPrefix } from '@ethereumjs/util';
import { toast } from 'react-toastify';
import txRunner from '../utils/txRunner';
import metamask from '../utils/metamask';
import buildData from '../utils/buildData';
import walletConnect from '../utils/walletConnect';
const { txFormat, txHelper: { makeFullTypeDefinition } } = execution;

const decodeInputParams = (data: any, abi: any) => {
  data = toBytes(addHexPrefix(data));
  if (!data.length) data = new Uint8Array(32 * abi.inputs.length);

  const inputTypes = [];
  for (let i = 0; i < abi.inputs.length; i++) {
    const type = abi.inputs[i].type;
    inputTypes.push(
      type.indexOf('tuple') === 0
        ? makeFullTypeDefinition(abi.inputs[i])
        : type
    );
  }
  const abiCoder = new AbiCoder();
  const decoded = abiCoder.decode(inputTypes, data);
  const ret: any = {};
  for (const k in abi.inputs) {
    ret[abi.inputs[k].type + ' ' + abi.inputs[k].name] = decoded[k];
  }
  return ret;
}

let dispatch: any, state: any;

export const initDispatch = (_dispatch: any) => {
  dispatch = _dispatch;
};

export const updateState = (_state: any) => {
  state = _state;
};

export const setProvider = async (payload: any) => {
  await dispatch({
    type: 'SET_SETTINGS',
    payload: { loadedAccounts: {} },
  });
  const { provider, networkName } = payload;
  const chainId =
    '0x' + Number(networkName.match(/\(([^)]+)\)/)[1]).toString(16);
  if (provider === 'metamask') {
    const web3Provider: any = window.ethereum;
    await metamask.addCustomNetwork(chainId);
    await web3Provider.request({ method: 'eth_requestAccounts' });
    txRunner.setProvider(web3Provider);
    txRunner.getAccounts();
  }

  if (provider === 'walletconnect') {
    walletConnect.openModal().then(() => {
      txRunner.setProvider(walletConnect as any);
    });
  }

  const isConnected = walletConnect.isWalletConnected()

  if (isConnected) {
    await walletConnect.openModal()
    txRunner.setProvider(walletConnect as any);
  } else {
    await walletConnect.openModal()
    walletConnect.events.on('connectionSuccessful', () => {
      txRunner.setProvider(walletConnect as any)
    })
  }
};

export const initInstance = async () => {
  const resp = await axios.get('/assets/instance.json');
  await dispatch({ type: 'SET_INSTANCE', payload: resp.data });
  await dispatch({
    type: 'SET_SETTINGS',
    payload: { networkName: resp.data.network },
  });
  await setProvider({
    networkName: resp.data.network,
    provider: window.ethereum ? 'metamask' : 'walletconnect',
  });
  updateInstanceBalance(resp.data.address);
  setInterval(() => {
    updateInstanceBalance(resp.data.address);
  }, 30000);
};

export const updateInstanceBalance = async (address: string) => {
  const balance = await txRunner.getBalanceInEther(address);
  await dispatch({ type: 'SET_INSTANCE', payload: { balance } });
};

export const saveSettings = async (payload: any) => {
  await dispatch({ type: 'SET_SETTINGS', payload });
};

export const log = async (payload: any) => {
  const journalBlocks = state.terminal.journalBlocks;
  const { message, style } = payload;
  if (style === 'text-log') {
    toast.info(message[0]);
  } else if (style === 'text-danger') {
    toast.error(message[0]);
  } else {
    toast.success('success');
  }
  await dispatch({
    type: 'SET_TERMINAL',
    payload: {
      journalBlocks: [...journalBlocks, payload],
    },
  });
};

export const runTransactions = async (payload: any) => {
  console.log(payload);
  const { sendValue, sendUnit, gasLimit, selectedAccount } = state.settings;
  const { address, decodedResponse, name } = state.instance;
  const value = parseUnits(sendValue, sendUnit);

  const tx = {
    to: address,
    data: '',
    from: selectedAccount,
    value,
  };

  const isFunction = payload.funcABI.type === 'function';

  if (isFunction) {
    const { dataHex, error } = buildData(payload.funcABI, payload.inputsValues);

    if (error) {
      await log({
        message: [`${payload.logMsg} errored: ${error}`],
        style: 'text-danger',
      });
      return;
    }

    tx.data = dataHex as string;
  } else {
    tx.data = payload.inputsValues;
  }

  if (payload.lookupOnly) {
    await log({
      message: [`${payload.logMsg}`],
      style: 'text-log',
    });
  } else {
    await log({
      message: [`${payload.logMsg} pending ... `],
      style: 'text-log',
    });
  }

  const resp: any = await txRunner.runTx(
    tx,
    '0x' + new BN(gasLimit, 10).toString(16),
    payload.lookupOnly
  );

  if (resp.error) {
    await log({
      message: [`${payload.logMsg} errored: ${resp.error}`],
      style: 'text-danger',
    });
    return;
  }

  if (payload.lookupOnly) {
    await dispatch({
      type: 'SET_INSTANCE',
      payload: {
        decodedResponse: {
          ...decodedResponse,
          [payload.funcIndex]: txFormat.decodeResponse(resp, payload.funcABI),
        },
      },
    });

    await log({
      message: [
        {
          tx: {
            to: tx.to,
            isCall: true,
            from: tx.from,
            envMode: 'injected',
            input: tx.data,
            hash: 'call' + (tx.from || '') + tx.to + tx.data,
          },
          resolvedData: {
            contractName: name,
            to: address,
            fn: payload.funcABI.name,
            params: isFunction
              ? decodeInputParams(
                tx.data?.replace('0x', '').substring(8),
                payload.funcABI
              )
              : tx.data,
            decodedReturnValue: txFormat.decodeResponse(resp, payload.funcABI),
          },
        },
      ],
      style: '',
      name: 'knownTransaction',
      provider: 'injected',
    });
  } else {
    await log({
      message: [
        {
          tx: { ...resp.tx, receipt: resp.receipt },
          receipt: resp.receipt,
          resolvedData: {
            contractName: name,
            to: address,
            fn: payload.funcABI.name,
            params: isFunction
              ? decodeInputParams(
                tx.data?.replace('0x', '').substring(8),
                payload.funcABI
              )
              : tx.data,
          },
        },
      ],
      style: '',
      name: 'knownTransaction',
      provider: 'injected',
    });
  }
};
