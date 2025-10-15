import React, { useContext, useEffect, useRef, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { useDialogDispatchers } from '../../context/provider'
import { ToggleSwitch } from '@remix-ui/toggle'
import { AppContext } from '../../context/context'
import { TrackingContext } from '@remix-ide/tracking'
import { LandingPageEvent } from '@remix-api'

const ManagePreferencesSwitcher = (prop: {
  setParentState: (state: any) => void
}) => {
  const [remixAISwitch, setRemixAISwitch] = useState(true)
  const [matPerfSwitch, setMatPerfSwitch] = useState(true)

  useEffect(() => {
    prop.setParentState({
      remixAISwitch,
      matPerfSwitch
    })
  }, [remixAISwitch, matPerfSwitch])

  return (
    <>
      <div data-id="matomoAnonAnalytics" className='justify-content-between d-flex'>
        <div className='mt-2'>
          <h6 className='text-secondary'><FormattedMessage id="remixApp.mpOp1Title" /></h6>
          <p className='form-check-label text-secondary'><FormattedMessage id="remixApp.mpOp1Details" /></p>
        </div>
        <div>
          <ToggleSwitch
            id = "matomoAnonAnalyticsToggle"
            size = "2xl"
            tooltipTextId = "remixApp.mpOp1Tooltip"
            disabled = {true}
          ></ToggleSwitch>
        </div>
      </div>
      <div data-id="matomoPerfAnalytics" className='justify-content-between d-flex'>
        <div className='mt-3'>
          <h6><FormattedMessage id="remixApp.mpOp2Title" /></h6>
          <p className='form-check-label'><FormattedMessage id="remixApp.mpOp2Details" /></p>
          <p className='mt-1'><FormattedMessage
            id="remixApp.mpOp2Link"
            values={{
              a: (chunks) => (
                <a className="text-primary" href="https://matomo.org" target="_blank" rel="noreferrer">
                  {chunks}
                </a>
              ),
            }}
          /></p>
        </div>
        <div>
          <ToggleSwitch
            id = "matomoPerfAnalyticsToggle"
            size = "2xl"
            isOn = {matPerfSwitch}
            onClick = {() => setMatPerfSwitch(!matPerfSwitch)}
          ></ToggleSwitch>
        </div>
      </div>
      <div data-id="remixAI" className='justify-content-between d-flex'>
        <div className='mt-2'>
          <h6><FormattedMessage id="remixApp.mpOp3Title" /></h6>
          <p className='form-check-label'><FormattedMessage id="remixApp.mpOp3Details" /></p>
          <p className='mt-1'><FormattedMessage
            id="remixApp.mpOp3Link"
            values={{
              a: (chunks) => (
                <a className="text-primary" href="https://remix-ide.readthedocs.io/en/latest/ai.html" target="_blank" rel="noreferrer">
                  {chunks}
                </a>
              ),
            }}
          /></p>
        </div>
        <div>
          <ToggleSwitch
            id = "remixAIToggle"
            size = "2xl"
            isOn = {remixAISwitch}
            onClick = {() => setRemixAISwitch(!remixAISwitch)}
          ></ToggleSwitch>
        </div>
      </div>
    </>
  )
}

const ManagePreferencesDialog = (props) => {
  const { modal } = useDialogDispatchers()
  const { settings } = useContext(AppContext)
  const { trackMatomoEvent } = useContext(TrackingContext)
  const [visible, setVisible] = useState<boolean>(true)
  const switcherState = useRef<Record<string, any>>(null)

  useEffect(() => {
    if (visible) {
      modal({
        id: 'managePreferencesModal',
        title: <FormattedMessage id="remixApp.managePreferences" />,
        message: <ManagePreferencesSwitcher setParentState={(state)=>{
          switcherState.current = state
        }} />,
        okLabel: <FormattedMessage id="remixApp.savePreferences" />,
        okFn: savePreferences,
        showCancelIcon: true,
        preventBlur: true
      })
    }
  }, [visible])

  const savePreferences = async () => {
    // Consent is managed by cookie consent system in settings
    settings.updateMatomoPerfAnalyticsChoice(switcherState.current.matPerfSwitch) // Enable/Disable Matomo Performance analytics
    settings.updateCopilotChoice(switcherState.current.remixAISwitch) // Enable/Disable RemixAI copilot
    trackMatomoEvent?.({ category: 'landingPage', action: 'MatomoAIModal', name: `MatomoPerfStatus: ${switcherState.current.matPerfSwitch}` })
    trackMatomoEvent?.({ category: 'landingPage', action: 'MatomoAIModal', name: `AICopilotStatus: ${switcherState.current.remixAISwitch}` })
    setVisible(false)
  }

  return <></>
}

export default ManagePreferencesDialog
