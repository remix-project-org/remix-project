import { ExtendedRefs, ReferenceType } from '@floating-ui/react'
import React, { CSSProperties, useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { ScamAlert } from '../remixui-statusbar-panel'
import '../../css/statusbar.css'
import { TrackingContext } from '@remix-ide/tracking'
import { HomeTabEvent } from '@remix-api'

export interface ScamDetailsProps {
  refs: ExtendedRefs<ReferenceType>
  floatStyle: CSSProperties
  getFloatingProps: (userProps?: React.HTMLProps<HTMLElement> | undefined) => Record<string, unknown>
  scamAlerts: ScamAlert[]
}

export default function ScamDetails ({ refs, floatStyle, scamAlerts }: ScamDetailsProps) {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends HomeTabEvent = HomeTabEvent>(event: T) => baseTrackEvent?.<T>(event)

  return (
    <div
      ref={refs.setFloating}
      id='scamDetails'
      style={{
        position: 'absolute',
        bottom: '-3.4rem',
        left: '-2.5rem',
        height: 'fit-content',
        transform: 'translate(88.5px, -80px)',
        willChange: 'transform',
        boxShadow: "0 1px 7px var(--bs-secondary)"
      } }
      className="py-2 px-4 pb-0 mb-0 d-flex alert alert-warning border border-warning"
    >
      <span className="align-self-center ps-2 mt-1">
        <i style={{ fontSize: 'xxx-large', fontWeight: 'lighter' }} className="pe-2 far fa-exclamation-triangle"></i>
      </span>
      <div className="d-flex flex-column pe-2 py-2">
        {scamAlerts && scamAlerts.map((alert, index) => (
          <span className="ps-2 mt-1" key={`${alert.url}${index}`}>
            {alert.url.length < 1 ? <FormattedMessage id={`home.scamAlertText${index + 1}`} defaultMessage={alert.message} />
              : (<><FormattedMessage id={`home.scamAlertText${index + 1}`} defaultMessage={alert.message} /> :
                <a
                  className={`remixui_home_text text-decoration-none ps-1`}
                  onClick={() => {
                    index === 1 && trackMatomoEvent({ category: 'hometab', action: 'scamAlert', name: 'learnMore', isClick: true })
                    index === 2 && trackMatomoEvent({ category: 'hometab', action: 'scamAlert', name: 'safetyTips', isClick: true })
                  }}
                  target="__blank"
                  href={scamAlerts[index].url}
                >
                  <FormattedMessage id="home.here" defaultMessage={scamAlerts[index].message} />
                </a></>)}
          </span>
        ))}
      </div>
    </div>
  )
}
