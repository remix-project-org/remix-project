import { faArrowDown, faArrowUp, faArrowsUpDown, faArrowRotateRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { CustomTooltip } from '@remix-ui/helper'
import React, { useEffect, useState, useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { gitActionsContext } from '../../state/context'
import { branch, remote, GitEvent, MatomoEvent } from '@remix-api'
import { defaultGitState, gitMatomoEventTypes, gitUIPanels } from '../../types'
import { gitPluginContext } from '../gitui'
import GitUIButton from './gituibutton'
import { syncStateContext } from './sourceControlBase'
import { TrackingContext } from '@remix-ide/tracking'

export interface SourceControlButtonsProps {
  panel: string
}

export const SourceControlButtons = (props: SourceControlButtonsProps) => {
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)
  const syncState = React.useContext(syncStateContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const [branch, setBranch] = useState<branch>(syncState.branch)
  const [remote, setRemote] = useState<remote>(syncState.remote)

  // Component-specific tracker with default GitEvent type
  const trackMatomoEvent = <T extends MatomoEvent = GitEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const getRemote = () => {
    return remote ? remote : context.upstream ? context.upstream : context.defaultRemote ? context.defaultRemote : null
  }

  const getRemoteName = () => {
    return getRemote() ? getRemote().name : ''
  }

  const pull = async () => {
    await actions.pull({
      remote: getRemote(),
      ref: branch ? branch : context.currentBranch,
    })
  }

  const push = async () => {
    await actions.push({
      remote: getRemote(),
      ref: branch ? branch : context.currentBranch,
    })
    await actions.fetch({
      remote: getRemote(),
      ref: branch ? branch : context.currentBranch,
      relative: false,
      depth: 1,
      singleBranch: true,
    })
  }

  const sync = async () => {
    await pull()
    await push()
  }

  const refresh = async () => {
    trackMatomoEvent({
      category: 'git',
      action: 'REFRESH',
      name: 'SOURCE_CONTROL_PANEL',
      isClick: true
    })
    await actions.getFileStatusMatrix(null)
    if (props.panel === gitUIPanels.BRANCHES) {
      await actions.getBranches()
    }
    if (props.panel === gitUIPanels.COMMITS) {
      await actions.gitlog(defaultGitState.gitLogCount)
    }
    actions.setStateGitLogCount(defaultGitState.gitLogCount)
  }

  const buttonsDisabled = () => {
    return !context.upstream || context.remotes.length === 0
  }

  const getTooltipText = (id: string) => {
    if (buttonsDisabled()) return <FormattedMessage id="git.noremote" />
    return (
      <>
        <FormattedMessage id={id} /> {getRemoteName()}
      </>
    )
  }

  return (
    <span className="d-flex justify-content-end align-items-center">
      {props.panel === gitUIPanels.COMMITS || props.panel === gitUIPanels.SOURCECONTROL ? (
        <>
          <CustomTooltip tooltipText={getTooltipText('git.pull')}>
            <GitUIButton data-id="sourcecontrol-button-pull" disabledCondition={buttonsDisabled()} onClick={pull} className="btn btn-sm ps-0 pe-2">
              <div className="d-flex align-items-baseline">
                {syncState.commitsBehind.length ? <div className="badge rounded-pill ps-0">{syncState.commitsBehind.length}</div> : null}
                <FontAwesomeIcon icon={faArrowDown} className="" />
              </div>
            </GitUIButton>
          </CustomTooltip>
          <CustomTooltip tooltipText={getTooltipText('git.push')}>
            <GitUIButton data-id="sourcecontrol-button-push" disabledCondition={buttonsDisabled()} onClick={push} className="btn btn-sm ps-0 pe-2">
              <div className="d-flex align-items-baseline">
                {syncState.commitsAhead.length ? <div className="badge rounded-pill ps-0">{syncState.commitsAhead.length}</div> : null}
                <FontAwesomeIcon icon={faArrowUp} className="" />
              </div>
            </GitUIButton>
          </CustomTooltip>
          <CustomTooltip tooltipText={getTooltipText('git.sync')}>
            <GitUIButton data-id="sourcecontrol-button-sync" disabledCondition={buttonsDisabled()} onClick={sync} className="btn btn-sm  ps-0 pe-2">
              <FontAwesomeIcon icon={faArrowsUpDown} className="" />
            </GitUIButton>
          </CustomTooltip>
        </>
      ) : null}
      <CustomTooltip tooltipText={<FormattedMessage id="git.refresh" />}>
        <GitUIButton onClick={refresh} className="btn btn-sm">
          <FontAwesomeIcon icon={faArrowRotateRight} className="" />
        </GitUIButton>
      </CustomTooltip>
    </span>
  )
}
