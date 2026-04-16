import React, { useState, useEffect, useRef } from 'react'
import { ToolApprovalRequest } from '@remix/remix-ai-core'

interface ToolApprovalModalProps {
  request: ToolApprovalRequest
  onApprove: (modifiedArgs?: Record<string, any>) => void
  onReject: () => void
  /** Triggers showCustomDiff in the editor for line-by-line review */
  onReviewChanges?: () => void
  /** Whether the user is currently reviewing changes in the editor */
  isReviewing?: boolean
}

const RISK_COLORS: Record<string, string> = {
  high: '#e74c3c',
  medium: '#f39c12',
  low: '#27ae60'
}

const RISK_LABELS: Record<string, string> = {
  high: 'High Risk',
  medium: 'Medium Risk',
  low: 'Low Risk'
}

const CATEGORY_ICONS: Record<string, string> = {
  file_write: '📝',
  file_delete: '🗑️',
  deployment: '🚀',
  transaction: '💸',
  dapp: '🌐',
  other: '🔧'
}

export const ToolApprovalModal: React.FC<ToolApprovalModalProps> = ({ request, onApprove, onReject, onReviewChanges, isReviewing }) => {
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
            console.log('[HITL][Modal] TIMEOUT — auto-rejecting:', request.requestId)
            dismissedRef.current = true
            onReject()
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

  const risk = request.risk || 'medium'
  const icon = CATEGORY_ICONS[request.category] || '🔧'
  const isFileOperation = !!request.filePath
  const isExistingFile = request.existingContent !== undefined && request.existingContent !== ''
  const hasProposedContent = !!request.proposedContent
  const canReview = isFileOperation && hasProposedContent && onReviewChanges

  return (
    <div style={{
      background: 'var(--secondary, #2d2d2d)',
      border: `1px solid ${RISK_COLORS[risk]}44`,
      borderRadius: '8px',
      padding: '12px',
      marginTop: '8px',
      marginBottom: '8px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>{icon}</span>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Tool: {request.toolName}</span>
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '8px',
            backgroundColor: `${RISK_COLORS[risk]}22`,
            color: RISK_COLORS[risk],
            fontWeight: 500
          }}>
            {RISK_LABELS[risk]}
          </span>
        </div>
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
          🔍 Reviewing in Editor — Use <strong>Accept All</strong> or <strong>Reject All</strong> in the editor to finalize
        </div>
      )}

      {/* Action buttons */}
      {!isReviewing && (
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
              🔍 Review Changes
            </button>
          )}
        </div>
      )}
    </div>
  )
}
