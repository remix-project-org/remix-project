import React, { useState } from 'react'
import copy from 'copy-to-clipboard'
import { Placement } from 'react-bootstrap/esm/types'

import './copy-to-clipboard.css'
import { CustomTooltip } from '@remix-ui/helper'

interface ICopyToClipboard {
  content?: any
  tip?: string
  icon?: string
  direction?: Placement
  className?: string
  title?: string
  children?: JSX.Element
  getContent?: () => any
  callback?: () => void
  classList?: string
}
export const CopyToClipboard = (props: ICopyToClipboard) => {
  const { tip = 'Copy', icon = 'fa-copy', classList = ' ms-1 p-2', direction = 'right', getContent, children, callback, ...otherProps } = props
  let { content } = props
  const [message, setMessage] = useState(tip)

  const copyData = () => {
    try {
      if (content === '') {
        setMessage('Cannot copy empty content!')
        return
      }
      if (typeof content !== 'string') {
        content = JSON.stringify(content, null, '\t')
      }
      callback && callback()
      copy(content)
      setMessage('Copied')
    } catch (e) {
      console.error(e)
    }
  }

  const handleClick = (e: any) => {
    if (content) {
      // module `copy` keeps last copied thing in the memory, so don't show tooltip if nothing is copied, because nothing was added to memory
      copyData()
    } else {
      content = getContent && getContent()
      copyData()
    }
    e.stopPropagation()
    e.preventDefault()
  }

  const reset = () => {
    setTimeout(() => setMessage(tip), 500)
  }

  const childJSX = children || <i className={`far ${icon} ${classList}`} aria-hidden="true" {...otherProps}></i>

  return (
    <span onClick={handleClick} onMouseLeave={reset} style={{ cursor: 'pointer' }}>
      <CustomTooltip tooltipText={message} tooltipId="overlay-tooltip" placement={direction}>
        {childJSX}
      </CustomTooltip>
    </span>
  )
}

export default CopyToClipboard
