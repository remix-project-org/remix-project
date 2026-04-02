// eslint-disable-next-line no-use-before-define
import React from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'

interface VerificationSettingsProps {
  isVerifyChecked: boolean
  onVerifyCheckedChange: (isChecked: boolean) => void
}

export function VerificationSettingsUI(props: VerificationSettingsProps) {
  const { isVerifyChecked, onVerifyCheckedChange } = props
  const intl = useIntl()

  return (
    <div className="flex flex-col py-1">
      <div className="flex form-check items-center">
        <input
          id="deployAndRunVerifyContract"
          className="form-check-input"
          type="checkbox"
          onChange={(e) => onVerifyCheckedChange(e.target.checked)}
          checked={isVerifyChecked}
        />
        <CustomTooltip
          placement={'auto-end'}
          tooltipClasses="whitespace-normal text-left"
          tooltipId="remixVerifyContractTooltip"
          tooltipText={
            <span className="text-left">
              <FormattedMessage
                id="udapp.remixVerifyContractTooltip"
                defaultMessage="Automatically verify contract on multiple explorers after deployment. Etherscan API Key can be set in the global Settings panel."
              />
            </span>
          }
        >
          <label htmlFor="deployAndRunVerifyContract" className="m-0 form-check-label udapp_checkboxAlign ml-1">
            <FormattedMessage id="udapp.verifyContract" defaultMessage="Verify Contract on Explorers" />
          </label>
        </CustomTooltip>
      </div>
    </div>
  )
}