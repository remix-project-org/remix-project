import { EventManager } from './eventManager'
import * as uiHelper from './helpers/uiHelper'
import * as compilerHelper from './helpers/compilerHelper'
import * as util from './util'
import * as hash from './hash'
import { Storage } from './storage'
import { EventsDecoder } from './execution/eventsDecoder'
import * as txExecution from './execution/txExecution'
import * as txHelper from './execution/txHelper'
import * as txFormat from './execution/txFormat'
import { TxListener } from './execution/txListener'
import { LogsManager } from './execution/logsManager'
import { forkAt } from './execution/forkAt'
import * as typeConversion from './execution/typeConversion'
import { TxRunnerVM } from './execution/txRunnerVM'
import { TxRunnerWeb3 } from './execution/txRunnerWeb3'
import { TxRunner } from './execution/txRunner'
import * as txResultHelper from './helpers/txResultHelper'
import * as eip7702Constants from './helpers/eip7702Constants'
import { EOACode7702AuthorizationList } from '@ethereumjs/util'
import type { TransactionReceipt } from 'ethers'
export { ConsoleLogs } from './helpers/hhconsoleSigs'
export { aaSupportedNetworks, aaLocalStorageKey, getPimlicoBundlerURL, aaDeterminiticProxyAddress, toAddress } from './helpers/aaConstants'
export { ICompilerApi, ConfigurationSettings, iSolJsonBinData, iSolJsonBinDataBuild } from './types/ICompilerApi'
export { QueryParams } from './query-params'
export { VMexecutionResult } from './execution/txRunnerVM'
export { Registry } from './registry'
/*
 * A type that represents a `0x`-prefixed hex string.
 */
export type PrefixedHexString = `0x${string}`

export type Transaction = {
  from: string,
  fromSmartAccount: boolean,
  to?: string,
  deployedBytecode?: string
  value: string,
  data: string,
  gasLimit: any,
  useCall?: boolean,
  timestamp?: number,
  signed?: boolean,
  authorizationList?: EOACode7702AuthorizationList
  type?: '0x1' | '0x2' | '0x4'
  web3?: any // Web3 provider to avoid circular callback deadlock
  provider?: string // Provider type to avoid circular callback deadlock
  isVM?: boolean // VM flag to avoid circular callback deadlock
  determineGasPrice?: any // Gas price to avoid circular callback deadlock
}

type TxResult = {
  receipt: TransactionReceipt,
  transactionHash: string,
  tx: any
}

const helpers = {
  ui: uiHelper,
  compiler: compilerHelper,
  txResultHelper
}
const execution = {
  EventsDecoder: EventsDecoder,
  txExecution: txExecution,
  txHelper: txHelper,
  txFormat: txFormat,
  txListener: TxListener,
  TxRunnerWeb3: TxRunnerWeb3,
  TxRunnerVM: TxRunnerVM,
  TxRunner: TxRunner,
  typeConversion: typeConversion,
  LogsManager,
  forkAt
}
export { EventManager, helpers, Storage, util, execution, hash, eip7702Constants, TxResult }
