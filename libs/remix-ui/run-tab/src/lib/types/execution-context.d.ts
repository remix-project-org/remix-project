
export class ExecutionContext {
  event: any;
  executionContext: any;
  lastBlock: any;
  blockGasLimitDefault: number;
  blockGasLimit: number;
  currentFork: string;
  mainNetGenesisHash: string;
  customNetWorks: any;
  blocks: any;
  latestBlockNumber: number;
  txs: any;
  customWeb3: any;
  init(config: any): void;
  getProvider(): any;
  getCurrentFork(): string;
  isVM(): boolean;
  setWeb3(context: any, web3: any): void;
  web3(): any;
  detectNetwork(callback: any): void;
  removeProvider(name: any): void;
  addProvider(network: any): void;
  internalWeb3(): any;
  setContext(context: any, endPointUrl: any, confirmCb: any, infoCb: any): void;
  executionContextChange(value: any, endPointUrl: any, confirmCb: any, infoCb: any, cb: any): Promise<any>;
  currentblockGasLimit(): number;
  stopListenOnLastBlock(): void;
  // eslint-disable-next-line no-undef
  listenOnLastBlockId: NodeJS.Timer;
  _updateChainContext(): Promise<boolean>;
  listenOnLastBlock(): void;
  txDetailsLink(network: any, hash: any): any;
  getStateDetails(): Promise<string>
}
