import React, { createContext, useContext, ReactNode } from 'react'

/**
 * Current workspace cloud status - tracks sync state of the active workspace
 */
export interface CurrentWorkspaceCloudStatus {
  workspaceName: string
  remoteId: string | null
  lastSaved: string | null
  lastBackup: string | null
  autosaveEnabled: boolean
  isSaving: boolean
  isBackingUp: boolean
  isRestoring: boolean
  isLinking: boolean
  ownedByCurrentUser: boolean
  linkedToAnotherUser: boolean
  canSave: boolean
  // Encryption state
  encryptionEnabled: boolean
  hasEncryptionPassphrase: boolean
}

/**
 * Full cloud workspaces context state
 */
export interface CloudWorkspacesContextState {
  isAuthenticated: boolean
  loading: boolean
  error: string | null
  currentWorkspaceStatus: CurrentWorkspaceCloudStatus
}

/**
 * Actions that can be dispatched to update state
 */
export interface CloudWorkspacesContextActions {
  saveToCloud: () => Promise<void>
  createBackup: () => Promise<void>
  restoreAutosave: () => Promise<void>
  linkToCurrentUser: () => Promise<void>
  enableCloud: () => Promise<void>
  toggleAutosave: (enabled: boolean) => Promise<void>
  setWorkspaceRemoteId: (workspaceName: string, remoteId: string) => Promise<void>
  refresh: () => Promise<void>
  // Encryption actions
  toggleEncryption: (enabled: boolean) => Promise<void>
  setEncryptionPassphrase: (passphrase: string) => Promise<boolean>
  generateNewPassphrase: () => Promise<string>
  clearEncryptionPassphrase: () => Promise<void>
}

export type CloudWorkspacesContextValue = CloudWorkspacesContextState & CloudWorkspacesContextActions

const defaultStatus: CurrentWorkspaceCloudStatus = {
  workspaceName: '',
  remoteId: null,
  lastSaved: null,
  lastBackup: null,
  autosaveEnabled: false,
  isSaving: false,
  isBackingUp: false,
  isRestoring: false,
  isLinking: false,
  ownedByCurrentUser: true,
  linkedToAnotherUser: false,
  canSave: true,
  encryptionEnabled: false,
  hasEncryptionPassphrase: false
}

const defaultContext: CloudWorkspacesContextValue = {
  isAuthenticated: false,
  loading: false,
  error: null,
  currentWorkspaceStatus: defaultStatus,
  saveToCloud: async () => {},
  createBackup: async () => {},
  restoreAutosave: async () => {},
  linkToCurrentUser: async () => {},
  enableCloud: async () => {},
  toggleAutosave: async () => {},
  setWorkspaceRemoteId: async () => {},
  refresh: async () => {},
  toggleEncryption: async () => {},
  setEncryptionPassphrase: async () => false,
  generateNewPassphrase: async () => '',
  clearEncryptionPassphrase: async () => {}
}

export const CloudWorkspacesContext = createContext<CloudWorkspacesContextValue>(defaultContext)

export const useCloudWorkspaces = () => useContext(CloudWorkspacesContext)

export interface CloudWorkspacesProviderProps {
  children: ReactNode
  value: CloudWorkspacesContextValue
}

export const CloudWorkspacesProvider: React.FC<CloudWorkspacesProviderProps> = ({ children, value }) => {
  return (
    <CloudWorkspacesContext.Provider value={value}>
      {children}
    </CloudWorkspacesContext.Provider>
  )
}
