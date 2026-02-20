import React, { useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { StorageFile } from '@remix-api'
import { WorkspaceItemProps, getDayLabel } from '../types'
import { BackupItem } from './BackupItem'
import { AutosaveItem } from './AutosaveItem'

/**
 * Get display name for a workspace - uses workspaceName from metadata if available
 */
const getWorkspaceDisplayName = (workspace: WorkspaceItemProps['workspace']): { primary: string; secondary: string | null } => {
  const workspaceName = workspace.workspaceName
  if (workspaceName && workspaceName !== 'unknown') {
    return {
      primary: workspaceName,
      secondary: workspace.id
    }
  }
  // Fallback to just showing the remote ID
  return {
    primary: workspace.id,
    secondary: null
  }
}

/**
 * Collapsible backup history section with day grouping
 */
const BackupHistorySection: React.FC<{
  backups: StorageFile[]
  onRestore: (folder: string, filename: string) => void
  onDelete: (folder: string, filename: string) => void
  onDownload: (folder: string, filename: string) => void
}> = ({ backups, onRestore, onDelete, onDownload }) => {
  const [isOpen, setIsOpen] = useState(false)
  const sorted = [...backups].reverse()

  // Group backups by day
  const grouped: { label: string; items: StorageFile[] }[] = []
  let currentLabel = ''
  for (const b of sorted) {
    const label = getDayLabel(b.lastModified)
    if (label !== currentLabel) {
      currentLabel = label
      grouped.push({ label, items: [b]})
    } else {
      grouped[grouped.length - 1].items.push(b)
    }
  }

  return (
    <>
      <div
        className="d-flex align-items-center px-2 pt-2 pb-1"
        onClick={() => setIsOpen(!isOpen)}
        style={{ cursor: 'pointer' }}
      >
        <i
          className={`fas fa-chevron-${isOpen ? 'down' : 'right'} me-1 text-muted`}
          style={{ fontSize: '0.55rem', width: '8px' }}
        ></i>
        <i className="fas fa-history me-1 text-muted" style={{ fontSize: '0.65rem' }}></i>
        <span className="text-muted" style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <FormattedMessage id="cloudWorkspaces.backupHistory" defaultMessage="Backup History" />
        </span>
        <span
          className="badge bg-secondary ms-1"
          style={{ fontSize: '0.55rem', padding: '1px 5px', borderRadius: '8px' }}
        >
          {backups.length}
        </span>
      </div>
      {isOpen && (
        <div>
          {grouped.map((group, gi) => (
            <React.Fragment key={gi}>
              {grouped.length > 1 && (
                <div className="px-2 pt-1" style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--secondary)', opacity: 0.6 }}>
                  {group.label}
                </div>
              )}
              {group.items.map((backup, index) => (
                <BackupItem
                  key={backup.key || `${gi}-${index}`}
                  backup={backup}
                  onRestore={onRestore}
                  onDelete={onDelete}
                  onDownload={onDownload}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </>
  )
}

export const WorkspaceItem: React.FC<WorkspaceItemProps> = ({
  workspace,
  isExpanded,
  isSelected,
  backups,
  autosave,
  loading,
  onToggleExpand,
  onRestore,
  onDelete,
  onDownload
}) => {
  const intl = useIntl()
  const { primary, secondary } = getWorkspaceDisplayName(workspace)
  const isOnDevice = workspace.localWorkspaceNames && workspace.localWorkspaceNames.length > 0
  const localNames = workspace.localWorkspaceNames || []

  // Show content when expanded - selection is used for loading backups data
  // but shouldn't block visibility (avoids needing to click twice)
  const isContentVisible = isExpanded

  return (
    <div className="workspace-item">
      {/* Workspace Header */}
      <div
        className="d-flex align-items-center px-2 py-1 border-bottom"
        onClick={() => onToggleExpand(workspace.id)}
        style={{ minHeight: '32px', cursor: 'pointer' }}
      >
        <i
          className={`fas fa-chevron-${isContentVisible ? 'down' : 'right'} me-1`}
          style={{ fontSize: '0.7rem', width: '10px' }}
        ></i>
        <i className={`fas fa-folder me-1 ${isOnDevice ? 'text-success' : 'text-muted'}`}></i>
        <div
          className="d-flex flex-column flex-grow-1 text-truncate"
          style={{ maxWidth: 'calc(100% - 80px)', lineHeight: 1.2 }}
        >
          <div className="d-flex align-items-center text-truncate">
            <span
              className="text-truncate"
              title={secondary ? `${primary} (${secondary})` : primary}
            >
              {primary}
            </span>
            {isOnDevice && (
              <CustomTooltip
                placement="top"
                tooltipText={intl.formatMessage(
                  { id: 'cloudWorkspaces.onThisDevice', defaultMessage: 'On this device as: {names}' },
                  { names: localNames.join(', ') }
                )}
              >
                <i className="fas fa-laptop ms-1 text-success" style={{ fontSize: '0.65rem' }}></i>
              </CustomTooltip>
            )}
          </div>
          {secondary && (
            <span
              className="text-muted text-truncate"
              style={{ fontSize: '0.65rem' }}
              title={secondary}
            >
              {secondary}
            </span>
          )}
        </div>
        {/* Backup count badge - hidden for now
        <small className="text-muted ms-1" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
          {workspace.backupCount}
        </small>
        */}
      </div>

      {/* Backups List (when expanded and selected) */}
      {isContentVisible && (
        <div className="backup-list" style={{ paddingLeft: '20px' }}>
          {loading ? (
            <div className="py-1 px-2 text-center">
              <i className="fas fa-spinner fa-spin small"></i>
            </div>
          ) : (backups.length === 0 && !autosave) ? (
            <div className="py-1 px-2 text-muted small">
              <FormattedMessage id="cloudWorkspaces.noBackups" defaultMessage="No backups" />
            </div>
          ) : (
            <>
              {/* Last Save — the current autosave state */}
              {autosave && (
                <AutosaveItem autosave={autosave} onRestore={onRestore} onDownload={onDownload} />
              )}
              {/* Backup History — collapsible previous snapshots */}
              {backups.length > 0 && (
                <BackupHistorySection
                  backups={backups}
                  onRestore={onRestore}
                  onDelete={onDelete}
                  onDownload={onDownload}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
