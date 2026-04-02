import React, { useEffect, useState } from 'react'
import { useIntl } from 'react-intl'

export const OriginWarning = () => {
  const [messageId, setMessageId] = useState<string>(null)
  const [dismissed, setDismissed] = useState(false)
  const intl = useIntl()

  useEffect(() => {
    if (window.location.hostname === 'yann300.github.io') {
      setMessageId('remixApp.originWarningUnstable')
    } else if (
      window.location.hostname === 'alpha.remix.live' ||
      (window.location.hostname === 'ethereum.github.io' && window.location.pathname.indexOf('/remix-live-alpha') === 0)
    ) {
      setMessageId('remixApp.originWarningAlpha')
    } else if (
      window.location.protocol.indexOf('http') === 0 &&
      window.location.hostname !== 'remix.ethereum.org' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setMessageId('remixApp.originWarningMoved')
    }
  }, [intl])

  if (!messageId || dismissed) return null

  return (
    <div
      className="flex items-center justify-center px-3 py-1"
      style={{ backgroundColor: '#c9a000', color: '#000', fontSize: '0.85rem', flexShrink: 0 }}
    >
      <i className="fas fa-exclamation-triangle mr-2"></i>
      <span>{intl.formatMessage({ id: messageId })}</span>
      <button
        className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors p-0 ml-3 border-0"
        style={{ color: '#000', lineHeight: 1 }}
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        <i className="fas fa-times"></i>
      </button>
    </div>
  )
}

export default OriginWarning
