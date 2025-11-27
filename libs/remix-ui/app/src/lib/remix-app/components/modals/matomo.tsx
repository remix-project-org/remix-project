import React, { useContext, useEffect, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { AppContext } from '../../context/context'
import { useDialogDispatchers } from '../../context/provider'
import { TrackingContext } from '@remix-ide/tracking'
import { LandingPageEvent } from '@remix-api'

interface MatomoDialogProps {
  managePreferencesFn: () => void
  hide: boolean
}

const MatomoDialog = (props: MatomoDialogProps) => {
  const { settings, showMatomo } = useContext(AppContext)
  const { trackMatomoEvent } = useContext(TrackingContext)
  const { modal } = useDialogDispatchers()
  const [visible, setVisible] = useState<boolean>(props.hide)

  const message = () => {
    return (
      <>
        <p>
          <FormattedMessage
            id="remixApp.matomoText1Old"
            values={{
              a: (chunks) => (
                <a href="https://remix-ide.readthedocs.io/en/latest/ai.html" target="_blank" rel="noreferrer">
                  {chunks}
                </a>
              ),
            }}
          /><br/>
          <FormattedMessage
            id="remixApp.matomoText2"
            values={{
              a: (chunks) => (
                <a href="https://matomo.org" target="_blank" rel="noreferrer">
                  {chunks}
                </a>
              ),
            }}
          />
        </p>
      </>
    )
  }

  useEffect(() => {
    if (visible && showMatomo) {
      modal({
        id: 'matomoModal',
        title: <FormattedMessage id="remixApp.matomoTitle" />,
        message: message(),
        okLabel: <FormattedMessage id="remixApp.accept" />,
        okFn: handleAcceptAllClick,
        cancelLabel: <FormattedMessage id="remixApp.managePreferences" />,
        cancelFn: handleManagePreferencesClick,
        showCancelIcon: true,
        preventBlur: true
      })
    }
  }, [visible])

  const handleAcceptAllClick = async () => {
    // Consent is managed by cookie consent system in settings
    settings.updateMatomoPerfAnalyticsChoice(true) // Enable Matomo Performance analytics
    settings.updateCopilotChoice(true) // Enable RemixAI copilot
    trackMatomoEvent?.({ category: 'landingPage', action: 'MatomoAIModal', name: 'AcceptClicked' })
    setVisible(false)
  }

  const handleManagePreferencesClick = async () => {
    trackMatomoEvent?.({ category: 'landingPage', action: 'MatomoAIModal', name: 'ManagePreferencesClicked' })
    setVisible(false)
    props.managePreferencesFn()
  }

  return <></>
}

export default MatomoDialog
