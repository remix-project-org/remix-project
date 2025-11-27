import React from 'react'
import { TopCardProps } from '../../types/template-explorer-types'

export function TopCard(props: TopCardProps) {

  return (
    <div
      className={`explora-topcard d-flex flex-row align-items-center bg-light p-4 shadow-sm ${props.importWorkspace ? 'border bg-transparent' : 'border-0'}`}
      onClick={props.onClick}
      style={{
        borderRadius: '10px',
        height: '76px',
        width: '298px'
      }}
    >
      <span className="d-flex flex-shrink-0">
        {props.title.includes('AI') || props.description.includes('OpenZeppelin') ? <img src={props.icon} style={{ width: '20px', height: '20px' }} /> : <i className={`${props.icon} fa-2x text-dark`}></i>}
      </span>
      <span className="d-flex flex-column flex-grow-1 ms-3">
        <p className="mb-0">{props.title}</p>
        <p className="mb-0 fw-light text-wrap">{props.description}</p>
      </span>
    </div>
  )
}
