import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { FormattedMessage } from 'react-intl'
import { WorkspaceSummary, StorageFile } from '@remix-api'
import { RemoteWorkspacesList, CurrentWorkspaceSection, CurrentCloudWorkspaceFiles

} from './components'
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
  // Migration handlers
  onMigrateWorkspaces?: () => Promise<void>
  onToggleCloudMode?: (enabled: boolean) => Promise<void>
  migrationStatus?: { hasUnmigratedWorkspaces: boolean; unmigratedWorkspaces: string[]; migratedWorkspaces: string[] }
  cloudModeActive?: boolean
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
  onMigrateWorkspaces,
  onToggleCloudMode,
  migrationStatus,
  cloudModeActive,
  onToggleEncryption,
  onSetEncryptionPassphrase,
  onGeneratePassphrase,
  onClearPassphrase
}) => {
  const [isMigrating, setIsMigrating] = useState(false)
  const [migrationError, setMigrationError] = useState<string | null>(null)

  const handleMigrate = useCallback(async () => {
    if (!onMigrateWorkspaces) return
    setIsMigrating(true)
    setMigrationError(null)
    try {
      await onMigrateWorkspaces()
    } catch (e: any) {
      setMigrationError(e.message || 'Migration failed')
    } finally {
      setIsMigrating(false)
    }
  }, [onMigrateWorkspaces])

  const handleToggleCloudMode = useCallback(async (enabled: boolean) => {
    if (!onToggleCloudMode) return
    try {
      await onToggleCloudMode(enabled)
    } catch (e: any) {
      console.error('Failed to toggle cloud mode:', e)
    }
  }, [onToggleCloudMode])

  // Get current workspace's backup data (if connected to cloud)
  const currentRemoteId = currentWorkspaceStatus.remoteId
  const currentWorkspaceBackupData = currentRemoteId ? workspaceBackups[currentRemoteId] : null

  // Filter out current workspace from remote workspaces list
  // NOTE: All hooks must be above any early returns to satisfy Rules of Hooks
  const otherWorkspaces = useMemo(() => {
    if (!currentRemoteId) return workspaces
    return workspaces.filter(ws => ws.id !== currentRemoteId)
  }, [workspaces, currentRemoteId])

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

  return (
    <CloudWorkspacesProvider value={contextValue}>
      <div className="cloud-workspaces-container h-100 d-flex flex-column" style={{ fontSize: '0.85rem' }}>
        {/* Current Workspace Section - shows local/cloud names, save/backup/restore buttons */}
        <CurrentWorkspaceSection plugin={plugin} />

        {/* Workspace Migration Section - shown when there are unmigrated workspaces */}
        {migrationStatus && migrationStatus.hasUnmigratedWorkspaces && (
          <div className="px-3 py-2 border-bottom">
            <div className="d-flex align-items-center mb-1">
              <i className="fas fa-exchange-alt text-warning mr-2"></i>
              <span className="font-weight-bold small">
                <FormattedMessage id="cloudWorkspaces.migration" defaultMessage="Cloud Migration" />
              </span>
            </div>
            <p className="text-muted small mb-2">
              {migrationStatus.unmigratedWorkspaces.length} workspace(s) can be migrated to cloud-ready format (UUID-based storage).
              This copies your workspaces to a new structure — originals are kept intact.
            </p>
            {migrationStatus.unmigratedWorkspaces.length > 0 && (
              <div className="small text-muted mb-2">
                <strong>Unmigrated:</strong> {migrationStatus.unmigratedWorkspaces.slice(0, 5).join(', ')}
                {migrationStatus.unmigratedWorkspaces.length > 5 && ` ...and ${migrationStatus.unmigratedWorkspaces.length - 5} more`}
              </div>
            )}
            {migrationError && (
              <div className="alert alert-danger py-1 px-2 small mb-2">{migrationError}</div>
            )}
            <button
              className="btn btn-sm btn-warning w-100"
              onClick={handleMigrate}
              disabled={isMigrating}
            >
              {isMigrating ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-1"></i>
                  Migrating...
                </>
              ) : (
                <>
                  <i className="fas fa-cloud-upload-alt mr-1"></i>
                  Migrate Workspaces to Cloud Format
                </>
              )}
            </button>
          </div>
        )}

        {/* Cloud Mode Toggle - shown after migration is complete */}
        {migrationStatus && !migrationStatus.hasUnmigratedWorkspaces && migrationStatus.migratedWorkspaces.length > 0 && (
          <div className="px-3 py-2 border-bottom">
            <div className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center">
                <i className={`fas fa-${cloudModeActive ? 'cloud' : 'folder'} mr-2 ${cloudModeActive ? 'text-success' : 'text-muted'}`}></i>
                <span className="small font-weight-bold">
                  {cloudModeActive ? 'Cloud Mode Active' : 'Legacy Mode'}
                </span>
              </div>
              <div className="custom-control custom-switch">
                <input
                  type="checkbox"
                  className="custom-control-input"
                  id="cloudModeToggle"
                  checked={cloudModeActive || false}
                  onChange={(e) => handleToggleCloudMode(e.target.checked)}
                />
                <label className="custom-control-label" htmlFor="cloudModeToggle">
                  <span className="small">{cloudModeActive ? 'On' : 'Off'}</span>
                </label>
              </div>
            </div>
            <p className="text-muted small mb-0 mt-1">
              {cloudModeActive
                ? `Using UUID-based workspace storage (${migrationStatus.migratedWorkspaces.length} workspace(s)). S3 sync uses these UUIDs directly.`
                : 'Using legacy workspace names. Enable cloud mode to use UUID-based storage for S3 sync.'
              }
            </p>
          </div>
        )}

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
