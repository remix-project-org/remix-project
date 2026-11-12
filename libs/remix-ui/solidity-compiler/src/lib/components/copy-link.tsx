import React, { useEffect, useState } from 'react'
import { useIntl } from 'react-intl'
import copy from 'copy-to-clipboard'

// a link that copies on click and reads "Copied" for a moment, keeping its width
export const CopyLink = ({ label, title, dataId, getContent }: { label: string, title: string, dataId: string, getContent: () => string | undefined }) => {
  const intl = useIntl()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const onClick = () => {
    const content = getContent()
    if (!content) return
    copy(content)
    setCopied(true)
  }

  const copiedLabel = intl.formatMessage({ id: 'solidity.copied' })
  return (
    <button className={`sc-link-btn sc-copy-link ${copied ? 'copied' : ''}`} data-id={dataId} title={title} onClick={onClick}>
      <i className={copied ? 'fas fa-check' : 'far fa-copy'} aria-hidden="true"></i>
      <span className="l" aria-live="polite">
        <span aria-hidden={copied}>{label}</span>
        <span aria-hidden={!copied}>{copiedLabel}</span>
      </span>
    </button>
  )
}
