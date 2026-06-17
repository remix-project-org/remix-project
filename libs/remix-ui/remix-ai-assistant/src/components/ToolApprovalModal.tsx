import React, { useState, useEffect } from 'react'
import { ToolApprovalRequest } from '@remix/remix-ai-core'

interface ToolApprovalModalProps {
  request: ToolApprovalRequest
  onApprove: (options?: { enableAutoAccept?: boolean; modifiedArgs?: Record<string, any> }) => void
  onReject: () => void
  /** Triggers showCustomDiff in the editor for line-by-line review */
  onReviewChanges?: () => void
  /** Whether the user is currently reviewing changes in the editor */
  isReviewing?: boolean
}

export const ToolApprovalModal: React.FC<ToolApprovalModalProps> = ({ request, onApprove, onReject, onReviewChanges, isReviewing }) => {
  const [autoAcceptChecked, setAutoAcceptChecked] = useState(false)

  useEffect(() => {
    setAutoAcceptChecked(false)
  }, [request.requestId])

  const handleApprove = () => {
    onApprove({ enableAutoAccept: autoAcceptChecked })
  }

  const handleReject = () => {
    onReject()
  }

  const handleReviewChanges = () => {
    onReviewChanges?.()
  }

  const isFileOperation = !!request.filePath
  const isExistingFile = request.existingContent !== undefined && request.existingContent !== ''
  const hasProposedContent = !!request.proposedContent
  const canReview = isFileOperation && hasProposedContent && onReviewChanges

  return (
    <div className="tool-approval-card">
      {/* Header */}
      <div className="tool-approval-card__header">
        <span className="tool-approval-card__tool-name">{request.toolName}</span>
      </div>

      {/* Deployment / transaction label */}
      {request.category === 'deployment' && (
        <div className="tool-approval-card__deploy-info">
          Deploy contract: <code>{request.toolArgs?.contractName || request.toolArgs?.name || 'unknown'}</code>
          {request.toolArgs?.environment && <span className="tool-approval-card__meta-label">({request.toolArgs.environment})</span>}
        </div>
      )}
      {request.category === 'transaction' && (
        <div className="tool-approval-card__tx-info">
          Send transaction: <code>{request.toolArgs?.to || 'unknown'}</code>
          {request.toolArgs?.value && <span className="tool-approval-card__meta-label">({request.toolArgs.value})</span>}
        </div>
      )}

      {/* File path (file_write / file_delete only) */}
      {request.filePath && request.category !== 'deployment' && request.category !== 'transaction' && (
        <div className="tool-approval-card__file-info">
          {request.category === 'file_delete' ? 'Delete' : isExistingFile ? 'Edit' : 'Create'}: <code>{request.filePath}</code>
          {!isExistingFile && <span className="tool-approval-card__new-file">(new file)</span>}
        </div>
      )}

      {/* Args summary (non-file, non-deployment, non-transaction tools) */}
      {!request.filePath && request.category !== 'deployment' && request.category !== 'transaction' && (
        <div className="tool-approval-card__args-summary">
          <pre className="tool-approval-card__args-pre">
            {JSON.stringify(request.toolArgs, null, 2)}
          </pre>
        </div>
      )}

      {/* Reviewing in Editor indicator */}
      {isReviewing && (
        <div className="tool-approval-card__reviewing">
          Reviewing in Editor — Use <strong>Accept All</strong> or <strong>Reject All</strong> in the editor to finalize
        </div>
      )}

      {/* Auto-accept checkbox */}
      <div className="form-check mb-2">
        <input
          className="form-check-input"
          type="checkbox"
          id="hitlAutoAccept"
          checked={autoAcceptChecked}
          onChange={(e) => setAutoAcceptChecked(e.target.checked)}
          data-id="hitl-auto-accept-checkbox"
        />
        <label className="form-check-label" htmlFor="hitlAutoAccept">
          Auto-accept all changes
        </label>
      </div>

      {/* Action buttons */}
      <div className="tool-approval-card__actions">
        {canReview && (
          <button
            onClick={handleReviewChanges}
            className="tool-approval-card__btn tool-approval-card__btn--review"
            data-id="tool-approval-review-button"
          >
            Review Changes
          </button>
        )}
        <button
          onClick={handleReject}
          className="tool-approval-card__btn tool-approval-card__btn--reject"
          data-id="tool-approval-reject-button"
        >
          Reject
        </button>
        <button
          onClick={handleApprove}
          className="tool-approval-card__btn tool-approval-card__btn--approve"
          data-id="tool-approval-approve-button"
        >
          Approve
        </button>
      </div>
    </div>
  )
}
