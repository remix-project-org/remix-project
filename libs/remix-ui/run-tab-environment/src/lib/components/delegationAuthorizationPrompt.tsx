import React, { useState, useContext } from "react"
import { FormattedMessage, useIntl } from "react-intl"
import { TrackingContext } from '@remix-ide/tracking'
import { shortenAddress } from '@remix-ui/helper'

export function DelegationAuthorizationPrompt ({
  onAddressChange
}: {
  onAddressChange: (address: string) => void
}) {
  const intl = useIntl()
  const { trackMatomoEvent } = useContext(TrackingContext)
  const [authAddress, setAuthAddress] = useState('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    trackMatomoEvent?.({ category: 'udapp', action: 'delegationAddressInput', name: value ? shortenAddress(value) : 'empty' })
    setAuthAddress(value)
    onAddressChange(value)
  }

  return (
    <div className="w-100" data-id="createDelegationAuthorizationModal">
      <span>{intl.formatMessage({ id: 'udapp.createDelegationDescription' }, {
        a: (chunks) => (
          <a href='https://eip7702.io/' target="_blank" rel="noreferrer">
            {chunks}
          </a>
        )
      })}</span>
      <label className="mt-3"><FormattedMessage id="udapp.authorizationAddressLabel" /></label>
      <input
        className='border form-control'
        data-id="create-delegation-authorization-input"
        value={authAddress}
        onChange={handleInputChange}
        placeholder="0x..."
      />
    </div>
  )
}
