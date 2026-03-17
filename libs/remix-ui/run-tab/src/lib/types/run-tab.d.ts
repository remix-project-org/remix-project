import type { CompilerArtefacts } from '@remix-project/core-plugin'
export interface RunTab extends ViewPlugin {
  // constructor(blockchain: Blockchain, config: any, fileManager: any, editor: any, filePanel: any, compilersArtefacts: CompilerArtefacts, networkModule: any, fileProvider: any, engine: any);
  event: any;
  config: any;
  blockchain: Blockchain;
  fileManager: any;
  editor: any;
  filePanel: any;
  compilersArtefacts: any;
  networkModule: any;
  fileProvider: any;
  REACT_API: RunTabState;
  el: HTMLDivElement;
  setupEvents(): void;
  getSettings(): any;
  setEnvironmentMode(env: any): Promise<void>;
  createVMAccount(newAccount: any): any;
  sendTransaction(tx: any): any;
  getAccounts(cb: any): any;
  pendingTransactionsCount(): any;
  onReady(api: any): void;
  recorder: Recorder;
}
import { ViewPlugin } from "@remixproject/engine-web";
import { Blockchain } from "./blockchain";
import { RunTabState } from "../reducers/runTab";
import { Recorder } from "./recorder";

