import { CustomTooltip } from "@remix-ui/helper"
import React, { useContext, useEffect, useState } from "react"
import { FormattedMessage } from "react-intl"
import { TrackingContext } from '@remix-ide/tracking'
import { MatomoEvent, UdappEvent } from "@remix-api"
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { EnvironmentPlugin } from "apps/remix-ide/src/app/udapp/udappEnv"

export function SmartAccountPrompt ({ plugin }: { plugin: EnvironmentPlugin }) {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = UdappEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [displayAccount, setDisplayAccount] = useState<string | null>(null)

  useEffect(() => {
    const selectedProvider = plugin.getSelectedProvider()
    const displayAccount = plugin.getSelectedAccount()

    setSelectedProvider(selectedProvider)
    setDisplayAccount(displayAccount)
  }, [])

  return (
    <div className="w-100" data-id="createSmartAccountModal">
      <p className="mb-2">
        <FormattedMessage id="udapp.createSmartAccountDesc1" />
      </p>
      <p className="mb-3">
        <FormattedMessage id="udapp.createSmartAccountDesc2" />
      </p>
      <a
        href="https://docs.safe.global/advanced/smart-account-overview#safe-smart-account"
        target="_blank"
        rel="noreferrer noopener"
        onClick={() => trackMatomoEvent({ category: 'udapp', action: 'safeSmartAccount', name: 'learnMore', isClick: true })}
        className="mb-3 d-inline-block link-primary"
      >
          Learn more
      </a>
      <p className="mb-2">
        <FormattedMessage id="udapp.createSmartAccountDesc3" />
        <FormattedMessage id="udapp.createSmartAccountDesc4" />
      </p>
      { selectedProvider && selectedProvider.startsWith('injected') && (
        <div className="alert alert-warning d-flex align-items-center" role="alert">
          <i className="fas fa-exclamation-triangle me-2"></i>
          <div>
            <FormattedMessage id="udapp.createSmartAccountDesc5" />
          </div>
        </div>
      )}
      <label className="form-label text-uppercase text-muted small mb-1">
          Account
      </label>
      <CustomTooltip
        placement="top"
        tooltipClasses="text-wrap"
        tooltipId="createSmartAccountOwnerTooltip"
        tooltipText={'Owner address for Smart Account'}
      >
        <input
          type="text"
          className="form-control"
          value={displayAccount}
          disabled
          readOnly
        />
      </CustomTooltip>
    </div>
  )
}