import React from 'react'

export default function ChatHistoryHeading() {

  return (
    <section className="d-flex flex-row justify-content-between align-items-center p-2 border border-bottom">
      <div>
        <span>New chat</span>
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
