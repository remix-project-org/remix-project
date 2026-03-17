// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { StatusBar } from 'apps/remix-ide/src/app/components/status-bar'
import { CustomTooltip } from '@remix-ui/helper'
import React, { useContext, useEffect, useState } from 'react'
import { appActionTypes, AppContext } from '@remix-ui/app'
import { FormattedMessage, useIntl } from 'react-intl'

interface AIStatusProps {
  plugin: StatusBar
  isAiActive: boolean
  setIsAiActive: (isAiActive: boolean) => void
  aiActive: () => Promise<any>
}

export default function AIStatus(props: AIStatusProps) {
  const [copilotActive, setCopilotActive] = useState(false)
  const appContext = useContext(AppContext)
  const intl = useIntl()

  useEffect(() => {
    const run = async () => {
      const aiActivate = await props.plugin.call('settings', 'get', 'settings/copilot/suggest/activate')
      setCopilotActive(aiActivate)
    }
    run()

  }, [])

  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Set a timeout to make UI message disappear after 3 seconds
    const timer = setTimeout(() => {
      setVisible(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [])

  useEffect(() => {
    const run = async () => {
      props.plugin.on('settings', 'copilotChoiceUpdated', async (isChecked) => {
        await props.plugin.isAIActive()
        setCopilotActive(isChecked)
      })
    }
    run()
  }, [props.plugin.isAiActive, props.isAiActive])

  return (
    <div>
      <CustomTooltip
        tooltipText={copilotActive
          ? intl.formatMessage({ id: 'statusbar.disableRemixAICopilot' })
          : intl.formatMessage({ id: 'statusbar.enableRemixAICopilot' })}
      >
        <span
          style={{ cursor: 'pointer' }}
          className={"small mx-1 bg-info border-0 text-white " + (copilotActive === false ? "semi-bold" : "")}
          onClick={async () => {
            await props.plugin.call('settings' as any, 'updateCopilotChoice', !copilotActive)
          }}
        >
          {copilotActive === false
            ? <FormattedMessage id="statusbar.remixAICopilotDisabled" />
            : <FormattedMessage id="statusbar.remixAICopilotEnabled" />}
        </span>
      </CustomTooltip>
      <div className="d-flex text-sm flex-row pe-2 text-white justify-content-center align-items-center">
        <style>{`
          button.aiButton:focus {
            outline: none;
            box-shadow: none;
          }
          button.aiButton:hover {
            border-color: var(--info)
          }
        `}</style>
        { !appContext.appState.showPopupPanel && <div className='d-flex flex-column' style={{
          position: 'absolute',
          bottom: '1.5rem',
          right: '0.5rem',
          color: 'var(--custom-ai-color)',
          alignItems: 'self-end',
        }}>
          {/* { visible &&
            <span className='p-1 text-info alert alert-secondary' style={{
              boxShadow: "0 1px 7px var(--bs-secondary)",
              zIndex: '200',
              marginRight: '1.8rem',
              marginBottom: '-7px'
            }}>
                👋 I'm here to help you!
            </span>
          } */}
          {/* <button
            style={{
              backgroundColor: 'var(--brand-dark-blue)',
              height: '3rem',
              width: '3rem',
              borderRadius: '50%',
              color: 'var(--ai)',
              boxShadow: "0 1px 7px var(--bs-secondary)"
            }}
            data-id="aiStatusButton"
            className='aiButton d-flex align-items-center h3 p-1'
            onClick={async () => {
              appContext.appStateDispatch({
                type: appActionTypes.setShowPopupPanel,
                payload: !appContext.appState.showPopupPanel
              })
            }}
          >
            <img className="align-self-start" src="assets/img/aiLogoHead.webp" alt="" style={{ height: "2rem" }}></img>
          </button> */}
        </div>
        }
      </div>
    </div>
  )
}
