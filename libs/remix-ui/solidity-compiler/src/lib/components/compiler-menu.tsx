import React, { useEffect, useState, useRef, useReducer, useContext, Ref } from 'react'
export const CompilerMenu = React.forwardRef(
  (
    {
      children,
      style,
      'data-id': dataId,
      className,
      'aria-labelledby': labeledBy
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
        <ul className="list-unstyled mb-0" style={{ maxHeight: height + 'px',overflowY:'auto' }}>
          {children}
        </ul>
      </div>
    )
  }
)

export const CompilerMenuToggle = React.forwardRef(
  (
    {
      children,
      onClick,
      icon,
      className = ''
    }: {
      children: React.ReactNode
      onClick: (e) => void
      icon: string
      className: string
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
    >
      <div className="flex">
        {children}
        {icon && (
          <div className="pr-1">
            <i className={`${icon} pr-1`}></i>
          </div>
        )}
        <div>
          <i className="fad fa-sort-circle"></i>
        </div>
      </div>
    </button>
  )
)