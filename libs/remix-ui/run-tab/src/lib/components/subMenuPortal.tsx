import React, { useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

type SubmenuPortalProps = {
  label: string
  children: React.ReactNode
  minWidth?: number
  offsetX?: number
}

export default function SubmenuPortal({
  label,
  children,
  minWidth = 224,
  offsetX = -2
}: SubmenuPortalProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{top:number;left:number}|null>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const a = anchorRef.current.getBoundingClientRect()
    const left = a.right + offsetX
    const top = a.top

    setPos({ top, left })
  }, [open, offsetX])

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !menuRef.current) return
    const a = anchorRef.current.getBoundingClientRect()
    const m = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth

    let left = a.right + offsetX
    let top = a.top

    const spaceRight = vw - a.right
    const needWidth = Math.max(minWidth, m.width)
    if (spaceRight < needWidth + 8) {
      left = Math.max(8, a.left - needWidth)
    }

    const spaceBottom = window.innerHeight - top
    const overflowY = top + m.height - window.innerHeight
    if (overflowY > 0 && spaceBottom < m.height) {
      top = Math.max(8, window.innerHeight - m.height - 8)
    }

    setPos({ top, left })
  }, [open, minWidth, offsetX])

  useLayoutEffect(() => {
    if (!open) return
    const reflow = () => setOpen((o) => (o ? o : o))
    window.addEventListener('scroll', reflow, true)
    window.addEventListener('resize', reflow)
    return () => {
      window.removeEventListener('scroll', reflow, true)
      window.removeEventListener('resize', reflow)
    }
  }, [open])

  return (
    <>
      <span
        ref={anchorRef}
        className="dropdown-item d-flex justify-content-between align-items-center"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        role="button"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <i className="fas fa-angle-right ms-2" aria-hidden />
      </span>
      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            className="dropdown-menu show"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              minWidth,
              zIndex: 10050,
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            {React.Children.map(children, (child) => {
              if (!React.isValidElement(child)) return child
              const originalOnClick = (child as any).props.onClick

              return React.cloneElement(child, {
                onClick: () => {
                  if (originalOnClick) {
                    originalOnClick()
                  }
                  setOpen(false)
                  // if (onClose) {
                  //   onClose()
                  // }
                },
              } as any)
            })}
          </div>,
          document.body
        )
      }
    </>
  )
}
