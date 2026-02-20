import React from 'react'
import { FormattedMessage } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { ToggleSwitch } from '@remix-ui/toggle'

interface VerificationSettingsProps {
  isVerifyChecked: boolean
  onVerifyCheckedChange: (isChecked: boolean) => void
}

export function VerificationSettingsUI(props: VerificationSettingsProps) {
  const { isVerifyChecked, onVerifyCheckedChange } = props

  return (
    <div className="d-flex align-items-center justify-content-between pb-2">
      <div className='d-flex align-items-center'>
        <span className="fw-light">Verify Contract on Explorers</span>
      </div>
      <div className="toggle-container">
        <CustomTooltip
          placement={'left'}
          tooltipClasses="text-wrap text-start"
          tooltipId="remixVerifyContractTooltip"
          tooltipText={
            <span className="text-start">
              <FormattedMessage
                id="udapp.remixVerifyContractTooltip"
                defaultMessage="Automatically verify contract on multiple explorers after deployment. Etherscan API Key can be set in the global Settings panel."
              />
            </span>
          }
        >
          <div
            data-id={`verifyContractToggle`}
            aria-label={`Verify Contract on Explorers`}
          >
            <ToggleSwitch
              id="deployAndRunVerifyContract"
              isOn={isVerifyChecked}
              onClick={() => onVerifyCheckedChange(!isVerifyChecked)}
            />
          </div>
        </CustomTooltip>
      </div>
    </div>
  )
}
