import React, { useState } from 'react'
import { FeedbackAlertProps } from '../../types/compilerTypes'
import { RenderIf } from '@remix-ui/helper'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { FormattedMessage } from 'react-intl'

export function FeedbackAlert ({ message, askGPT }: FeedbackAlertProps) {
  const [showAlert, setShowAlert] = useState<boolean>(true)

  const handleCloseAlert = () => {
    setShowAlert(false)
  }

  return (
    <RenderIf condition={showAlert}>
      <>
        <span> { message } </span>
        <div className="close" data-id="renderer" onClick={handleCloseAlert}>
          <i className="fas fa-times"></i>
        </div>
        <div className="flex pt-1 flex-row-reverse">
          <span className="ml-3 pt-1 py-1" >
            <CopyToClipboard content={message} className="p-0 m-0 far fa-copy error" direction={'top'} />
          </span>
          <button
            className="flex items-center gap-2 px-3 py-1 text-ai bg-ai/10 hover:bg-ai/20 rounded transition-colors duration-200 text-xs border-0"
            data-id="ask-remix-ai-button"
            onClick={(event) => {
              event.stopPropagation()
              askGPT() }}
          >
            <img src="assets/img/remixAI_small.svg" alt="Remix AI" className="explain-icon" />
            <span><FormattedMessage id="helper.askRemixAI" /></span>
          </button>
        </div>
      </>
    </RenderIf>
  )
}
