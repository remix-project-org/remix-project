import React, { useContext } from 'react'
import { Overlay } from 'react-bootstrap'
import { Transaction } from '../types'
import { TrackingContext } from '@remix-ide/tracking'
import { UdappEvent } from '@remix-api'

interface TransactionKebabMenuProps {
  show: boolean
  target: HTMLElement
  onHide: () => void
  transaction: Transaction
  onDebug?: (transaction: Transaction) => void
  onReplay?: (transaction: Transaction) => void
  onOpenInTerminal?: (transaction: Transaction) => void
  onOpenInExplorer?: (transaction: Transaction) => void
  onClear?: (transaction: Transaction) => void
}

const MenuContent = React.forwardRef<HTMLElement, any>((props, ref) => {
  const { children, style, popper, show, hasDoneInitialMeasure, arrowProps, ...rest } = props
  return (
    <section
      ref={ref}
      style={{
        minWidth: 200,
        zIndex: 9999,
        ...style,
      }}
      {...rest}
    >
      {children}
    </section>
  )
})

MenuContent.displayName = 'MenuContent'

export const TransactionKebabMenu: React.FC<TransactionKebabMenuProps> = ({
  show,
  target,
  onHide,
  transaction,
  onDebug,
  onReplay,
  onOpenInTerminal,
  onOpenInExplorer,
  onClear
}) => {
  const { trackMatomoEvent } = useContext(TrackingContext)
  const menuItems: Array<{
    id: string
    label: string
    icon: string
    color: string
    action: UdappEvent['action']
    onClick: () => void
  }> = [
    onDebug && {
      id: 'debug',
      label: 'Debug',
      icon: 'fas fa-bug',
      color: 'var(--bs-body-color)',
      action: 'transactionDebug' as const,
      onClick: () => onDebug(transaction)
    },
    onReplay && {
      id: 'replay',
      label: 'Replay',
      icon: 'fas fa-arrows-rotate',
      color: 'var(--bs-body-color)',
      action: 'transactionReplay' as const,
      onClick: () => onReplay(transaction)
    },
    onOpenInTerminal && {
      id: 'openInTerminal',
      label: 'Open in terminal',
      icon: 'fas fa-terminal',
      color: 'var(--bs-body-color)',
      action: 'transactionOpenTerminal' as const,
      onClick: () => onOpenInTerminal(transaction)
    },
    onOpenInExplorer && {
      id: 'openInExplorer',
      label: 'Open in explorer',
      icon: 'fas fa-external-link-alt',
      color: 'var(--bs-body-color)',
      action: 'transactionOpenExplorer' as const,
      onClick: () => onOpenInExplorer(transaction)
    },
    onClear && {
      id: 'clear',
      label: 'Clear',
      icon: 'far fa-trash-alt text-danger',
      color: 'var(--bs-danger)',
      action: 'transactionClear' as const,
      onClick: () => onClear(transaction)
    }
  ].filter(Boolean)

  return (
    <Overlay
      show={show}
      target={target}
      placement="auto"
      container={document.body}
      popperConfig={{
        modifiers: [
          { name: "offset", options: { offset: [0, 8]} },
          {
            name: "preventOverflow",
            options: {
              boundary: "clippingParents",
              padding: 8,
              mainAxis: true,
              altAxis: true
            }
          },
          {
            name: 'flip',
            options: {
              enabled: true,
              fallbackPlacements: ['bottom', 'top', 'left', 'right'],
              padding: 8
            }
          }
        ],
      }}
      rootClose
      transition={false}
      onHide={onHide}
    >
      {(props) => (
        <MenuContent {...props} data-id={`transactionKebabMenu-${transaction.record?.txHash}`}>
          <div className="p-0 rounded w-100" style={{ backgroundColor: 'var(--bs-light)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }}>
            <div className="d-flex flex-column">
              {menuItems.map((item, index) => (
                <div
                  key={item.id}
                  className="d-flex align-items-center px-3 py-2"
                  data-id={item.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    trackMatomoEvent?.({ category: 'udapp', action: item.action, name: 'clicked', isClick: true })
                    item.onClick()
                  }}
                  style={{
                    color: item.color,
                    cursor: 'pointer',
                    ...(index === 0 && { borderTopLeftRadius: 8, borderTopRightRadius: 8 }),
                    ...(index === menuItems.length - 1 && { borderBottomLeftRadius: 8, borderBottomRightRadius: 8 })
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-secondary-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span className="me-2">
                    <i className={item.icon} />
                  </span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </MenuContent>
      )}
    </Overlay>
  )
}
