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
        <div className="d-flex flex-row flex-wrap gap-2">
          {attachments.map(att => (
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
              <button
                type="button"
                className="btn btn-sm p-0 position-absolute d-flex align-items-center justify-content-center"
                style={{
                  top: 1, right: 1, width: 16, height: 16, lineHeight: 1,
                  borderRadius: '50%', background: 'var(--bs-body-bg)', opacity: 0.9
                }}
                onClick={() => onRemove(att.id)}
                aria-label={`Remove ${att.name}`}
                data-id={`remix-ai-attachment-remove-${att.id}`}
              >
                <i className="fas fa-times" style={{ fontSize: 9 }} />
              </button>
            </div>
          ))}
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
