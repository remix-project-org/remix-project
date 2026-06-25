import React, { useContext } from 'react'
import { Overlay } from 'react-bootstrap'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { TrackingContext } from '@remix-ide/tracking'
import { useIntl } from 'react-intl'

interface ContractKebabMenuProps {
  show: boolean
  target: HTMLElement
  onHide: () => void
  onCopyABI: () => string
  onCopyBytecode: () => string
  onSaveABI?: () => void
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
  onSaveABI,
  menuIndex = 'default',
}) => {
  const { trackMatomoEvent } = useContext(TrackingContext)
  const intl = useIntl()

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
        <MenuContent {...props} data-id={`contractKebabMenu-${menuIndex}`}>
          <div className="p-0 rounded w-100" style={{ backgroundColor: 'var(--bs-light)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }}>
            <div className="d-flex flex-column">
              <CopyToClipboard tip="Copy" icon="fa-clipboard" direction="right" getContent={onCopyABI} callback={() => trackMatomoEvent?.({ category: 'udapp', action: 'copyContractABI', name: 'clicked', isClick: true })}>
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
              {onSaveABI && (
                <div
                  className="d-flex align-items-center px-3 py-2"
                  data-id="saveABI"
                  onClick={() => {
                    trackMatomoEvent?.({ category: 'udapp', action: 'contractSaveABI', name: 'clicked', isClick: true })
                    onSaveABI()
                    onHide()
                  }}
                  style={{
                    color: 'var(--bs-body-color)',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bs-secondary-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span className="me-2">
                    <i className="far fa-save" />
                  </span>
                  <span>{intl.formatMessage({ id: 'udapp.saveABIMenuItem' })}</span>
                </div>
              )}
              <CopyToClipboard tip="Copy" icon="fa-clipboard" direction="right" getContent={onCopyBytecode} callback={() => trackMatomoEvent?.({ category: 'udapp', action: 'copyContractBytecode', name: 'clicked', isClick: true })}>
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
