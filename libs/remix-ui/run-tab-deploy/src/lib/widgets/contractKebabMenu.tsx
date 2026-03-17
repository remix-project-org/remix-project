import React from 'react'
import { Overlay } from 'react-bootstrap'
import { CopyToClipboard } from '@remix-ui/clipboard'

interface ContractKebabMenuProps {
  show: boolean
  target: HTMLElement
  onHide: () => void
  onCopyABI: () => string
  onCopyBytecode: () => string
  menuIndex?: string | number
}

const MenuContent = React.forwardRef<HTMLElement, any>((props, ref) => {
  const { children, style, popper, show, hasDoneInitialMeasure, arrowProps, ...rest } = props
  return (
    <section
      ref={ref}
      style={{
        minWidth: 160,
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

export const ContractKebabMenu: React.FC<ContractKebabMenuProps> = ({
  show,
  target,
  onHide,
  onCopyABI,
  onCopyBytecode,
  menuIndex = 'default',
}) => {
  return (
    <Overlay
      show={show}
      target={target}
      placement="right-start"
      container={document.body}
      popperConfig={{
        modifiers: [
          { name: "offset", options: { offset: [-4, 10]} },
          { name: "preventOverflow", options: { boundary: "viewport", padding: 8 } },
          { name: 'flip', options: { enabled: false } }
        ],
      }}
      rootClose
      transition={false}
      onHide={onHide}
    >
      {(props) => (
        <MenuContent {...props} data-id={`contractKebabMenu-${menuIndex}`}>
          <div className="p-0 rounded w-100" style={{ backgroundColor: 'var(--bs-light)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }}>
            <div className="d-flex flex-column">
              <CopyToClipboard tip="Copy" icon="fa-clipboard" direction="right" getContent={onCopyABI}>
                <div
                  className="d-flex align-items-center px-3 py-2"
                  data-id="copyABI"
                  style={{
                    color: 'var(--bs-body-color)',
                    cursor: 'pointer',
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-secondary-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span className="me-2">
                    <i className="far fa-copy" />
                  </span>
                  <span>Copy ABI</span>
                </div>
              </CopyToClipboard>
              <CopyToClipboard tip="Copy" icon="fa-clipboard" direction="right" getContent={onCopyBytecode}>
                <div
                  className="d-flex align-items-center px-3 py-2"
                  data-id="copyBytecode"
                  style={{
                    color: 'var(--bs-body-color)',
                    cursor: 'pointer',
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-secondary-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span className="me-2">
                    <i className="far fa-copy" />
                  </span>
                  <span>Copy Bytecode</span>
                </div>
              </CopyToClipboard>
            </div>
          </div>
        </MenuContent>
      )}
    </Overlay>
  )
}
