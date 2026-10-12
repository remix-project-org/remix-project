import React from 'react'
import type { ChatAttachment } from '@remix/remix-ai-core'
import type { AttachmentError } from '../hooks/useAttachments'

interface AttachmentStripProps {
  attachments: ChatAttachment[]
  errors?: AttachmentError[]
  onRemove: (id: string) => void
  onDismissErrors?: () => void
}

/**
 * The row of image thumbnails staged above the composer input. Renders nothing
 * when there is neither an attachment nor a rejection to report.
 */
export const AttachmentStrip: React.FC<AttachmentStripProps> = ({ attachments, errors, onRemove, onDismissErrors }) => {
  if (attachments.length === 0 && (!errors || errors.length === 0)) return null

  return (
    <div className="d-flex flex-column gap-1 px-2 pt-2" data-id="remix-ai-attachment-strip">
      {attachments.length > 0 && (
        <div className="d-flex flex-row flex-wrap gap-2 align-items-center">
          {attachments.map(att => {
            const removeBtn = (
              <button
                type="button"
                className="btn btn-sm p-0 d-flex align-items-center justify-content-center"
                onClick={() => onRemove(att.id)}
                aria-label={`Remove ${att.name}`}
                data-id={`remix-ai-attachment-remove-${att.id}`}
              >
                <i className="fas fa-times" style={{ fontSize: 9 }} />
              </button>
            )

            // Images get a real preview; everything else is identified by name,
            // because a thumbnail of a PDF or a .sol file tells you nothing.
            if (att.kind === 'image') {
              return (
                <div
                  key={att.id}
                  className="position-relative rounded overflow-hidden"
                  style={{ width: 48, height: 48, border: '1px solid var(--bs-border-color)' }}
                  title={att.name}
                  data-id={`remix-ai-attachment-${att.id}`}
                >
                  <img
                    src={att.thumbnailDataUrl || att.dataUrl}
                    alt={att.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <span
                    className="position-absolute"
                    style={{
                      top: 1, right: 1, width: 16, height: 16, lineHeight: 1,
                      borderRadius: '50%', background: 'var(--bs-body-bg)', opacity: 0.9
                    }}
                  >
                    {removeBtn}
                  </span>
                </div>
              )
            }

            return (
              <div
                key={att.id}
                className="d-flex align-items-center gap-2 rounded px-2 py-1"
                style={{ border: '1px solid var(--bs-border-color)', maxWidth: 220 }}
                title={att.truncated ? `${att.name} (truncated)` : att.name}
                data-id={`remix-ai-attachment-${att.id}`}
              >
                <i className={`fas ${att.kind === 'document' ? 'fa-file-pdf' : 'fa-file-lines'} text-secondary`} style={{ fontSize: '0.8rem' }} />
                <span className="text-truncate small">{att.name}</span>
                {att.truncated && <span className="badge bg-warning text-dark" style={{ fontSize: '0.6rem' }}>cut</span>}
                {removeBtn}
              </div>
            )
          })}
        </div>
      )}

      {errors && errors.length > 0 && (
        <div className="d-flex align-items-start justify-content-between small text-warning">
          <span>
            {errors.map((err, i) => (
              <div key={i}>{err.fileName ? `${err.fileName}: ` : ''}{err.reason}</div>
            ))}
          </span>
          {onDismissErrors && (
            <button type="button" className="btn btn-sm p-0 ms-2 text-warning" onClick={onDismissErrors} aria-label="Dismiss">
              <i className="fas fa-times" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
