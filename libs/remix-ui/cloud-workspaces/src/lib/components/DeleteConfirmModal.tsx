import React from 'react'
import { FormattedMessage } from 'react-intl'
import { DeleteConfirmModalProps } from '../types'

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  filename,
  onConfirm,
  onCancel
}) => {
  return (
    <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered modal-sm">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title mb-0">
              <FormattedMessage id="cloudWorkspaces.confirmDelete" defaultMessage="Delete backup?" />
            </h6>
            <button type="button" className="btn-close btn-close-sm" onClick={onCancel}></button>
          </div>
          <div className="modal-body py-2 small">
            <code className="text-truncate d-block" style={{ fontSize: '0.75rem' }}>{filename}</code>
          </div>
          <div className="modal-footer py-1">
            <button type="button" className="btn btn-sm btn-secondary" onClick={onCancel}>
              <FormattedMessage id="cloudWorkspaces.cancel" defaultMessage="Cancel" />
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={onConfirm}>
              <FormattedMessage id="cloudWorkspaces.delete" defaultMessage="Delete" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
