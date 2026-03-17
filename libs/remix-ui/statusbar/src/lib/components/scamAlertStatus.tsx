import React from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { ExtendedRefs, ReferenceType } from '@floating-ui/react'
import { CustomTooltip } from '@remix-ui/helper'

export interface ScamAlertStatusProps {
  refs: ExtendedRefs<ReferenceType>
  getReferenceProps: (userProps?: React.HTMLProps<HTMLElement> | undefined) => Record<string, unknown>
}

export default function ScamAlertStatus ({ refs, getReferenceProps }: ScamAlertStatusProps) {
  const intl = useIntl()

  return (
    <>
      <CustomTooltip
        tooltipText={intl.formatMessage({ id: 'statusbar.scamAlerts' })}
      >
        <div className="me-1 d-flex align-items-center justify-content-center remixui_statusbar_scamAlert" data-id="hTScamAlertButton" id="hTScamAlertSection" ref={refs.setReference} {...getReferenceProps()}>
          <span className="pe-2 far fa-exclamation-triangle text-white"></span>
          <span className="text-white font-semibold small">
            <FormattedMessage id="home.scamAlert" />
          </span>
        </div>
      </CustomTooltip>
    </>
  )
}
