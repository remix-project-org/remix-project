import React, { useMemo } from 'react'
import { FormattedMessage } from 'react-intl'
import { WorkspaceSummary, StorageFile } from '@remix-api'
import { RemoteWorkspacesList, CurrentWorkspaceSection, CurrentCloudWorkspaceFiles } from './components'
import { LoginButton } from '@remix-ui/login'
import { CloudWorkspacesProvider, CurrentWorkspaceCloudStatus, CloudWorkspacesContextValue } from './context'
import { WorkspaceBackupData } from './types'

export interface CloudWorkspacesProps {
  plugin: any
  workspaces: WorkspaceSummary[]
  selectedWorkspace: string | null
  workspaceBackups: Record<string, WorkspaceBackupData>
  expandedWorkspaces: Set<string>
  loading: boolean
  error: string | null
  isAuthenticated: boolean
  currentWorkspaceStatus: CurrentWorkspaceCloudStatus
  onSelectWorkspace: (workspaceId: string) => void
  onCollapseWorkspace: (workspaceId: string) => void
  onRestoreBackup: (folder: string, filename: string) => void
  onDeleteBackup: (folder: string, filename: string) => void
  onDownloadBackup: (folder: string, filename: string) => void
  onRefresh: () => void
  onSaveToCloud: () => Promise<void>
  onCreateBackup: () => Promise<void>
  onRestoreAutosave: () => Promise<void>
  onLinkToCurrentUser: () => Promise<void>
  onEnableCloud: () => Promise<void>
  onToggleAutosave: (enabled: boolean) => Promise<void>
  onUpdateRemoteId: (workspaceName: string, remoteId: string) => Promise<void>
  // Encryption handlers
  onToggleEncryption: (enabled: boolean) => Promise<void>
  onSetEncryptionPassphrase: (passphrase: string) => Promise<boolean>
  onGeneratePassphrase: () => Promise<string>
  onClearPassphrase: () => Promise<void>
}

export const RemixUICloudWorkspaces: React.FC<CloudWorkspacesProps> = ({
  plugin,
  workspaces,
  selectedWorkspace,
  workspaceBackups,
  expandedWorkspaces,
  loading,
  error,
  isAuthenticated,
  currentWorkspaceStatus,
  onSelectWorkspace,
  onCollapseWorkspace,
  onRestoreBackup,
  onDeleteBackup,
  onDownloadBackup,
  onRefresh,
  onSaveToCloud,
  onCreateBackup,
  onRestoreAutosave,
  onLinkToCurrentUser,
  onEnableCloud,
  onToggleAutosave,
  onUpdateRemoteId,
  onToggleEncryption,
  onSetEncryptionPassphrase,
  onGeneratePassphrase,
  onClearPassphrase
}) => {
  // Create context value from props
  const contextValue: CloudWorkspacesContextValue = {
    isAuthenticated,
    loading,
    error,
    currentWorkspaceStatus,
    saveToCloud: onSaveToCloud,
    createBackup: onCreateBackup,
    restoreAutosave: onRestoreAutosave,
    linkToCurrentUser: onLinkToCurrentUser,
    enableCloud: onEnableCloud,
    toggleAutosave: onToggleAutosave,
    setWorkspaceRemoteId: onUpdateRemoteId,
    refresh: async () => { onRefresh() },
    toggleEncryption: onToggleEncryption,
    setEncryptionPassphrase: onSetEncryptionPassphrase,
    generateNewPassphrase: onGeneratePassphrase,
    clearEncryptionPassphrase: onClearPassphrase
  }

  if (!isAuthenticated) {
    return (
      <div className="p-3 text-center">
        <i className="fas fa-cloud fa-3x mb-3 text-muted"></i>
        <p className="text-muted">
          <FormattedMessage id="cloudWorkspaces.loginRequired" defaultMessage="Please log in to view your cloud workspaces" />
        </p>
        <LoginButton
          plugin={plugin}
          variant="compact"
          showCredits={true}
        />
      </div>
    )
  }

  // Get current workspace's backup data (if connected to cloud)
  const currentRemoteId = currentWorkspaceStatus.remoteId
  const currentWorkspaceBackupData = currentRemoteId ? workspaceBackups[currentRemoteId] : null

  // Filter out current workspace from remote workspaces list
  const otherWorkspaces = useMemo(() => {
    if (!currentRemoteId) return workspaces
    return workspaces.filter(ws => ws.id !== currentRemoteId)
  }, [workspaces, currentRemoteId])

  return (
    <CloudWorkspacesProvider value={contextValue}>
      <div className="cloud-workspaces-container h-100 d-flex flex-column" style={{ fontSize: '0.85rem' }}>
        {/* Current Workspace Section - shows local/cloud names, save/backup/restore buttons */}
        <CurrentWorkspaceSection plugin={plugin} />

        {/* Current Cloud Workspace Files - shows saves/backups of the connected cloud workspace */}
        {currentRemoteId && (
          <CurrentCloudWorkspaceFiles
            backups={currentWorkspaceBackupData?.backups || []}
            autosave={currentWorkspaceBackupData?.autosave || null}
            loading={currentWorkspaceBackupData?.loading || false}
            onRestore={onRestoreBackup}
            onDelete={onDeleteBackup}
            onDownload={onDownloadBackup}
          />
        )}

        {/* Remote Workspaces Section - shows OTHER remote workspaces for browsing/restoring */}
        <RemoteWorkspacesList
          workspaces={otherWorkspaces}
          selectedWorkspace={selectedWorkspace}
          workspaceBackups={workspaceBackups}
          expandedWorkspaces={expandedWorkspaces}
          loading={loading}
          error={error}
          onSelectWorkspace={onSelectWorkspace}
          onCollapseWorkspace={onCollapseWorkspace}
          onRestoreBackup={onRestoreBackup}
          onDeleteBackup={onDeleteBackup}
          onDownloadBackup={onDownloadBackup}
          onRefresh={onRefresh}
        />
      </div>
    </CloudWorkspacesProvider>
  )
}
