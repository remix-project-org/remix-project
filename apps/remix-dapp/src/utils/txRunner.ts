import { addHexPrefix, toBytes } from '@ethereumjs/util';
import { execution } from '@remix-project/remix-lib';
import { saveSettings } from '../actions';
import { BrowserProvider, ethers, formatUnits, toNumber, TransactionReceipt, TransactionResponse } from 'ethers'

const provider = ethers.getDefaultProvider()

export const shortenAddress = (address: string, etherBalance?: string) => {
  const len = address.length;

  return (
    address.slice(0, 5) +
    '...' +
    address.slice(len - 5, len) +
    (etherBalance ? ' (' + etherBalance.toString() + ' ether)' : '')
  );
};

async function pause() {
  return await new Promise((resolve, reject) => {
    setTimeout(resolve, 1000);
  });
}

async function tryTillReceiptAvailable(txhash) {
  try {
    const receipt: TransactionReceipt = await provider.getTransactionReceipt(txhash);
    if (receipt) {
      if (!receipt.to && !receipt.contractAddress) {
        // this is a contract creation and the receipt doesn't contain a contract address. we have to keep polling...
        console.log(
          'this is a contract creation and the receipt does not contain a contract address. we have to keep polling...'
        );
        return receipt;
      } else return receipt;
    }
  } catch (e) {
    /* empty */
  }
  await pause();
  // eslint-disable-next-line @typescript-eslint/return-await
  return await tryTillReceiptAvailable(txhash);
}

async function tryTillTxAvailable(txhash) {
  try {
    const tx: TransactionResponse = await provider.getTransaction(txhash, );
    if (tx?.blockHash) return tx;
    return tx;
  } catch (e) {
    /* empty */
  }
  // eslint-disable-next-line @typescript-eslint/return-await
  return await tryTillTxAvailable(txhash);
}

export class TxRunner {
  lastBlock: any;
  currentFork: string;
  listenOnLastBlockId: any;
  mainNetGenesisHash: string | undefined;
  blockGasLimit: any;
  blockGasLimitDefault: any;

  constructor() {
    this.lastBlock = null;
    this.blockGasLimitDefault = 4300000;
    this.blockGasLimit = this.blockGasLimitDefault;
    this.currentFork = 'shanghai';
    this.mainNetGenesisHash =
      '0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3';

    this.listenOnLastBlock();

    setInterval(() => {
      this.getAccounts();
    }, 30000);
  }

  setProvider(provider) {
    new ethers.BrowserProvider(provider)
  }

  getAccounts() {
    saveSettings({ isRequesting: true });
    (provider as any).send("eth_requestAccounts", [])
      .then(async (accounts) => {
        const loadedAccounts: any = {};
        for (const account of accounts) {
          const balance = await this.getBalanceInEther(account);
          loadedAccounts[account] = shortenAddress(account, balance);
        }
        saveSettings({ loadedAccounts, isRequesting: false });
      })
      .catch((err) => {
        console.log(err);
        saveSettings({ isRequesting: false });
      });
  }

  async getBalanceInEther(address: string) {
    const balance = await provider.getBalance(address);
    return formatUnits(balance.toString(10), 'ether');
  }

  async getGasPrice() {
    const { gasPrice } = await provider.getFeeData()
    return gasPrice;
  }

  async runTx(tx: any, gasLimit: any, useCall: boolean) {
    if (useCall) {
      const returnValue = await provider.call({ ...tx, gasLimit });

      return toBytes(addHexPrefix(returnValue));
    }

    const network = await this.detectNetwork();

    const txCopy = {
      ...tx,
      type: undefined,
      maxFeePerGas: undefined,
      gasPrice: undefined,
    };

    if (network?.lastBlock) {
      if (network.lastBlock.baseFeePerGas) {
        // the sending stack (web3.js / metamask need to have the type defined)
        // this is to avoid the following issue: https://github.com/MetaMask/metamask-extension/issues/11824
        txCopy.type = '0x2';
        txCopy.maxFeePerGas = Math.ceil(
          Number(
            (
              BigInt(network.lastBlock.baseFeePerGas) +
              BigInt(network.lastBlock.baseFeePerGas) / BigInt(3)
            ).toString()
          )
        );
      } else {
        txCopy.type = '0x1';
        txCopy.gasPrice = undefined;
      }
    }

    try {
      const gasEstimation = await provider.estimateGas(txCopy);
      tx.gasLimit = !gasEstimation ? gasLimit : gasEstimation;
      return await this._executeTx(tx, network);
    } catch (error) {
      console.log(error);
      return { error };
    }
  }

  async detectNetwork() {
    const { chainId } = await provider.getNetwork()
    const id = Number(chainId)
    let name = '';
    if (id === 1) name = 'Main';
    else if (id === 11155111) name = 'Sepolia';
    else name = 'Custom';

    if (id === 1) {
      const block = await provider.getBlock(0);
      if (block && block.hash !== this.mainNetGenesisHash) name = 'Custom';
      return {
        id,
        name,
        lastBlock: this.lastBlock,
        currentFork: this.currentFork,
      };
    } else {
      return {
        id,
        name,
        lastBlock: this.lastBlock,
        currentFork: this.currentFork,
      };
    }
  }

  stopListenOnLastBlock() {
    if (this.listenOnLastBlockId) clearInterval(this.listenOnLastBlockId);
    this.listenOnLastBlockId = null;
  }

  async _updateChainContext() {
    try {
      const block = await provider.getBlock('latest');
      // we can't use the blockGasLimit cause the next blocks could have a lower limit : https://github.com/ethereum/remix/issues/506
      this.blockGasLimit = block?.gasLimit
        ? Math.floor(
          Number(toNumber(block.gasLimit)) -
              (5 * Number(toNumber(block.gasLimit))) / 1024
        )
        : toNumber(this.blockGasLimitDefault);
      this.lastBlock = block;
      try {
        this.currentFork = execution.forkAt(
          (await provider.getNetwork()).chainId,
          block.number
        );
      } catch (e) {
        this.currentFork = 'merge';
        console.log(
          `unable to detect fork, defaulting to ${this.currentFork}..`
        );
        console.error(e);
      }
    } catch (e) {
      console.error(e);
      this.blockGasLimit = this.blockGasLimitDefault;
    }
  }

  listenOnLastBlock() {
    this.listenOnLastBlockId = setInterval(() => {
      void this._updateChainContext();
    }, 15000);
  }

  async _executeTx(tx: any, network: any) {
    if (network?.lastBlock?.baseFeePerGas) {
      // the sending stack (web3.js / metamask need to have the type defined)
      // this is to avoid the following issue: https://github.com/MetaMask/metamask-extension/issues/11824
      tx.type = '0x2';
    }

    let currentDateTime = new Date();
    try {
      const signer = await (provider as BrowserProvider).getSigner(tx.from || 0);
      const { hash } = await signer.sendTransaction(tx);
      const receipt = await tryTillReceiptAvailable(hash);
      tx = await tryTillTxAvailable(hash);

      currentDateTime = new Date();
      return {
        receipt,
        tx,
        transactionHash: receipt ? receipt.hash : null,
      };
    } catch (error: any) {
      console.log(
        `Send transaction failed: ${error.message || error.error} . if you use an injected provider, please check it is properly unlocked. `
      );
      return { error };
    }
  }
}

export default new TxRunner();
