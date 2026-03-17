// The forwardRef is important!!

import React, { Ref } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'

// Dropdown needs access to the DOM node in order to position the Menu
export const CustomToggle = React.forwardRef(
  (
    {
      children,
      onClick,
      icon,
      className = '',
      useDefaultIcon = true,
      style
    }: {
      children: React.ReactNode
      onClick: (e) => void
      icon: string
      className: string
      useDefaultIcon?: boolean
      style?: React.CSSProperties
    },
    ref: Ref<HTMLButtonElement>
  ) => (
    <button
      ref={ref}
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
      }}
      className={className.replace('dropdown-toggle', '')}
      style={style}
    >
      <div className="d-flex align-items-center">
        <div className="me-auto text-nowrap text-truncate overflow-hidden font-sm" data-id={`dropdown-content`}>{children}</div>
        {icon ? useDefaultIcon ? (
          <div className="pe-1">
            <i className={`${icon} pe-1`}></i>
          </div>
        ) : (
          <div className="pe-1">
            <i className={`${icon} pe-1`}></i>
          </div>
        ) : null}

        {useDefaultIcon && (
          <div className="pe-1">
            <i className="fad fa-sort-circle"></i>
          </div>
        )}
      </div>
    </button>
  )
)

export const CustomIconsToggle = React.forwardRef(
  (
    {
      onClick,
      icon,
      className = ''
    }: {
      children?: React.ReactNode
      onClick: () => void
      icon: string
      className: string
    },
    ref: Ref<HTMLSpanElement>
  ) => (
    <span
      ref={ref}
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={`${className.replace('dropdown-toggle', '')} me-1 mb-0 pb-0 d-flex justify-content-end align-items-end remixuimenuicon_shadow remixuimenuicon_hamburger_menu fs-3`}
      data-id="workspaceMenuDropdown"
    >
      {icon && (
        <CustomTooltip
          placement={'top'}
          tooltipClasses="text-nowrap text-start"
          tooltipId="remixHamburgerTooltip"
          tooltipText={<FormattedMessage id="filePanel.workspaceActions" />}
        >
          <i style={{ fontSize: 'large' }} className={`${icon}`} data-id="workspaceDropdownMenuIcon"></i>
        </CustomTooltip>
      )}
    </span>
  )
)

// forwardRef again here!
// Dropdown needs access to the DOM of the Menu to measure it
export const CustomMenu = React.forwardRef(
  (
    {
      children,
      style,
      'data-id': dataId,
      className,
      'aria-labelledby': labeledBy,
    }: {
      'children': React.ReactNode
      'style'?: React.CSSProperties
      'data-id'?: string
      'className': string
      'aria-labelledby'?: string
    },
    ref: Ref<HTMLDivElement>
  ) => {
    const height = window.innerHeight * 0.6
    return (
      <div ref={ref} style={style} className={className} aria-labelledby={labeledBy} data-id={dataId}>
        <ul className={`overflow-auto list-unstyled mb-0`} style={{ maxHeight: height + 'px' }}>
          {children}
        </ul>
      </div>
    )
  }
)

export const CustomTopbarMenu = React.forwardRef(
  (
    {
      children,
      style,
      'data-id': dataId,
      className,
      'aria-labelledby': labeledBy,
      innerItemWidth = '',
      innerXPadding = '',
      width = 'w-100'
    }: {
      'children': React.ReactNode
      'style'?: React.CSSProperties
      'data-id'?: string
      'className': string
      'aria-labelledby'?: string
      innerItemWidth?: string,
      innerXPadding?: string
      width?: string
    },
    ref: Ref<HTMLDivElement>
  ) => {
    const height = window.innerHeight * 0.6
    return (
      <div ref={ref} style={style} className={className} aria-labelledby={labeledBy} data-id={dataId}>
        <ul className={`overflow-auto ${ width } list-unstyled text-truncate mb-0 ${innerItemWidth} ${innerXPadding}`} style={{ maxHeight: height + 'px' }}>
          {children}
        </ul>
      </div>
    )
  }
)

export const ProxyAddressToggle = React.forwardRef(
  (
    {
      address,
      onClick,
      className = '',
      onChange
    }: {
      address: string
      onClick: (e) => void
      className: string
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    },
    ref: Ref<HTMLDivElement>
  ) => {
    const intl = useIntl()
    return (
      <div
        ref={ref}
        onClick={(e) => {
          e.preventDefault()
          onClick(e)
        }}
        className={'d-flex ' + className.replace('dropdown-toggle', '')}
        data-id="toggleProxyAddressDropdown"
      >
        <input
          onChange={(e) => {
            e.preventDefault()
            onChange(e)
          }}
          className="udapp_input form-control"
          value={address}
          placeholder={intl.formatMessage({ id: 'udapp.enterProxyAddress' })}
          style={{ backgroundColor: 'var(--bs-body-bg)', color: 'var(--theme-text-color, white)', width: '100%' }}
          data-id="ERC1967AddressInput"
        />
      </div>
    )
  }
)

export const ProxyDropdownMenu = React.forwardRef(
  (
    {
      children,
      style,
      className,
      'aria-labelledby': labeledBy
    }: {
      'children': React.ReactNode
      'style'?: React.CSSProperties
      'className': string
      'aria-labelledby'?: string
    },
    ref: Ref<HTMLDivElement>
  ) => {
    return (
      <div ref={ref} style={style} className={className} aria-labelledby={labeledBy}>
        <ul className="list-unstyled mb-0">{children}</ul>
      </div>
    )
  }
)

export const EnvironmentToggle = React.forwardRef(
  (
    {
      children,
      onClick,
      className = '',
      environmentUI,
      style = {},
      'data-id': dataId
    }: {
      children: React.ReactNode
      onClick: (e) => void
      className: string
      environmentUI: React.ReactNode
      style?: React.CSSProperties,
      'data-id'?: string
    },
    ref: Ref<HTMLDivElement>
  ) => (
    <div
      ref={ref}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick(e)
      }}
      className={className.replace('dropdown-toggle', '')}
      style={style}
      data-id={dataId}
    >
      <div className="d-flex align-items-center">
        <div className="me-auto text-nowrap text-truncate overflow-hidden font-sm">{children}</div>
        {environmentUI}
      </div>
    </div>
  )
)

export const AddressToggle = React.forwardRef(
  (
    {
      children,
      onClick,
      className = '',
      style = {},
      'data-id': dataId
    }: {
      children: React.ReactNode
      onClick: (e) => void
      className: string
      style?: React.CSSProperties,
      'data-id'?: string
    },
    ref: Ref<HTMLButtonElement>
  ) => (
    <button
      ref={ref}
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
      }}
      className={className.replace('dropdown-toggle', '')}
      style={style}
      data-id={dataId}
    >
      {children}
    </button>
  )
)
