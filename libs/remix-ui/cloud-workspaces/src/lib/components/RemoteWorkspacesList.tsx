import React, { useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { WorkspaceSummary, StorageFile } from '@remix-api'
import { WorkspaceItem } from './WorkspaceItem'
import { DeleteConfirmModal } from './DeleteConfirmModal'
import { WorkspaceBackupData } from '../types'

export interface RemoteWorkspacesListProps {
  workspaces: WorkspaceSummary[]
  selectedWorkspace: string | null
  workspaceBackups: Record<string, WorkspaceBackupData>
  expandedWorkspaces: Set<string>
  loading: boolean
  error: string | null
  onSelectWorkspace: (workspaceId: string) => void
  onCollapseWorkspace: (workspaceId: string) => void
  onRestoreBackup: (folder: string, filename: string) => void
  onDeleteBackup: (folder: string, filename: string) => void
  onDownloadBackup: (folder: string, filename: string) => void
  onRefresh: () => void
}

export const RemoteWorkspacesList: React.FC<RemoteWorkspacesListProps> = ({
  workspaces,
  selectedWorkspace,
  workspaceBackups,
  expandedWorkspaces,
  loading,
  error,
  onSelectWorkspace,
  onCollapseWorkspace,
  onRestoreBackup,
  onDeleteBackup,
  onDownloadBackup,
  onRefresh
}) => {
  const intl = useIntl()
  const [confirmDelete, setConfirmDelete] = useState<{ folder: string; filename: string } | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const toggleWorkspaceExpand = (workspaceId: string) => {
    const isCurrentlyExpanded = expandedWorkspaces.has(workspaceId)

    if (isCurrentlyExpanded) {
      // Collapsing
      onCollapseWorkspace(workspaceId)
    } else {
      // Expanding - this will add to expanded set and load backups
      onSelectWorkspace(workspaceId)
    }
  }

  const handleRestore = async (folder: string, filename: string) => {
    try {
      await onRestoreBackup(folder, filename)
    } catch (e) {
      console.error('Restore failed:', e)
    }
  }

  const handleDeleteConfirm = (folder: string, filename: string) => {
    setConfirmDelete({ folder, filename })
  }

  const handleDeleteCancel = () => {
    setConfirmDelete(null)
  }

  const handleDeleteExecute = async () => {
    if (confirmDelete) {
      try {
        await onDeleteBackup(confirmDelete.folder, confirmDelete.filename)
      } catch (e) {
        console.error('Delete failed:', e)
      }
      setConfirmDelete(null)
    }
  }

  const handleDownload = async (folder: string, filename: string) => {
    try {
      await onDownloadBackup(folder, filename)
    } catch (e) {
      console.error('Download failed:', e)
    }
  }

  return (
    <div className="remote-workspaces-section flex-grow-1 d-flex flex-column mt-3" style={{ minHeight: 0 }}>
      {/* Section Header - Clickable to collapse */}
      <div
        className="d-flex justify-content-between align-items-center px-2 py-1 border-top border-bottom bg-light"
        style={{ cursor: 'pointer' }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className="text-muted small d-flex align-items-center">
          <i className={`fas fa-chevron-${isCollapsed ? 'right' : 'down'} me-1`} style={{ fontSize: '0.7rem', width: '10px' }}></i>
          <i className="fas fa-cloud me-1"></i>
          <FormattedMessage id="cloudWorkspaces.remoteWorkspaces" defaultMessage="Remote Workspaces" />
          {workspaces.length > 0 && (
            <span className="ms-1 badge bg-secondary" style={{ fontSize: '0.65rem' }}>{workspaces.length}</span>
          )}
        </span>
        <CustomTooltip
          placement="bottom"
          tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.refresh', defaultMessage: 'Refresh' })}
        >
          <button
            className="btn btn-sm p-0 text-muted"
            onClick={(e) => { e.stopPropagation(); onRefresh(); }}
            disabled={loading}
            style={{ border: 'none', background: 'none' }}
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
          </button>
        </CustomTooltip>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <>
          {/* Error Display */}
          {error && (
            <div className="alert alert-danger m-1 py-1 small">
              <i className="fas fa-exclamation-triangle me-1"></i>
              {error}
            </div>
          )}

          {/* Workspaces List */}
          <div className="workspaces-list flex-grow-1 overflow-auto">
            {loading && workspaces.length === 0 ? (
              <div className="text-center p-3">
                <i className="fas fa-spinner fa-spin"></i>
                <p className="mt-1 mb-0 text-muted small">
                  <FormattedMessage id="cloudWorkspaces.loading" defaultMessage="Loading..." />
                </p>
              </div>
            ) : workspaces.length === 0 ? (
              <div className="text-center p-3">
                <i className="fas fa-folder-open text-muted mb-1"></i>
                <p className="text-muted small mb-1">
                  <FormattedMessage id="cloudWorkspaces.noWorkspaces" defaultMessage="No cloud workspaces" />
                </p>
                <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                  <FormattedMessage id="cloudWorkspaces.backupHint" defaultMessage="Use 'Cloud Backup' to backup your first workspace" />
                </small>
              </div>
            ) : (
              <div className="list-group list-group-flush">
                {workspaces.map((workspace) => {
                  const backupData = workspaceBackups[workspace.id]
                  return (
                    <WorkspaceItem
                      key={workspace.id}
                      workspace={workspace}
                      isExpanded={expandedWorkspaces.has(workspace.id)}
                      isSelected={selectedWorkspace === workspace.id}
                      backups={backupData?.backups || []}
                      autosave={backupData?.autosave || null}
                      loading={backupData?.loading || false}
                      onToggleExpand={toggleWorkspaceExpand}
                      onRestore={handleRestore}
                      onDelete={handleDeleteConfirm}
                      onDownload={handleDownload}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <DeleteConfirmModal
          filename={confirmDelete.filename}
          onConfirm={handleDeleteExecute}
          onCancel={handleDeleteCancel}
        />
      )}
    </div>
  )
}
