import React from 'react'
import { CustomTooltip } from '@remix-ui/helper'

/**
 * Building blocks shared by the RemixAI side panels (chat history, changes),
 * so their header, rows and empty state look and behave the same.
 */

interface AIPanelHeaderProps {
  title: string
  count: number
  titleDataId: string
  /** Extra buttons before the close button */
  actions?: React.ReactNode
  /** Close button, when the panel can be closed from its header */
  onClose?: () => void
  closeLabel?: string
  closeDataId?: string
  theme?: string
  /** Rows under the title (search, filters) */
  children?: React.ReactNode
}

export const AIPanelHeader = (props: AIPanelHeaderProps) => (
  <div className="chat-history-sidebar-header border-0 px-3 pt-3 pb-2" style={{ backgroundColor: (props.theme || '').toLowerCase() === 'dark' ? '#222336' : '#eff1f5' }}>
    <div className={`d-flex justify-content-between align-items-center ${props.children ? 'mb-2' : ''}`}>
      <h6 className="mb-0 fw-semibold sidebar-title text-truncate" data-id={props.titleDataId}>
        {props.title} <span className="ms-1 fw-normal text-muted">{props.count}</span>
      </h6>
      <div className="d-flex align-items-center gap-1">
        {props.actions}
        {props.onClose && (
          <CustomTooltip tooltipText={props.closeLabel || 'Close'}>
            <button className="btn btn-sm p-0 sidebar-close-btn d-inline-flex align-items-center" onClick={props.onClose} data-id={props.closeDataId}>
              <i className="fas fa-times"></i>
            </button>
          </CustomTooltip>
        )}
      </div>
    </div>
    {props.children}
  </div>
)

interface AIPanelItemProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Full title, shown on hover when it is cut */
  titleTooltip?: string
  /** Icon class before the text, e.g. "far fa-file-code" */
  icon?: string
  /** Content at the end of the row: badges, counts, a menu */
  trailing?: React.ReactNode
  active?: boolean
  className?: string
  onClick: () => void
  dataId: string
  titleDataId?: string
  subtitleDataId?: string
  /** data-* attributes for tests and lookups */
  dataAttributes?: Record<string, string>
}

/** A card-like row: title and subtitle, hover and active states, opened with a click, Enter or Space */
export const AIPanelItem = (props: AIPanelItemProps) => {
  const onKeyDown = (event: React.KeyboardEvent) => {
    // Keys pressed on a button inside the row (its menu) are the button's
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      props.onClick()
    }
  }
  return (
    <div
      role="button"
      tabIndex={0}
      className={`ai-panel-item d-flex align-items-center gap-2 position-relative ${props.active ? 'ai-panel-item-active' : ''} ${props.className || ''}`}
      onClick={props.onClick}
      onKeyDown={onKeyDown}
      data-id={props.dataId}
      {...props.dataAttributes}
    >
      {props.icon && <i className={`${props.icon} ai-panel-item-icon flex-shrink-0`}></i>}
      <div className="d-flex flex-column flex-grow-1 overflow-hidden">
        <span className="ai-panel-item-title text-truncate" title={props.titleTooltip} data-id={props.titleDataId}>{props.title}</span>
        {props.subtitle && <span className="ai-panel-item-meta text-truncate" data-id={props.subtitleDataId}>{props.subtitle}</span>}
      </div>
      {props.trailing}
    </div>
  )
}

/** A titled group of rows */
export const AIPanelSection = (props: { title: string, children: React.ReactNode }) => (
  <section className="mb-3">
    <div className="ai-panel-section-title text-uppercase px-2 mb-1">{props.title}</div>
    {props.children}
  </section>
)

/** What an empty panel shows */
export const AIPanelEmpty = (props: { icon: string, message: string, hint?: string, dataId?: string }) => (
  <div className="ai-panel-empty text-center mt-4 px-3" data-id={props.dataId}>
    <i className={`${props.icon} ai-panel-empty-icon d-block mb-2`}></i>
    <div>{props.message}</div>
    {props.hint && <div className="ai-panel-empty-hint mt-1">{props.hint}</div>}
  </div>
)
