import React from 'react'
import { useIntl, FormattedMessage } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { AutosaveItemProps, formatSize, formatDate, formatRelativeDate } from '../types'

/**
 * Parse workspace name from autosave filename
 * Filename format: "myproject-autosave.zip" or old "autosave-backup.zip"
 * Encrypted: any of the above with .enc suffix
 */
const parseAutosaveFilename = (filename: string): { workspaceName: string | null; isEncrypted: boolean } => {
  // Check if encrypted
  const isEncrypted = filename.endsWith('.enc')

  const name = filename.replace(/\.zip(\.enc)?$/i, '')

  // Old format
  if (name === 'autosave-backup') {
    return { workspaceName: null, isEncrypted }
  }

  // New format: "workspacename-autosave"
  if (name.endsWith('-autosave')) {
    return { workspaceName: name.replace(/-autosave$/, ''), isEncrypted }
  }

  return { workspaceName: null, isEncrypted }
}

export const AutosaveItem: React.FC<AutosaveItemProps> = ({
  autosave,
  onRestore,
  onDownload
}) => {
  const intl = useIntl()
  const { workspaceName, isEncrypted } = parseAutosaveFilename(autosave.filename)

  return (
    <div className="d-flex align-items-center py-1 px-2 border-bottom" style={{ background: 'var(--remix-bg-opacity, transparent)' }}>
      <i className="fas fa-save me-1 text-success" style={{ fontSize: '0.75rem' }}></i>
      {isEncrypted && (
        <CustomTooltip
          placement="top"
          tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.encryptedAutosave', defaultMessage: 'Encrypted save' })}
        >
          <i className="fas fa-lock me-1 text-warning" style={{ fontSize: '0.65rem' }}></i>
        </CustomTooltip>
      )}
      <CustomTooltip
        placement="top"
        tooltipText={`${workspaceName ? workspaceName + ' • ' : ''}${formatDate(autosave.lastModified)}${isEncrypted ? ' 🔐' : ''}`}
      >
        <div className="flex-grow-1 text-truncate" style={{ minWidth: 0, cursor: 'default' }}>
          <span className="small fw-bold">
            <FormattedMessage id="cloudWorkspaces.lastSave" defaultMessage="Last Save" />
          </span>
          {workspaceName && (
            <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>
              ({workspaceName})
            </span>
          )}
          <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>
            {formatSize(autosave.size)} · {formatRelativeDate(autosave.lastModified)}
          </span>
        </div>
      </CustomTooltip>
      <CustomTooltip
        placement="top"
        tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.downloadToComputerTip', defaultMessage: 'Download to your computer' })}
      >
        <button
          className="btn btn-sm p-0 ms-1 text-primary"
          onClick={(e) => {
            e.stopPropagation()
            onDownload(autosave.folder, autosave.filename)
          }}
          style={{ border: 'none', background: 'none' }}
        >
          <i className="fas fa-file-download" style={{ fontSize: '0.8rem' }}></i>
        </button>
      </CustomTooltip>
      <CustomTooltip
        placement="top"
        tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.restoreAutosaveTip', defaultMessage: 'Restore from this save' })}
      >
        <button
          className="btn btn-sm p-0 ms-1 text-success"
          onClick={(e) => {
            e.stopPropagation()
            onRestore(autosave.folder, autosave.filename)
          }}
          style={{ border: 'none', background: 'none' }}
        >
          <i className="fas fa-upload" style={{ fontSize: '0.8rem' }}></i>
        </button>
      </CustomTooltip>
    </div>
  )
}
