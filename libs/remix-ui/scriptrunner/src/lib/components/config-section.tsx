import React, { useContext, useEffect, useRef, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { ProjectConfiguration } from '../../types';
import { faCheck, faTimes, faCaretDown, faCaretUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { CustomTooltip } from '@remix-ui/helper';
import { TrackingContext } from '@remix-ide/tracking';
import { MatomoEvent, ScriptRunnerPluginEvent } from '@remix-api';

export interface ConfigSectionProps {
  activeKey: string
  setActiveKey: (key: string) => void
  config: ProjectConfiguration
  key: number
  loadScriptRunner: (config: ProjectConfiguration) => void
  activeConfig: ProjectConfiguration
}

export default function ConfigSection(props: ConfigSectionProps) {
  const [isVisible, setIsVisible] = useState(true)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = ScriptRunnerPluginEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const handleAnimationEnd = () => {
    setIsVisible(false);
  }

  const SectionHeader = () => {
    return (
      <section className="text-nowrap me-1">
        <div className="form-check">
          <input
            className="form-check-input"
            type="radio"
            name="scriptrunner-config-radio"
            value={props.config.name}
            id={props.config.title || props.config.name}
            onChange={() => {
              props.loadScriptRunner(props.config)
              if (!props.config.errorStatus) {
                props.setActiveKey(props.config.name)
              }
              trackMatomoEvent({ category: 'scriptRunnerPlugin', action: 'loadScriptRunnerConfig', name: props.config.name, isClick: true })
            }}
            checked={(props.activeConfig && props.activeConfig.name === props.config.name)}
          />
          <label className="pointer form-check-label" htmlFor={`${props.config.title || props.config.name}`}
            data-id={`sr-${(props.activeConfig && props.activeConfig.name === props.config.name)?'loaded':'notloaded'}-${props.config.name}`}>
            <div className="ps-2">{props.config.title || props.config.name}</div>
          </label>
        </div>
      </section>
    )
  }

  const Dependencies = () => {
    const [showAll, setShowAll] = useState(false);
    const visibleDeps = showAll ? props.config.dependencies : props.config.dependencies.slice(0, 4);
    const hasMore = props.config.dependencies.length > 4;

    return (
      <>
        {visibleDeps.map((dep, depIndex) => (
          <li className="p-1 text-secondary" data-id={`dependency-${dep.name}-${dep.version}`} key={depIndex}>
            {dep.name} (v{dep.version})
          </li>
        ))}
        {hasMore && (
          <li>
            <a
              href="#"
              className="text-primary text-decoration-none"
              onClick={(e) => {
                e.preventDefault();
                setShowAll(!showAll);
              }}
            >
              {showAll ? 'Show less' : 'Show more'}
              <FontAwesomeIcon icon={showAll ? faCaretUp : faCaretDown} className="ms-1" />
            </a>
          </li>
        )}
      </>
    )
  }

  return (
    <section className="mb-2">
      <section className="d-flex flex-row ">
        <SectionHeader />
        <label htmlFor={`${props.config.title || props.config.name}`} className="pointer w-100 d-flex flex-row mb-0">
          <div>
            {!props.config.isLoading && !props.config.errorStatus && !props.config.error &&
            <div onClick={() => props.loadScriptRunner(props.config)} className="pointer px-2 pb-1 mb-0 pb-0">
              { props.activeConfig && props.activeConfig.name === props.config.name &&
                <div className="d-flex flex-row mt-1">
                  <FontAwesomeIcon data-id={`sr-loaded-${props.config.name}`} className="text-success ms-3" icon={faCheck}></FontAwesomeIcon>
                  {isVisible && <span onAnimationEnd={handleAnimationEnd} className="text-success px-3 mb-0 pb-0" style={{ animation: 'fadeOut 5s forwards', animationFillMode: 'forwards' }}>Config loaded</span>}
                </div>
              }
            </div>
            }
          </div>
          {props.config.isLoading && <div className="d-flex flex-row mx-4">
            <div className="d-flex flex-row pb-1 align-items-center justify-content-center">
              <i className="fas fa-spinner fa-spin"></i><span className='ps-3'>Loading config</span>
            </div>
          </div>}
          <div className="ms-4 d-flex" id="errorSection">
            {!props.config.isLoading && props.config.errorStatus && props.config.error &&
              <div
                onClick={() => {
                  props.loadScriptRunner(props.config)
                  trackMatomoEvent({ category: 'scriptRunnerPlugin', action: 'error_reloadScriptRunnerConfig', name: props.config.name, isClick: true })
                }}
                className="pointer text-danger d-flex flex-row"
              >
                <CustomTooltip tooltipText={props.config.error}>
                  <FontAwesomeIcon className="mt-1 pe-4" data-id={`sr-error-${props.config.name}`} icon={faTimes}></FontAwesomeIcon>
                </CustomTooltip>
                <span className="pe-2 mt-1 text-nowrap text-danger fw-bold">Loading error.</span>
                <span className="text-danger mt-1 ">We are not able to load your requested configuration for now, please try again later.</span>
              </div>
            }
          </div>
        </label>
      </section>

      <section className="d-flex flex-column w-100">
        <div className="mt-2 mb-4 bg-dark p-3 ">
          <p className="text-dark font-monospace">{props.config.description}</p>
          <p className="text-dark">Dependencies</p>
          <ul className="list-unstyled m-0">
            <Dependencies />
          </ul>
        </div>
      </section>
    </section>
  )
}
