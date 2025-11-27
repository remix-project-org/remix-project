import { Plugin } from "@remixproject/engine/lib/abstract";
import { ExecutionContext } from "./execution-context";
import { EventEmitter } from "events";
export class Blockchain extends Plugin<any, any> {
  constructor(config: any);
  event: any;
  executionContext: ExecutionContext;
  events: EventEmitter;
  config: any;
  txRunner: any;
  networkcallid: number;
  networkStatus: {
        network: {
            name: string;
            id: string;
        };
    };
  setupEvents(): void;
  getCurrentNetworkStatus(): {
        network?: {
            name: string;
            id: string;
        };
        error?: string;
    };
  setupProviders(): void;
  providers: any;
  defaultPinnedProviders: string[];
  getCurrentProvider(): any;
  /** Return the list of accounts */
  getAccounts(cb?: any): any;
  deployContractAndLibraries(selectedContract: any, args: any, contractMetadata: any, compilerContracts: any, callbacks: any, confirmationCb: any): void;
  deployContractWithLibrary(selectedContract: any, args: any, contractMetadata: any, compilerContracts: any, callbacks: any, confirmationCb: any): void;
  createContract(selectedContract: any, data: any, continueCb: any, promptCb: any, confirmationCb: any, finalCb: any): void;
  determineGasPrice(cb: any): void;
  getInputs(funABI: any): any;
  fromWei(value: any, doTypeConversion: any, unit: any): string;
  toWei(value: any, unit: any): string;
  calculateFee(gas: any, gasPrice: any, unit: any): bigint;
  determineGasFees(tx: any): (gasPrice: any, cb: any) => void;
  changeExecutionContext(context: any, confirmCb: any, infoCb: any, cb: any): Promise<any>;
  detectNetwork(cb: any): void;
  getProvider(): any;
  /**
     * return the fork name applied to the current environment
     * @return {String} - fork name
     */
  getCurrentFork(): string;
  signMessage(message: any, account: any, passphrase: any, cb: any): void;
  web3(): any;
  getTxListener(opts: any): any;
  runOrCallContractMethod(contractName: any, contractAbi: any, funABI: any, contract: any, value: any, address: any, callType: any, lookupOnly: any, logMsg: any, logCallback: any, outputCb: any, confirmationCb: any, continueCb: any, promptCb: any, finalCb?: any): void;
  context(): "memory" | "blockchain";
  resetAndInit(config: any, transactionContextAPI: any): void;
  transactionContextAPI: any;
  addProvider(provider: any): void;
  removeProvider(name: any): void;
  /** Listen on New Transaction. (Cannot be done inside constructor because txlistener doesn't exist yet) */
  startListening(txlistener: any): void;
  /**
     * Create a VM Account
     * @param {{privateKey: string, balance: string}} newAccount The new account to create
     */
  createVMAccount(newAccount: {
        privateKey: string;
        balance: string;
    }): any;
  newAccount(_password: any, passwordPromptCb: any, cb: any): any;
  /** Get the balance of an address, and convert wei to ether */
  getBalanceInEther(address: any): Promise<string>;
  pendingTransactionsCount(): number;
  /**
     * This function send a tx only to Remix VM or testnet, will return an error for the mainnet
     * SHOULD BE TAKEN CAREFULLY!
     *
     * @param {Object} tx    - transaction.
     */
  sendTransaction(tx: any): any;
  runTx(args: any, confirmationCb: any, continueCb: any, promptCb: any, cb: any): void;
}

