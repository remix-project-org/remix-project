/**
 * Blockchain Events - Blockchain interactions and UDAPP tracking events
 * 
 * This file contains all blockchain and universal dapp related Matomo events.
 */

import { MatomoEventBase } from '../core/base-types';

export interface BlockchainEvent extends MatomoEventBase {
  category: 'blockchain';
  action: 
    | 'providerChanged'
    | 'accountChanged'
    | 'connectionError'
    | 'transactionFailed'
    | 'providerPinned'
    | 'providerUnpinned'
    | 'deployWithProxy'
    | 'upgradeWithProxy';
}

export interface UdappEvent extends MatomoEventBase {
  category: 'udapp';
  action: 
    | 'providerChanged'
    | 'sendTransaction-from-plugin'
    | 'sendTransaction-from-gui'
    | 'safeSmartAccount'
    | 'hardhat'
    | 'sendTx'
    | 'call'
    | 'lowLevelinteractions'
    | 'transact'
    | 'syncContracts'
    | 'forkState'
    | 'deleteState'
    | 'pinContracts'
    | 'signUsingAccount'
    | 'contractDelegation'
    | 'useAtAddress'
    | 'DeployAndPublish'
    | 'DeployOnly'
    | 'DeployContractTo'
    | 'broadcastCompilationResult';
}

export interface RunEvent extends MatomoEventBase {
  category: 'run';
  action: 
    | 'recorder'
    | 'debug';
}





