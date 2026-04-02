import React, { useContext } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { ToggleSwitch } from '@remix-ui/toggle'
import { TrackingContext } from '@remix-ide/tracking'

interface VerificationSettingsProps {
  isVerifyChecked: boolean
  onVerifyCheckedChange: (isChecked: boolean) => void
}

export function VerificationSettingsUI(props: VerificationSettingsProps) {
  const { isVerifyChecked, onVerifyCheckedChange } = props
  const intl = useIntl()
  const { trackMatomoEvent } = useContext(TrackingContext)

  return (
    <div className="flex items-center justify-between pb-2">
      <div className='flex items-center'>
        <span className="font-light"><FormattedMessage id="udapp.verifyContractOnExplorers" /></span>
      </div>
      <div className="toggle-container mx-auto px-4">
        <CustomTooltip
          placement={'left'}
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
          <div
            data-id={`verifyContractToggle`}
            aria-label={intl.formatMessage({ id: 'udapp.verifyContractOnExplorers' })}
          >
            <ToggleSwitch
              id="deployAndRunVerifyContract"
              isOn={isVerifyChecked}
              onClick={() => {
                trackMatomoEvent?.({ category: 'udapp', action: 'verifyContractToggle', name: !isVerifyChecked ? 'enabled' : 'disabled', isClick: true })
                onVerifyCheckedChange(!isVerifyChecked)
              }}
            />
          </div>
        </CustomTooltip>
      </div>
    </div>
  )
}
