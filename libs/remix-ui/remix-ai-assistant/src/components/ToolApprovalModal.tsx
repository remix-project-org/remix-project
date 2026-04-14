import React, { useState, useEffect, useRef } from 'react'
import { ToolApprovalRequest } from '@remix/remix-ai-core'

interface ToolApprovalModalProps {
  request: ToolApprovalRequest
  onApprove: (modifiedArgs?: Record<string, any>) => void
  onReject: () => void
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

export const ToolApprovalModal: React.FC<ToolApprovalModalProps> = ({ request, onApprove, onReject }) => {
  const [showDiff, setShowDiff] = useState(!!request.existingContent)
  const [editMode, setEditMode] = useState(false)
  const [editedContent, setEditedContent] = useState(request.proposedContent || '')
  const [timeLeft, setTimeLeft] = useState(60)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onReject()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const handleApprove = () => {
    if (editMode && editedContent !== request.proposedContent) {
      const modified = { ...request.toolArgs }
      if (modified.content !== undefined) modified.content = editedContent
      else if (modified.data !== undefined) modified.data = editedContent
      onApprove(modified)
    } else {
      onApprove()
    }
  }

  const risk = request.risk || 'medium'
  const icon = CATEGORY_ICONS[request.category] || '🔧'

  return (
    <div style={{
      background: 'var(--secondary, #2d2d2d)',
      border: `1px solid ${RISK_COLORS[risk]}44`,
      borderRadius: '8px',
      padding: '16px',
      marginTop: '8px',
      marginBottom: '8px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>{icon}</span>
          <span style={{ fontWeight: 600 }}>Tool: {request.toolName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '10px',
            backgroundColor: `${RISK_COLORS[risk]}22`,
            color: RISK_COLORS[risk],
            fontWeight: 500
          }}>
            {RISK_LABELS[risk]}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted, #999)' }}>
            {timeLeft}s
          </span>
        </div>
      </div>

      {/* File path */}
      {request.filePath && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted, #aaa)', marginBottom: '8px' }}>
          {request.category === 'file_delete' ? 'Delete' : 'Write'}: <code>{request.filePath}</code>
        </div>
      )}

      {/* Args summary (non-file tools) */}
      {!request.filePath && (
        <div style={{ fontSize: '12px', marginBottom: '8px', maxHeight: '80px', overflow: 'auto' }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text, #ccc)' }}>
            {JSON.stringify(request.toolArgs, null, 2)}
          </pre>
        </div>
      )}

      {/* Diff view */}
      {showDiff && request.existingContent !== undefined && request.proposedContent && (
        <div style={{ marginBottom: '12px', fontSize: '12px', maxHeight: '200px', overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, marginBottom: '4px', color: '#e74c3c' }}>Before</div>
              <pre style={{
                margin: 0, padding: '8px', borderRadius: '4px',
                background: 'var(--bg, #1e1e1e)', whiteSpace: 'pre-wrap',
                border: '1px solid #e74c3c33', maxHeight: '150px', overflow: 'auto'
              }}>
                {request.existingContent || '(new file)'}
              </pre>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, marginBottom: '4px', color: '#27ae60' }}>After</div>
              <pre style={{
                margin: 0, padding: '8px', borderRadius: '4px',
                background: 'var(--bg, #1e1e1e)', whiteSpace: 'pre-wrap',
                border: '1px solid #27ae6033', maxHeight: '150px', overflow: 'auto'
              }}>
                {editMode ? editedContent : request.proposedContent}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Edit area */}
      {editMode && (
        <div style={{ marginBottom: '12px' }}>
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            style={{
              width: '100%', minHeight: '100px', padding: '8px', borderRadius: '4px',
              background: 'var(--bg, #1e1e1e)', color: 'var(--text, #ccc)',
              border: '1px solid var(--border, #444)', fontFamily: 'monospace', fontSize: '12px',
              resize: 'vertical'
            }}
          />
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        {request.proposedContent && !showDiff && request.existingContent !== undefined && (
          <button
            onClick={() => setShowDiff(true)}
            style={{
              padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border, #555)',
              background: 'transparent', color: 'var(--text, #ccc)', cursor: 'pointer', fontSize: '12px'
            }}
          >
            Show Diff
          </button>
        )}
        {request.proposedContent && (
          <button
            onClick={() => setEditMode(!editMode)}
            style={{
              padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border, #555)',
              background: 'transparent', color: 'var(--text, #ccc)', cursor: 'pointer', fontSize: '12px'
            }}
          >
            {editMode ? 'Cancel Edit' : 'Edit'}
          </button>
        )}
        <button
          onClick={onReject}
          style={{
            padding: '6px 16px', borderRadius: '4px', border: 'none',
            background: '#e74c3c', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500
          }}
        >
          Reject
        </button>
        <button
          onClick={handleApprove}
          style={{
            padding: '6px 16px', borderRadius: '4px', border: 'none',
            background: '#27ae60', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 500
          }}
        >
          {editMode ? 'Approve (Edited)' : 'Approve'}
        </button>
      </div>
    </div>
  )
}
