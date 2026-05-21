import React, { useState, useEffect, useRef } from 'react'
import { ToolApprovalRequest } from '@remix/remix-ai-core'

interface ToolApprovalModalProps {
  request: ToolApprovalRequest
  onApprove: (options?: { enableAutoAccept?: boolean; modifiedArgs?: Record<string, any> }) => void
  onReject: () => void
  onTimeout: () => void
  /** Triggers showCustomDiff in the editor for line-by-line review */
  onReviewChanges?: () => void
  /** Whether the user is currently reviewing changes in the editor */
  isReviewing?: boolean
}

export const ToolApprovalModal: React.FC<ToolApprovalModalProps> = ({ request, onApprove, onReject, onTimeout, onReviewChanges, isReviewing }) => {
  const [timeLeft, setTimeLeft] = useState(60)
  const [autoAcceptChecked, setAutoAcceptChecked] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const dismissedRef = useRef(false)

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Auto-reject after 60 seconds (paused while reviewing in editor)
  useEffect(() => {

    dismissedRef.current = false
    setAutoAcceptChecked(false)
    stopTimer()

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          stopTimer()
          if (!dismissedRef.current) {

            dismissedRef.current = true
            setTimeout(() => onTimeout(), 0)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      stopTimer()
    }
  }, [request.requestId])

  // Pause timer while reviewing in editor
  useEffect(() => {
    if (isReviewing) {
      stopTimer()
    }
  }, [isReviewing])

  const handleApprove = () => {

    stopTimer()
    dismissedRef.current = true
    onApprove({ enableAutoAccept: autoAcceptChecked })
  }

  const handleReject = () => {

    stopTimer()
    dismissedRef.current = true
    onReject()
  }

  const handleReviewChanges = () => {

    stopTimer()
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
        <span className="tool-approval-card__tool-name">Tool: {request.toolName}</span>
        {!isReviewing && (
          <span className="tool-approval-card__timer">
            {timeLeft}s
          </span>
        )}
      </div>

      {/* Deployment / transaction label */}
      {request.category === 'deployment' && (
        <div className="tool-approval-card__deploy-info">
          🚀 Deploy contract: <code>{request.toolArgs?.contractName || request.toolArgs?.name || 'unknown'}</code>
          {request.toolArgs?.environment && <span className="tool-approval-card__meta-label">({request.toolArgs.environment})</span>}
        </div>
      )}
      {request.category === 'transaction' && (
        <div className="tool-approval-card__tx-info">
          💸 Send transaction: <code>{request.toolArgs?.to || 'unknown'}</code>
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
      <label className="tool-approval-card__auto-accept-label">
        <input
          type="checkbox"
          checked={autoAcceptChecked}
          onChange={(e) => setAutoAcceptChecked(e.target.checked)}
          data-id="hitl-auto-accept-checkbox"
        />
        Auto-accept all changes
      </label>

      {/* Action buttons */}
      <div className="tool-approval-card__actions">
        <button
          onClick={handleReject}
          className="tool-approval-card__btn tool-approval-card__btn--reject"
        >
          Reject
        </button>
        <button
          onClick={handleApprove}
          className="tool-approval-card__btn tool-approval-card__btn--approve"
        >
          Approve
        </button>
        {canReview && (
          <button
            onClick={handleReviewChanges}
            className="tool-approval-card__btn tool-approval-card__btn--review"
          >
            Review Changes
          </button>
        )}
      </div>
    </div>
  )
}
