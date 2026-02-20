import React from 'react'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import type { DeployedContractsPlugin } from 'apps/remix-ide/src/app/udapp/udappDeployedContracts'
import { FuncABI } from '@remix-project/core-plugin'

export interface DeployedContract {
  address: string
  name: string
  timestamp: number
  abi?: FuncABI[]
  contractData?: any
  network?: string
  filePath?: string
  isPinned?: boolean
  pinnedAt?: number
  decodedResponse?: Record<number, any>
  balance?: string
}

export interface DeployedContractsWidgetState {
  deployedContracts: DeployedContract[]
  isLoading: boolean
  showAddDialog: boolean
  addressInput: string
  showClearAllDialog: boolean
  loadType: 'abi' | 'sol' | 'vyper' | 'lexon' | 'contract' | 'other',
  currentFile: string
  lastLoadedChainId: string | null
  lastLoadedWorkspace: string | null
}

export interface DeployedContractsAppContextType {
  widgetState: DeployedContractsWidgetState
  dispatch: React.Dispatch<Actions>
  plugin: DeployedContractsPlugin
  themeQuality: string
}

export type Actions =
  | { type: 'SET_CONTRACTS'; payload: DeployedContract[] }
  | { type: 'ADD_CONTRACT'; payload: DeployedContract }
  | { type: 'REMOVE_CONTRACT'; payload: string }
  | { type: 'CLEAR_ALL_CONTRACTS'; payload: null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SHOW_ADD_DIALOG'; payload: boolean }
  | { type: 'SET_ADDRESS_INPUT'; payload: string }
  | { type: 'PIN_CONTRACT'; payload: { index: number; pinnedAt: number; filePath: string } }
  | { type: 'UNPIN_CONTRACT'; payload: number }
  | { type: 'SHOW_CLEAR_ALL_DIALOG'; payload: boolean }
  | { type: 'SET_LOAD_TYPE'; payload: 'abi' | 'sol' | 'vyper' | 'lexon' | 'contract' | 'other' }
  | { type: 'SET_CURRENT_FILE'; payload: string }
  | { type: 'SET_DECODED_RESPONSE'; payload: { instanceIndex: number; funcIndex: number; response: any } }
  | { type: 'UPDATE_CONTRACT_BALANCE'; payload: { address: string; balance: string } }
  | { type: 'SET_LAST_LOADED_CHAIN_ID'; payload: string | null }
  | { type: 'SET_LAST_LOADED_WORKSPACE'; payload: string | null }
