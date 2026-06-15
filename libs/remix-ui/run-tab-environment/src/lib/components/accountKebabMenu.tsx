import React from 'react'
import { Overlay } from 'react-bootstrap'
import { useIntl } from 'react-intl'
import { Account } from '../types'

interface AccountKebabMenuProps {
  show: boolean
  target: HTMLElement
  onHide: () => void
  account: Account
  menuIndex?: string | number
  onRenameAccount?: (account: Account) => void
  onNewAccount?: () => void
  onGeneratePrivateKey?: () => void
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
  onGeneratePrivateKey,
  onCreateSmartAccount,
  onAuthorizeDelegation,
  onSignUsingAccount,
  onDeleteAccount
}) => {
  const intl = useIntl()
  const menuItems = [
    onRenameAccount && {
      id: 'renameAccount',
      label: intl.formatMessage({ id: 'udapp.renameAccountMenuItem' }),
      icon: 'fas fa-pen',
      color: 'var(--bs-body-color)',
      onClick: () => onRenameAccount(account)
    },
    onNewAccount && {
      id: 'newAccount',
      label: intl.formatMessage({ id: 'udapp.newAccountMenuItem' }),
      icon: 'fas fa-plus',
      color: 'var(--bs-body-color)',
      onClick: () => onNewAccount()
    },
    onGeneratePrivateKey && {
      id: 'generatePrivateKey',
      label: intl.formatMessage({ id: 'udapp.generatePrivateKeyMenuItem' }),
      icon: 'fas fa-key',
      color: 'var(--bs-body-color)',
      onClick: () => onGeneratePrivateKey()
    },
    onCreateSmartAccount && {
      id: 'createSmartAccount',
      label: intl.formatMessage({ id: 'udapp.createSmartAccountMenuItem' }),
      icon: 'fas fa-plus',
      color: 'var(--bs-body-color)',
      onClick: () => onCreateSmartAccount(account)
    },
    onAuthorizeDelegation && {
      id: 'authorizeDelegation',
      label: intl.formatMessage({ id: 'udapp.authorizeDelegationMenuItem' }),
      icon: 'fas fa-check',
      color: 'var(--bs-body-color)',
      onClick: () => onAuthorizeDelegation(account)
    },
    onSignUsingAccount && {
      id: 'signUsingAccount',
      label: intl.formatMessage({ id: 'udapp.signUsingAccountMenuItem' }),
      icon: 'fa-regular fa-pen-to-square',
      color: 'var(--bs-body-color)',
      onClick: () => onSignUsingAccount(account)
    },
    onDeleteAccount && {
      id: 'deleteAccount',
      label: intl.formatMessage({ id: 'udapp.deleteAccountMenuItem' }),
      icon: 'fas fa-trash',
      color: 'var(--bs-danger)',
      onClick: () => onDeleteAccount(account)
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bs-secondary-bg)'
                  }}
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
