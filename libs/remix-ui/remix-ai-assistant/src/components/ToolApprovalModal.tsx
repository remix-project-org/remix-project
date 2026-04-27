import React, { useState, useEffect, useRef } from 'react'
import { ToolApprovalRequest } from '@remix/remix-ai-core'

interface ToolApprovalModalProps {
  request: ToolApprovalRequest
  onApprove: (modifiedArgs?: Record<string, any>) => void
  onReject: () => void
  onTimeout: () => void
  /** Triggers showCustomDiff in the editor for line-by-line review */
  onReviewChanges?: () => void
  /** Whether the user is currently reviewing changes in the editor */
  isReviewing?: boolean
}

export const ToolApprovalModal: React.FC<ToolApprovalModalProps> = ({ request, onApprove, onReject, onTimeout, onReviewChanges, isReviewing }) => {
  const [timeLeft, setTimeLeft] = useState(60)
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
    onApprove()
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
    <div style={{
      background: 'var(--secondary, #2d2d2d)',
      border: '1px solid var(--bs-border-color, #444)',
      borderRadius: '8px',
      padding: '12px',
      marginTop: '8px',
      marginBottom: '8px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontWeight: 600, fontSize: '13px' }}>Tool: {request.toolName}</span>
        {!isReviewing && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted, #999)' }}>
            {timeLeft}s
          </span>
        )}
      </div>

      {/* File path */}
      {request.filePath && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted, #aaa)', marginBottom: '8px' }}>
          {request.category === 'file_delete' ? 'Delete' : isExistingFile ? 'Edit' : 'Create'}: <code>{request.filePath}</code>
          {!isExistingFile && <span style={{ color: '#27ae60', marginLeft: '6px', fontSize: '11px' }}>(new file)</span>}
        </div>
      )}

      {/* Args summary (non-file tools only) */}
      {!request.filePath && (
        <div style={{ fontSize: '12px', marginBottom: '8px', maxHeight: '60px', overflow: 'auto' }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text, #ccc)' }}>
            {JSON.stringify(request.toolArgs, null, 2)}
          </pre>
        </div>
      )}

      {/* Reviewing in Editor indicator */}
      {isReviewing && (
        <div style={{
          fontSize: '12px',
          color: '#3498db',
          marginBottom: '8px',
          padding: '6px 8px',
          borderRadius: '4px',
          background: '#3498db11',
          border: '1px solid #3498db33',
          textAlign: 'center'
        }}>
          Reviewing in Editor — Use <strong>Accept All</strong> or <strong>Reject All</strong> in the editor to finalize
        </div>
      )}

      {/* Action buttons */}
      {(
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleReject}
            style={{
              padding: '5px 14px', borderRadius: '4px', border: 'none',
              background: '#e74c3c', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500
            }}
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            style={{
              padding: '5px 14px', borderRadius: '4px', border: 'none',
              background: '#27ae60', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500
            }}
          >
            Approve
          </button>
          {canReview && (
            <button
              onClick={handleReviewChanges}
              style={{
                padding: '5px 14px', borderRadius: '4px', border: 'none',
                background: '#3498db', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500
              }}
            >
              Review Changes
            </button>
          )}
        </div>
      )}
    </div>
  )
}
