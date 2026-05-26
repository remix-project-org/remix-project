import React from 'react'

/**
 * ChatNoticeStrip
 *
 * Sticky alert rendered above the chat input for any backend AIError
 * that ISN'T already covered by the cooldown banner or plan-manager
 * hand-off. Driven by `selectChatNotice(snap)` in remix-ai-core.
 *
 * Examples of codes that surface here:
 *   - PROVIDER_DENIED (auto-suggests switching the model picker)
 *   - UPSTREAM_ERROR / STREAM_ERROR / INTERNAL_ERROR / SERVICE_NOT_CONFIGURED
 *   - BAD_REQUEST / MISSING_ENDPOINT / PROVIDER_NOT_SPECIFIED / UNAUTHORIZED_ORIGIN
 *   - PAYLOAD_TOO_LARGE / MISSING_FIGMA_INPUT / INVALID_FIGMA_URL
 *   - any unknown / unrecognised code (verbatim)
 *
 * This strip is non-blocking — the input remains editable, the Send
 * button stays enabled. The user closes it (Dismiss) or it auto-clears
 * on the next successful request.
 */
export interface ChatNoticeDisplay {
  severity: 'info' | 'warning' | 'error'
  code: string
  title: string
  message: string
  actionable: boolean
  allowedProviders?: string[]
  actions?: ChatNoticeActionDisplay[]
}

export type ChatNoticeActionStyle = 'primary' | 'secondary' | 'link'

export interface ChatNoticeActionDisplay {
  id: string
  label: string
  style?: ChatNoticeActionStyle
  plugin: string
  method: string
  args?: unknown[]
  dismissOnClick?: boolean
}

interface ChatNoticeStripProps {
  notice: ChatNoticeDisplay
  onDismiss: () => void
  onAction?: (action: ChatNoticeActionDisplay) => void
}

const SEVERITY_TO_CLASS: Record<ChatNoticeDisplay['severity'], string> = {
  info: 'alert-info',
  warning: 'alert-warning',
  error: 'alert-danger'
}

const SEVERITY_TO_ICON: Record<ChatNoticeDisplay['severity'], string> = {
  info: 'fa-circle-info',
  warning: 'fa-triangle-exclamation',
  error: 'fa-circle-exclamation'
}

const ACTION_STYLE_TO_CLASS: Record<ChatNoticeActionStyle, string> = {
  primary: 'btn-primary',
  secondary: 'btn-outline-secondary',
  link: 'btn-link p-0 text-decoration-none align-baseline'
}

export const ChatNoticeStrip: React.FC<ChatNoticeStripProps> = ({ notice, onDismiss, onAction }) => {
  return (
    <div
      className={`alert mb-0 py-2 px-3 d-flex align-items-start gap-2 ${SEVERITY_TO_CLASS[notice.severity]}`}
      role="alert"
      data-id="ai-chat-notice"
      data-error-code={notice.code}
      style={{ borderRadius: 8, fontSize: '0.85rem' }}
    >
      <i className={`fa-solid ${SEVERITY_TO_ICON[notice.severity]} mt-1`} aria-hidden="true" />
      <div className="flex-grow-1">
        <div className="fw-bold">{notice.title}</div>
        <div className="small">{notice.message}</div>
        <div className="small text-muted mt-1">
          <code>{notice.code}</code>
          {notice.actionable && (
            <span className="ms-2">· You can try sending again.</span>
          )}
        </div>
        {notice.actions && notice.actions.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mt-2">
            {notice.actions.map((action) => {
              const style = action.style ?? 'secondary'
              return (
                <button
                  key={action.id}
                  type="button"
                  className={`btn btn-sm ${ACTION_STYLE_TO_CLASS[style]}`}
                  data-id={`ai-chat-notice-action-${action.id}`}
                  onClick={() => onAction?.(action)}
                >
                  {action.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn btn-sm btn-link text-decoration-none p-0"
        aria-label="Dismiss"
        data-id="ai-chat-notice-dismiss"
        onClick={onDismiss}
      >
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>
    </div>
  )
}
