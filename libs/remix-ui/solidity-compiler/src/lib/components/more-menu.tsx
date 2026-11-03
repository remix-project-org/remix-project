import React, { Ref } from 'react'
import { Dropdown } from 'react-bootstrap'

export type MoreMenuItem = {
  icon: string
  text: React.ReactNode
  sub?: React.ReactNode
  id?: string
  dataId?: string
  disabled?: boolean
  onClick: () => void
} | 'divider'

const MoreToggle = React.forwardRef(
  (
    { onClick, label, dataId, 'aria-expanded': expanded }: { onClick: (e: React.MouseEvent) => void, label: string, dataId?: string, 'aria-expanded'?: boolean },
    ref: Ref<HTMLButtonElement>
  ) => (
    <button
      ref={ref}
      type="button"
      className="sc-icon-btn"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      data-id={dataId}
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
      }}
    >
      <i className="fas fa-ellipsis"></i>
    </button>
  )
)

// the ⋯ button of a section label row and its menu of rare actions
export const MoreMenu = ({ label, dataId, items }: { label: string, dataId: string, items: MoreMenuItem[] }) => (
  <Dropdown align="end">
    <Dropdown.Toggle as={MoreToggle} label={label} dataId={dataId} />
    <Dropdown.Menu className="sc-menu" data-id={`${dataId}-items`}>
      {items.map((item, i) => item === 'divider'
        ? <Dropdown.Divider key={i} />
        : (
          <Dropdown.Item as="button" key={i} id={item.id} data-id={item.dataId} disabled={item.disabled} onClick={item.onClick}>
            <i className={`${item.icon} fa-fw`}></i>
            <span>
              <span className="n">{item.text}</span>
              {item.sub && <small>{item.sub}</small>}
            </span>
          </Dropdown.Item>
        ))}
    </Dropdown.Menu>
  </Dropdown>
)
