import React, { useEffect, useState, useContext } from "react";
import { gitActionsContext } from "../../../state/context";
import { gitPluginContext } from "../../gitui";
import { selectStyles, selectTheme } from "../../../types/styles";
import Select, { Options, OptionsOrGroups } from 'react-select'
import GitUIButton from "../../buttons/gituibutton";
import { remote, GitEvent, MatomoEvent } from "@remix-api";
import { gitMatomoEventTypes } from "../../../types";
import { relative } from "path";
import { TrackingContext } from "@remix-ide/tracking";

export const PushPull = () => {
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const [remoteBranch, setRemoteBranch] = useState('')
  const [localBranch, setLocalBranch] = useState('')
  const [localBranchOptions, setLocalBranchOptions] = useState<any>([]);
  const [remoteBranchOptions, setRemoteBranchOptions] = useState<any>([]);
  const [localRemotesOptions, setLocalRemotesOptions] = useState<any>([]);
  const [disabled, setDisabled] = useState(false)
  const [force, setForce] = useState(false)

  // Component-specific tracker with default GitEvent type
  const trackMatomoEvent = <T extends MatomoEvent = GitEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  useEffect(() => {
    setRemoteBranch(context.currentBranch.name)
    setLocalBranch(context.currentBranch.name)

    const currentUpstreamIsInRemotes = context.upstream && context.remotes.find(r => r.name === context.upstream.name && r.url === context.upstream.url)
    if (!context.upstream || !currentUpstreamIsInRemotes) {
      if (context.currentBranch && context.currentBranch.remote && context.currentBranch.remote.name) {
        actions.setUpstreamRemote(context.currentBranch.remote)
        setDisabled(false)
      } else {
        if (context.remotes && context.remotes.length > 0) {
          actions.setUpstreamRemote(context.remotes[0])
          setDisabled(false)
        } else {
          actions.setUpstreamRemote(null)
          setDisabled(true)
        }
      }
    }
  }, [context.currentBranch, context.remotes, context.branches])

  useEffect(() => {
    if (context.defaultRemote && context.remotes.find(r => r.name === context.defaultRemote.name && r.url === context.defaultRemote.url)) {
      actions.setUpstreamRemote(context.defaultRemote)
    }
  },[context.defaultRemote])

  const onRemoteBranchChange = async (value: string) => {
    trackMatomoEvent({
      category: 'git',
      action: 'SET_REMOTE_IN_COMMANDS',
      name: 'SELECT_REMOTE_BRANCH',
      isClick: true
    })
    setRemoteBranch(value)
  }

  const onLocalBranchChange = async (value: any) => {
    trackMatomoEvent({
      category: 'git',
      action: 'SET_LOCAL_BRANCH_IN_COMMANDS',
      name: 'SELECT_LOCAL_BRANCH',
      isClick: true
    })
    setLocalBranch(value)
  }

  const onRemoteChange = (value: string) => {
    const remote: remote = context.remotes.find(r => r.name === value)
    if (remote) {
      actions.setUpstreamRemote(remote)
      actions.setDefaultRemote(remote)
    }
  }

  const onForceChange = (event: any) => {
    const target = event.target;
    const value = target.checked;
    setForce(value)
  }

  const push = async () => {
    await actions.push({
      remote: context.upstream,
      ref: {
        name: localBranch,
        remote: null
      },
      remoteRef: {
        name: remoteBranch,
        remote: null
      },
      force: force
    })
    await actions.fetch({
      remote: context.upstream,
      ref: {
        name: localBranch,
        remote: null
      },
      remoteRef: {
        name: remoteBranch,
        remote: null
      },
      depth: 1,
      relative: true,
      singleBranch: true
    })
  }

  const pull = async () => {
    await actions.pull({
      remote: context.upstream,
      ref: {
        name: localBranch,
        remote: null
      },
      remoteRef: {
        name: remoteBranch,
        remote: null
      },
    })
  }

  useEffect(() => {

    const localBranches = context.branches && context.branches.length > 0 && context.branches
      .filter(branch => !branch.remote)
      .map(repo => {
        return { value: repo.name, label: repo.name }
      })
    setLocalBranchOptions(localBranches)

    if (!context.upstream){
      setRemoteBranchOptions([])
      return
    }
    const remoteBranches = context.branches && context.branches.length > 0 && context.branches
      .filter(branch => branch.remote && branch.remote.name === context.upstream.name)
      .filter(branch => branch.name !== 'HEAD')
      .map(repo => {
        return { value: repo.name, label: repo.name }
      }
      )
    setRemoteBranchOptions(remoteBranches)

  }, [context.branches, context.upstream])

  useEffect(() => {

    // map context.repositories to options
    const options = context.remotes && context.remotes.length > 0 && context.remotes
      .map(repo => {
        return { value: repo.name, label: repo.name }
      })
    setLocalRemotesOptions(options)

  }, [context.remotes])

  const pushPullIsDisabled = () => {
    return localBranch === '' || remoteBranch === '' || !context.upstream || context.remotes.length === 0
  }

  return (
    <>
      {disabled? <div data-id='disabled' className='text-sm w-100 alert alert-warning mt-1'>
        You cannot push or pull because you haven't connected to or selected a remote.
      </div>: null}
      <div className="btn-group w-100 mt-2" role="group">

        <GitUIButton data-id='sourcecontrol-pull' disabledCondition={pushPullIsDisabled()} type="button" onClick={async () => pull()} className="btn btn-primary me-1">Pull</GitUIButton>
        <GitUIButton data-id='sourcecontrol-push' disabledCondition={pushPullIsDisabled()} type="button" onClick={async () => push()} className="btn btn-primary">Push</GitUIButton>
      </div>

      <label className="pt-3 text-uppercase">Local Branch</label>
      <Select
        id='commands-local-branch-select'
        options={localBranchOptions}
        isDisabled={context.branches.length === 0}
        onChange={(e: any) => e && onLocalBranchChange(e.value)}
        theme={selectTheme}
        styles={selectStyles}
        isClearable={true}
        value={{ value: localBranch, label: localBranch }}
        placeholder="Type to search for a branch..."
      />

      <label className="pt-3 text-uppercase">Remote Branch</label>
      <Select
        id='commands-remote-branch-select'
        options={remoteBranchOptions}
        isDisabled={context.branches.length === 0}
        onChange={(e: any) => e && onRemoteBranchChange(e.value)}
        theme={selectTheme}
        styles={selectStyles}
        isClearable={true}
        value={{ value: remoteBranch, label: remoteBranch }}
        placeholder="Type to search for a branch..."
      />

      <label className="pt-3 text-uppercase">Remote</label>
      <Select
        id='commands-remote-origin-select'
        options={localRemotesOptions}
        isDisabled={context.remotes.length === 0}
        onChange={(e: any) => e && onRemoteChange(e.value)}
        theme={selectTheme}
        styles={selectStyles}
        isClearable={true}
        value={{ value: context.upstream && context.upstream.name, label: context.upstream && context.upstream.name }}
        placeholder="Type to search for a branch..."
      />

      <div className="pt-3 d-flex align-items-center remixui_compilerConfig form-check">
        <input checked={force} onChange={e => onForceChange(e)} className="form-check-input" type="checkbox" data-id="compilerContainerAutoCompile" id="forcepush" title="Force Push" />
        <label className="form-check-label ms-1" htmlFor="forcepush">Force push</label>
      </div>

    </>)
}
