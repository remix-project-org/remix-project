import React from 'react'
import { Overlay } from 'react-bootstrap'
import { Account } from '../types'

interface AccountKebabMenuProps {
  show: boolean
  target: HTMLElement
  onHide: () => void
  account: Account
  menuIndex?: string | number
  onRenameAccount?: (account: Account) => void
  onNewAccount?: () => void
  onCreateSmartAccount?: (account: Account) => void
  onAuthorizeDelegation?: (account: Account) => void
  onSignUsingAccount?: (account: Account) => void
  onDeleteAccount?: (account: Account) => void
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

export const AccountKebabMenu: React.FC<AccountKebabMenuProps> = ({
  show,
  target,
  onHide,
  account,
  menuIndex = 'default',
  onRenameAccount,
  onNewAccount,
  onCreateSmartAccount,
  onAuthorizeDelegation,
  onSignUsingAccount,
  onDeleteAccount
}) => {
  const menuItems = [
    onRenameAccount && {
      id: 'renameAccount',
      label: 'Rename',
      icon: 'fas fa-pen',
      color: 'var(--bs-body-color)',
      onClick: () => onRenameAccount(account)
    },
    onNewAccount && {
      id: 'newAccount',
      label: 'New account',
      icon: 'fas fa-plus',
      color: 'var(--bs-body-color)',
      onClick: () => onNewAccount()
    },
    onCreateSmartAccount && {
      id: 'createSmartAccount',
      label: 'Create smart account',
      icon: 'fas fa-plus',
      color: 'var(--bs-body-color)',
      onClick: () => onCreateSmartAccount(account)
    },
    onAuthorizeDelegation && {
      id: 'authorizeDelegation',
      label: 'Authorize delegation',
      icon: 'fas fa-check',
      color: 'var(--bs-body-color)',
      onClick: () => onAuthorizeDelegation(account)
    },
    onSignUsingAccount && {
      id: 'signUsingAccount',
      label: 'Sign using this account',
      icon: 'fa-regular fa-pen-to-square',
      color: 'var(--bs-body-color)',
      onClick: () => onSignUsingAccount(account)
    },
    onDeleteAccount && {
      id: 'deleteAccount',
      label: 'Delete account',
      icon: 'fas fa-trash',
      color: 'var(--bs-danger)',
      onClick: () => onDeleteAccount(account)
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
        <MenuContent {...props} data-id={`accountKebabMenu-${menuIndex}`}>
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
