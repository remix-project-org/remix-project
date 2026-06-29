export class Recorder {
  constructor(blockchain: Blockchain);
  event: any;
  data: { _listen: boolean, _replay: boolean, journal: any[], _createdContracts: any, _createdContractsReverse: any, _usedAccounts: any, _abis: any, _contractABIReferences: any, _linkReferences: any };
  setListen: (listen) => void;
  extractTimestamp: (value) => any;
  resolveAddress: (record, accounts, options) => any;
  append: (timestamp, record) => any;
  getAll: () => void;
  clearAll: () => void;
  run: (records, accounts, options, abis, linkReferences, confirmationCb, continueCb, promptCb, alertCb, logCallBack, newContractFn) => void
  runScenario: (liveMode, json) => Promise<{ abi: any, address: string, contractName: string }>
}
import { Blockchain } from "./blockchain";

