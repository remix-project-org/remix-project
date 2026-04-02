import React, { useEffect, useState } from 'react'
import { gitActionsContext, pluginActionsContext } from '../state/context'
import { ReadCommitResult } from "isomorphic-git"
import { gitPluginContext } from './gitui'
export const BranchHeader = () => {

  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)
  const pluginActions = React.useContext(pluginActionsContext)
  const [changed, setChanged] = useState(false)
  const [isDetached, setIsDetached] = useState(false)
  const [latestCommit, setLatestCommit] = useState<ReadCommitResult>(null)

  useEffect(() => {
    if (context.currentBranch) {
      actions.getBranchDifferences(context.currentBranch, null, context)
    }
    if (!context.currentBranch || (context.currentBranch && context.currentBranch.name === '')) {
      if (context.currentHead === '') {
        setIsDetached(false)
      } else {
        setIsDetached(true)
      }
    } else {
      setIsDetached(false)
    }
    setLatestCommit(null)
    if (context.currentHead !== '') {
      if (context.commits && context.commits.length > 0) {
        const commit = context.commits.find(commit => commit.oid === context.currentHead)
        if (commit) {
          setLatestCommit(commit)
        }
      }
    }
  }, [context.currentBranch, context.commits, context.branches, context.remotes, context.currentHead, context.defaultRemote])

  useEffect(() => {
    if (context.fileStatusResult) {
      const total = context.allchangesnotstaged.length
      const badges = total + context.staged.length
      setChanged((context.deleted.length > 0 || context.staged.length > 0 || context.untracked.length > 0 || context.modified.length > 0))
    }
  }, [context.fileStatusResult, context.modified, context.allchangesnotstaged, context.untracked, context.deleted])

  const getName = () => {
    const url = context.currentBranch?.remote?.url
    if (!url) return
    const regex = /https:\/\/github\.com\/[^/]+\/([^/]+)(?:\.git)?/;
    const match = url.match(regex)
    return match ? match[1] : null
  }

  const showDetachedWarningText = async () => {
    await pluginActions.showAlert({
      message: `You are in 'detached HEAD' state. This means you are not on a branch because you checkout a tag or a specific commit. If you want to commit changes, you will need to create a new branch.`,
      title: 'Warning'
    })
  }

  const Heading = () => {
    return (
      <div className="container mx-auto px-4-fluid px-0">
        <div className="flex flex-col pt-1 mb-1">
          <div className="flex flex-col justify-start items-start w-full">
            {getName() ? (
              <span className={`truncate overflow-hidden whitespace-nowrap w-full`}>
                {getName() ?? ''}
                {context.currentBranch && context.currentBranch.remote && context.currentBranch.remote.name ? ` on ${context.currentBranch.remote.name}` : ''}
              </span>
            ) : null
            }
            {context.currentBranch && context.currentBranch.name ?
              <span className="text-secondary truncate overflow-hidden whitespace-nowrap w-full">
                <i className="fa fa-code-branch mr-1"></i>{context.currentBranch && context.currentBranch.name}{changed?'*':''}
              </span> : null}
            {(latestCommit && latestCommit.commit && latestCommit.commit.message) ?
              <span className="text-secondary truncate overflow-hidden whitespace-nowrap w-full">
                {latestCommit ?
                  latestCommit.commit && latestCommit.commit.message ? `"${latestCommit.commit.message}"` : '' : null}
              </span>
              : null}
            {isDetached ?
              <span className="text-secondary truncate overflow-hidden whitespace-nowrap w-full">
                {isDetached ?
                  <>You are in a detached state<i onClick={showDetachedWarningText} className="btn fa fa-info-circle mr-1"></i></> : null}
              </span>
              : null}
            {context.storage.enabled ?
              <span className="text-secondary text-sm truncate overflow-hidden whitespace-nowrap w-full">
                {context.storage.used} MB used
                ({context.storage.percentUsed} %)
              </span>
              : null}
          </div>
        </div>
      </div>
    )
  }

  return (<>
    <div className='text-sm w-full'>
      <Heading />
    </div>
    <hr></hr>
  </>)
}
