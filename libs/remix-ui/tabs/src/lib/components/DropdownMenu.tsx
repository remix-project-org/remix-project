/* eslint-disable @typescript-eslint/no-non-null-assertion */
import React, { useState, useRef, useEffect } from 'react'
import './DropdownMenu.css'
import { ArrowRightSm } from '@remix-ui/tabs'

export interface MenuItem {
  label: string
  submenu?: MenuItem[]
  onClick?: () => void
  icon?: React.ReactNode
  borderTop?: boolean
  borderBottom?: boolean
  dataId?: string
}

interface DropdownMenuProps {
  items: MenuItem[]
  disabled?: boolean
  onOpen?: () => void
  triggerDataId?: string
  panelDataId?: string
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({
  items, disabled, onOpen, triggerDataId, panelDataId
}) => {
  const [open, setOpen] = useState(false)
  const [activeSubmenu, setActiveSubmenu] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
        setActiveSubmenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="custom-dropdown-wrapper dropdown" ref={ref}>
      <button
        className="custom-dropdown-trigger btn btn-primary"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          if (!disabled) {
            const next = !open
            setOpen(next)
            if (next && onOpen) onOpen()
          }
        }}
        disabled={disabled}
        data-id={triggerDataId || 'custom-dropdown-trigger'}
      >
        <i className="fas fa-angle-down"></i>
      </button>
      <div
        className={`custom-dropdown-panel dropdown-menu ${open ? 'show' : ''}`}
        role="menu"
        data-id={panelDataId || 'custom-dropdown-panel'}
      >
        {items.map((item, idx) => {
          const hasSub = !!item.submenu?.length
          return (
            <div
              key={idx}
              className={[
                'dropdown-item',
                'custom-dropdown-item',
                disabled ? 'disabled' : '',
                item.borderTop ? 'border-top' : '',
                item.borderBottom ? 'border-bottom' : '',
                hasSub ? 'has-submenu' : ''
              ].join(' ')}
              onMouseEnter={() => !disabled && hasSub && setActiveSubmenu(idx)}
              onMouseLeave={() => !disabled && setActiveSubmenu(null)}
              onClick={() => {
                if (!disabled && item.onClick) {
                  item.onClick()
                  setOpen(false)
                }
              }}
              data-id={item.dataId}
              role="menuitem"
            >
              {item.icon && <span className="custom-dropdown-item-icon">{item.icon}</span>}
              <span>{item.label}</span>
              {hasSub && (
                <span className="custom-dropdown-item-icon">
                  <ArrowRightSm />
                </span>
              )}

              {activeSubmenu === idx && hasSub && (
                <div className="custom-dropdown-submenu dropdown-menu show" role="menu" data-id={`${item.dataId || 'submenu'}-panel`}>
                  {item.submenu!.map((sub, subIdx) => (
                    <div
                      key={subIdx}
                      className={[
                        'dropdown-item',
                        'custom-dropdown-item',
                        sub.borderTop ? 'border-top' : '',
                        sub.borderBottom ? 'border-bottom' : ''
                      ].join(' ')}
                      onClick={() => {
                        if (!disabled && sub.onClick) {
                          sub.onClick()
                          setOpen(false)
                        }
                      }}
                      data-id={sub.dataId}
                      role="menuitem"
                    >
                      {sub.icon && <span className="custom-dropdown-item-icon">{sub.icon}</span>}
                      <span>{sub.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DropdownMenu
