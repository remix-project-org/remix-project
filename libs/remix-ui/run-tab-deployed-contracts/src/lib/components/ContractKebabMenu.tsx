import React from 'react'
import { Overlay } from 'react-bootstrap'
import { DeployedContract } from '../types'

interface ContractKebabMenuProps {
  show: boolean
  target: HTMLElement
  onHide: () => void
  contract: DeployedContract
  onCreateDapp?: (contract: DeployedContract) => void
  onCopyABI?: (contract: DeployedContract) => void
  onCopyBytecode?: (contract: DeployedContract) => void
  onOpenInExplorer?: (contract: DeployedContract) => void
  onClear?: (contract: DeployedContract) => void
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

export const ContractKebabMenu: React.FC<ContractKebabMenuProps> = ({
  show,
  target,
  onHide,
  contract,
  onCreateDapp,
  onCopyABI,
  onCopyBytecode,
  onOpenInExplorer,
  onClear
}) => {
  const menuItems = [
    onCreateDapp && {
      id: 'createDapp',
      label: 'Create a dapp',
      icon: 'fa-kit fa-remixai',
      color: 'var(--bs-body-color)',
      onClick: () => onCreateDapp(contract)
    },
    onCopyABI && {
      id: 'copyABI',
      label: 'Copy ABI',
      icon: 'far fa-copy',
      color: 'var(--bs-body-color)',
      onClick: () => onCopyABI(contract)
    },
    onCopyBytecode && {
      id: 'copyBytecode',
      label: 'Copy Bytecode',
      icon: 'far fa-copy',
      color: 'var(--bs-body-color)',
      onClick: () => onCopyBytecode(contract)
    },
    onOpenInExplorer && {
      id: 'openInExplorer',
      label: 'Open in explorer',
      icon: 'fas fa-external-link-alt',
      color: 'var(--bs-body-color)',
      onClick: () => onOpenInExplorer(contract)
    },
    onClear && {
      id: 'clear',
      label: 'Clear',
      icon: 'far fa-trash-alt text-danger',
      color: 'var(--bs-danger)',
      onClick: () => onClear(contract)
    }
  ].filter(Boolean)

  return (
    <Overlay
      show={show}
      target={target}
      placement="right-start"
      container={document.body}
      popperConfig={{
        modifiers: [
          { name: "offset", options: { offset: [-4, 22]} },
          { name: "preventOverflow", options: { boundary: "viewport", padding: 8 } },
          { name: 'flip', options: { enabled: false } }
        ],
      }}
      rootClose
      transition={false}
      onHide={onHide}
    >
      {(props) => (
        <MenuContent {...props} data-id={`contractKebabMenu-${contract.address}`}>
          <div className="p-0 rounded w-100" style={{ backgroundColor: 'var(--bs-light)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }}>
            <div className="d-flex flex-column">
              {menuItems.map((item, index) => (
                <div
                  key={item.id}
                  className="d-flex align-items-center px-3 py-2"
                  data-id={item.id}
                  onClick={(e) => {
                    e.stopPropagation()
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
