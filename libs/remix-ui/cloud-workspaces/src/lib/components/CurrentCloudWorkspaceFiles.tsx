import React, { useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { StorageFile } from '@remix-api'
import { BackupItem } from './BackupItem'
import { AutosaveItem } from './AutosaveItem'
import { useCloudWorkspaces } from '../context'
import { getDayLabel } from '../types'

export interface CurrentCloudWorkspaceFilesProps {
  backups: StorageFile[]
  autosave: StorageFile | null
  loading: boolean
  onRestore: (folder: string, filename: string) => void
  onDelete: (folder: string, filename: string) => void
  onDownload: (folder: string, filename: string) => void
}

/**
 * Collapsible backup history for the current workspace panel
 */
const CurrentBackupHistory: React.FC<{
  backups: StorageFile[]
  onRestore: (folder: string, filename: string) => void
  onDelete: (folder: string, filename: string) => void
  onDownload: (folder: string, filename: string) => void
}> = ({ backups, onRestore, onDelete, onDownload }) => {
  const [isOpen, setIsOpen] = useState(false)
  const sorted = [...backups].reverse()

  // Group by day
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

export const CurrentCloudWorkspaceFiles: React.FC<CurrentCloudWorkspaceFilesProps> = ({
  backups,
  autosave,
  loading,
  onRestore,
  onDelete,
  onDownload
}) => {
  const intl = useIntl()
  const { currentWorkspaceStatus } = useCloudWorkspaces()

  // Only show if there's a connected remote workspace
  if (!currentWorkspaceStatus.remoteId) {
    return null
  }

  return (
    <div className="current-cloud-files-section border-bottom">
      {/* Section Header */}
      <div className="d-flex justify-content-between align-items-center px-2 py-1 border-bottom bg-light">
        <span className="text-muted small fw-bold">
          <i className="fas fa-cloud me-1"></i>
          <FormattedMessage id="cloudWorkspaces.savedVersions" defaultMessage="Saved Versions" />
        </span>
      </div>

      {/* Files List */}
      <div className="current-cloud-files-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {loading ? (
          <div className="py-2 px-2 text-center">
            <i className="fas fa-spinner fa-spin small"></i>
            <span className="ms-2 text-muted small">
              <FormattedMessage id="cloudWorkspaces.loading" defaultMessage="Loading..." />
            </span>
          </div>
        ) : (backups.length === 0 && !autosave) ? (
          <div className="py-2 px-3 text-muted small">
            <FormattedMessage id="cloudWorkspaces.noSavedVersions" defaultMessage="No saved versions yet. Use Save or Backup above." />
          </div>
        ) : (
          <div style={{ paddingLeft: '8px' }}>
            {/* Last Save — the current autosave state */}
            {autosave && (
              <AutosaveItem
                autosave={autosave}
                onRestore={onRestore}
                onDownload={onDownload}
              />
            )}
            {/* Backup History — collapsible previous snapshots */}
            {backups.length > 0 && (
              <CurrentBackupHistory
                backups={backups}
                onRestore={onRestore}
                onDelete={onDelete}
                onDownload={onDownload}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
