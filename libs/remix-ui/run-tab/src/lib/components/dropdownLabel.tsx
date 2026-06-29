import { CustomTooltip, RenderIf } from '@remix-ui/helper'
import React, { useEffect, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { RunTabState } from '../types'

export type DropDownLabelProps = {
  label: string
  bridges: any
  currentProvider: any
  envLabel: string
  runTabState: RunTabState
  setExecutionEnv: (executionContext: {
    context: string;
  }) => void
  isL2: (providerDisplayName: string) => boolean
  plugin: any
}

export function DropdownLabel({ label, bridges, currentProvider, envLabel, runTabState, setExecutionEnv, isL2, plugin }: DropDownLabelProps) {
  const intl = useIntl()
  const [renderLabel, setRenderLabel] = useState(label)

  useEffect(() => {
    const checkEnvLabels = async () => {
      const selectedEnvs = await plugin.call('blockchain', 'getAllProviders')
      const selectedEnv = selectedEnvs[runTabState.selectExEnv]
      if (selectedEnv) {
        setRenderLabel(selectedEnv.displayName)
        setExecutionEnv({ context: selectedEnv.value })
      } else {
        setRenderLabel(intl.formatMessage({ id: 'udapp.noProviderSet' }))
      }
    }
    checkEnvLabels()
  }, [envLabel])

  return (
    <>
      <span>{renderLabel}</span>
      <RenderIf condition={isL2(renderLabel) && bridges[renderLabel.substring(0, 13)]}>
        <CustomTooltip placement={'auto-end'} tooltipClasses="text-nowrap" tooltipId="info-recorder" tooltipText={<FormattedMessage id="udapp.tooltipText3" />}>
          <i
            style={{ fontSize: 'medium' }}
            className={'ms-1 fa fa-rocket-launch'}
            aria-hidden="true"
            onClick={() => {
              window.open(bridges[currentProvider.displayName.substring(0, 13)], '_blank')
            }}
          ></i>
        </CustomTooltip>
      </RenderIf>
      <RenderIf condition={runTabState.selectExEnv === 'walletconnect'}>
        <CustomTooltip placement={'auto-end'} tooltipClasses="text-nowrap" tooltipId="info-walletconnect" tooltipText={<FormattedMessage id="udapp.tooltipText14" />}>
          <i
            style={{ fontSize: 'medium' }}
            className={'ms-1 fa fa-wallet'}
            aria-hidden="true"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              plugin.call('walletconnect', 'openModal')
            }}
          ></i>
        </CustomTooltip>
      </RenderIf>
    </>
  )
}
