import React, { useState, useEffect } from 'react'
import { ToolApprovalRequest } from '@remix/remix-ai-core'
import { countLineChanges } from './aiChangesPanel'

interface ToolApprovalModalProps {
  request: ToolApprovalRequest
  onApprove: (options?: { enableAutoAccept?: boolean; modifiedArgs?: Record<string, any> }) => void
  onReject: () => void
  /** Triggers showCustomDiff in the editor for line-by-line review */
  onReviewChanges?: () => void
  /** Whether the user is currently reviewing changes in the editor */
  isReviewing?: boolean
  /** Row above the card body: "1 of 3" and the bulk actions when several are pending */
  nav?: React.ReactNode
}

const shortAddress = (address: string) => address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address

/** What an approval asks for, in words: icon, verb + subject, and a muted line under it */
export const describeApproval = (request: ToolApprovalRequest) => {
  const args = request.toolArgs || {}
  if (request.category === 'deployment') {
    const contract = args.contractName || args.name || 'contract'
    return { icon: 'fas fa-rocket', verb: 'Deploy', subject: contract, sub: args.environment || args.network || request.toolDescription || '' }
  }
  if (request.category === 'transaction') {
    return { icon: 'fas fa-paper-plane', verb: 'Send transaction to', subject: shortAddress(args.to || 'unknown'), sub: args.value ? `Value ${args.value}` : args.to || '' }
  }
  if (request.filePath) {
    const isExistingFile = request.existingContent !== undefined && request.existingContent !== ''
    const verb = request.category === 'file_delete' ? 'Delete' : isExistingFile ? 'Edit' : 'Create'
    return { icon: request.category === 'file_delete' ? 'fas fa-trash' : 'fas fa-pen', verb, subject: request.filePath.split('/').pop(), sub: request.filePath.replace(/^\/+/, '') }
  }
  return { icon: 'fas fa-wrench', verb: 'Run', subject: request.toolName, sub: request.toolDescription || 'A tool RemixAI wants to use' }
}

export const ToolApprovalModal: React.FC<ToolApprovalModalProps> = ({ request, onApprove, onReject, onReviewChanges, isReviewing, nav }) => {
  const [autoAcceptChecked, setAutoAcceptChecked] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    setAutoAcceptChecked(false)
    setShowDetails(false)
  }, [request.requestId])

  const { icon, verb, subject, sub } = describeApproval(request)
  const isFileOperation = !!request.filePath && request.category !== 'deployment' && request.category !== 'transaction'
  const hasProposedContent = typeof request.proposedContent === 'string'
  const canReview = isFileOperation && !!request.proposedContent && onReviewChanges
  const lines = isFileOperation && hasProposedContent ? countLineChanges(request.existingContent || '', request.proposedContent) : null
  // Deploys and transactions read fine from the title; other tools keep their arguments one click away
  const showArgs = !isFileOperation && request.category !== 'deployment' && request.category !== 'transaction' && Object.keys(request.toolArgs || {}).length > 0
  const approveLabel = request.category === 'deployment' ? 'Deploy' : request.category === 'transaction' ? 'Send' : 'Accept'

  return (
    <div className="ai-approval" data-id="tool-approval-card">
      {nav}
      <div className="ai-approval-head">
        <span className="ai-approval-icon"><i className={icon}></i></span>
        <div className="ai-approval-text">
          <div className="ai-approval-title" title={sub}>{verb} <strong>{subject}</strong></div>
          {sub && <div className="ai-approval-sub">{sub}</div>}
        </div>
        {lines && (
          <span className="ai-approval-stat">
            <span className="ai-approval-add">+{lines.additions}</span> <span className="ai-approval-del">−{lines.deletions}</span>
          </span>
        )}
      </div>

      {showArgs && (
        <>
          <button type="button" className="ai-approval-link ai-approval-details" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>
            {showDetails ? 'Hide' : 'Show'} details <i className={`fas fa-chevron-${showDetails ? 'up' : 'down'}`}></i>
          </button>
          {showDetails && <pre className="ai-approval-args">{JSON.stringify(request.toolArgs, null, 2)}</pre>}
        </>
      )}

      {isReviewing && (
        <div className="ai-approval-reviewing">
          <i className="fas fa-circle-notch fa-spin"></i>
          Reviewing in the editor. Accept or reject the lines there.
        </div>
      )}

      <div className="ai-approval-actions">
        {canReview && !isReviewing && (
          <button
            type="button"
            onClick={() => onReviewChanges?.()}
            className="ai-approval-link"
            data-id="tool-approval-review-button"
          >
            Review
          </button>
        )}
        <span className="flex-grow-1"></span>
        <button
          type="button"
          onClick={onReject}
          className="btn btn-sm btn-secondary"
          data-id="tool-approval-reject-button"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => onApprove({ enableAutoAccept: autoAcceptChecked })}
          className="btn btn-sm btn-primary"
          data-id="tool-approval-approve-button"
        >
          {approveLabel}
        </button>
      </div>

      {/* Auto-accept is global: it covers every tool, not only file changes */}
      <label className="ai-approval-allow" htmlFor="hitlAutoAccept">
        <input
          className="form-check-input m-0"
          type="checkbox"
          id="hitlAutoAccept"
          checked={autoAcceptChecked}
          onChange={(e) => setAutoAcceptChecked(e.target.checked)}
          data-id="hitl-auto-accept-checkbox"
        />
        Accept all changes automatically
      </label>
    </div>
  )
}
