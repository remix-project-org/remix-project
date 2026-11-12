import React from 'react'
import { FormattedMessage } from 'react-intl'
import { ToggleSwitch } from '@remix-ui/toggle'
import { CHECK_STEPS, StepToggles } from '../types'
import { PreDeployChecksActions } from './types'

interface CheckListProps {
  toggles: StepToggles
  disabled: boolean
  plugin: PreDeployChecksActions
}

/** The checks to run, one switch per check. Shared by the intro card and the Settings page. */
export function CheckList ({ toggles, disabled, plugin }: CheckListProps) {
  return (
    <div className="pdc-check-list">
      {CHECK_STEPS.map((id) => {
        // compile always runs: shown so the list matches what runs, but locked on
        const locked = id === 'compile'
        const on = locked || toggles[id]
        return (
          <label className={`pdc-toggle ${on ? '' : 'pdc-toggle-off'} ${locked ? 'pdc-toggle-locked' : ''}`} key={id} htmlFor={`preDeployChecks-toggle-${id}`}>
            <span>
              <span className="pdc-toggle-name"><FormattedMessage id={`preDeployChecks.step.${id}`} /></span>
              <small><FormattedMessage id={`preDeployChecks.stepHint.${id}`} /></small>
            </span>
            <ToggleSwitch
              id={`preDeployChecks-toggle-${id}`}
              isOn={on}
              disabled={locked || disabled}
              onClick={() => plugin.setToggle(id, !toggles[id])}
            />
          </label>
        )
      })}
    </div>
  )
}
