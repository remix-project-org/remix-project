import React, { useState } from 'react'
import { CompilerFeedbackProps, CompilerReport } from '../../types/compilerTypes'
import { RenderIf } from '@remix-ui/helper'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { FeedbackAlert } from './feedbackAlert'

export function CompilerFeedback ({ feedback, filePathToId, hideWarnings, openErrorLocation, askGPT }: CompilerFeedbackProps) {
  const [showException, setShowException] = useState<boolean>(true)

  const handleCloseException = () => {
    setShowException(false)
  }

  return (
    <div>
      {
        (feedback && typeof feedback === 'string') || (Array.isArray(feedback) && feedback.length > 0) ? (
          <div className="circuit_errors_box">
            <RenderIf condition={ (typeof feedback === "string") && showException }>
              <div className="circuit_feedback error bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded-md" data-id="circuit_feedback">
                <span> <>{ feedback }</> </span>
                <div className="close" data-id="renderer" onClick={handleCloseException}>
                  <i className="fas fa-times"></i>
                </div>
                <div className="flex pt-1 flex-row-reverse">
                  <span className="ml-3 pt-1 py-1" >
                    <CopyToClipboard content={feedback} className="p-0 m-0 far fa-copy error" direction={'top'} />
                  </span>
                </div>
              </div>
            </RenderIf>
            <RenderIf condition={ Array.isArray(feedback) }>
              <>
                {
                  Array.isArray(feedback) && feedback.map((response, index) => (
                    <div key={index} onClick={() => openErrorLocation(response)}>
                      <RenderIf condition={response.type === 'Error'}>
                        <div className={`circuit_feedback ${response.type.toLowerCase()} bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded-md`} data-id="circuit_feedback">
                          <FeedbackAlert
                            message={response.message + (response.labels[0] ? ": " + response.labels[0].message + ` ${filePathToId[response.labels[0].file_id]}:${response.labels[0].range.start}:${response.labels[0].range.end}` : '')}
                            askGPT={ () => askGPT(response) } />
                        </div>
                      </RenderIf>
                      <RenderIf condition={(response.type === 'Warning') && !hideWarnings}>
                        <div className={`circuit_feedback ${response.type.toLowerCase()} bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 dark:border-yellow-600 text-yellow-700 dark:text-yellow-200 px-4 py-3 rounded-md`} data-id="circuit_feedback">
                          <FeedbackAlert
                            message={response.message}
                            askGPT={() => { askGPT(response) }} />
                        </div>
                      </RenderIf>
                    </div>
                  )
                  )
                }
              </>
            </RenderIf>
          </div>
        ) : <></>
      }
    </div>
  )
}
