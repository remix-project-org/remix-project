import React, { useState } from "react"
import { useIntl } from "react-intl"

export function DelegationAuthorizationPrompt ({
  onAddressChange
}: {
  onAddressChange: (address: string) => void
}) {
  const intl = useIntl()
  const [authAddress, setAuthAddress] = useState('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
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
      <label className="mt-3">Authorization Address</label>
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
