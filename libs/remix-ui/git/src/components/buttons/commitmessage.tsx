import React, { useEffect } from "react"
import { useState } from "react"
import { gitActionsContext } from "../../state/context"
import { gitPluginContext } from "../gitui"
import { faArrowDown, faArrowUp, faCheck, faCloudArrowUp, faSync } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { syncStateContext } from "./sourceControlBase";
import { FormattedMessage, useIntl } from "react-intl";

export const CommitMessage = () => {
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)
  const syncState = React.useContext(syncStateContext)
  const intl = useIntl()

  const [message, setMessage] = useState({ value: '' })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage({ value: e.currentTarget.value })
  }

  const commit = async () => {
    if (context.staged.length === 0 && context.allchangesnotstaged.length == 0) return
    if (context.staged.length === 0)
      await actions.addall(context.allchangesnotstaged)
    await actions.commit(message.value)
    setMessage({ value: '' })
  }

  const getRemote = () => {
    return context.upstream ? context.upstream : context.defaultRemote ? context.defaultRemote : null
  }

  const sync = async () => {
    await actions.pull({
      remote: getRemote(),
      ref: context.currentBranch
    })
    await actions.push({
      remote: getRemote(),
      ref: context.currentBranch
    })
    await actions.pull({
      remote: getRemote(),
      ref: context.currentBranch
    })
  }

  const commitNotAllowed = () => {
    return context.canCommit === false || message.value === "" || (context.staged.length === 0 && context.allchangesnotstaged.length == 0)
  }

  const commitMessagePlaceholder = () => {
    if (context.currentBranch === undefined || context.currentBranch.name === "")
      return intl.formatMessage({ id: 'git.commit' })
    return intl.formatMessage({ id: 'git.commit' }) + ` ( commit on ${context.currentBranch.name} )`
  }

  const syncEnabled = () => {
    return syncState.commitsAhead.length > 0 || syncState.commitsBehind.length > 0
  }

  const upDownArrows = () => {
    return (
      <>
        {syncState.commitsBehind && syncState.commitsBehind.length ? <>{syncState.commitsBehind.length}<FontAwesomeIcon icon={faArrowDown} className="ms-1" /></> : null}
        {syncState.commitsAhead && syncState.commitsAhead.length ? <>{syncState.commitsAhead.length}<FontAwesomeIcon icon={faArrowUp} className="ms-1" /></> : null}
      </>
    )
  }

  const publishEnabled = () => {
    const remoteEquivalentBranch = context.branches.find((b) => b.name === context.currentBranch.name && b.remote)
    return remoteEquivalentBranch === undefined && getRemote() !== null
  }

  const publishBranch = async () => {
    if (context.currentBranch === undefined || context.currentBranch.name === "")
      return
    await actions.push({
      remote: getRemote(),
      ref: context.currentBranch
    })
    await actions.fetch({
      remote: getRemote(),
      ref: context.currentBranch,
      singleBranch: false,
      relative: true
    })

  }

  const messageEnabled = () => {
    return context.canCommit && (context.allchangesnotstaged.length > 0 || context.staged.length > 0)
  }

  const showCommitButton = () => {
    // Always show commit button unless publish button is showing
    return !showPublishButton()
  }

  const showSyncButton = () => {
    return syncEnabled()
  }

  const showPublishButton = () => {
    // Show publish button when branch doesn't exist on remote and we're not in the middle of committing
    const notCommitting = message.value === ""
    return notCommitting && publishEnabled() && !syncEnabled()
  }

  return (
    <>
      <div className="mb-3 pt-3">
        <input placeholder={commitMessagePlaceholder()} data-id='commitMessage' disabled={!messageEnabled()} className="form-control" type="text" onChange={handleChange} value={message.value} />
      </div>
      <button data-id='commitButton' className={`btn btn-primary w-100 ${showCommitButton() ? '' : 'd-none'} ${showSyncButton() ? 'mb-1' : ''}`} disabled={commitNotAllowed()} onClick={async () => await commit()} >
        <FontAwesomeIcon icon={faCheck} className="me-1" />
        <FormattedMessage id="gitui.commitButton" />
      </button>
      <button data-id='syncButton' className={`btn btn-primary w-100 ${showSyncButton() ? '' : 'd-none'}`} disabled={!syncEnabled()} onClick={async () => await sync()} >
        <FontAwesomeIcon icon={faSync} className="me-1" aria-hidden="true" />
        <FormattedMessage id="gitui.syncChanges" /> {upDownArrows()}
      </button>
      <button data-id='publishBranchButton' className={`btn btn-primary w-100 ${showPublishButton() ? '' : 'd-none'}`} onClick={async () => await publishBranch()} >
        <FontAwesomeIcon icon={faCloudArrowUp} className="me-1" aria-hidden="true" />
        <FormattedMessage id="gitui.publishBranch" />
      </button>
      <hr></hr>
    </>
  );
}
