import { CustomTooltip } from '@remix-ui/helper'
import React from 'react'

export default function ChatHistoryHeading() {

  return (
    <section className="d-flex flex-row justify-content-between align-items-center p-2 border-0 border-bottom">
      <div>
        <CustomTooltip
          tooltipText={'Start a new chat'}
        >
          <span>New chat</span>
        </CustomTooltip>
      </div>
      <div></div>
      <div></div>
      <div></div>
      <div className="d-flex flex-row gap-2 justify-content-end align-items-center">
        <span>
          <i className="fas fa-clock-rotate-left"></i>
        </span>
        <span>
          <i className="far fa-box-archive"></i>
        </span>
      </div>
    </section>
  )
}
