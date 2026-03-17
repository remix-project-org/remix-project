import { ReadCommitResult } from "isomorphic-git";
import React from "react";
import { gitActionsContext } from "../../state/context";
import GitUIButton from "../buttons/gituibutton";
import { gitPluginContext } from "../gitui";
import { BranchDifferences } from "./branches/branchdifferences";
import { CommitDetails } from "./commits/commitdetails";
import { FormattedMessage } from "react-intl";

export const Commits = () => {
  const [hasNextPage, setHasNextPage] = React.useState(true)
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)

  const checkout = async (oid: string) => {
    try {
      actions.checkout({ ref: oid })
    } catch (e) {
      //
    }
  };

  const loadNextPage = async () => {
    await actions.fetch({
      remote: null,
      ref: context.currentBranch,
      relative: true,
      depth: 5,
      singleBranch: true,
      quiet: true
    })
    await actions.setStateGitLogCount(context.gitLogCount + 5)
  }

  const getRemote = () => {
    return context.upstream ? context.upstream : context.defaultRemote ? context.defaultRemote : null
  }

  const getCommitChanges = async (commit: ReadCommitResult) => {
    await actions.getCommitChanges(commit.oid, commit.commit.parent[0],null, getRemote())
  }

  const fetchIsDisabled = () => {
    return (!context.upstream)|| context.remotes.length === 0
  }

  return (
    <>
      {context.commits && context.commits.length ?
        <><BranchDifferences branch={context.currentBranch}></BranchDifferences><div>
          <div data-id={`commits-current-branch-${context.currentBranch && context.currentBranch.name}`} className="pt-1">
            {context.commits && context.commits.map((commit, index) => {
              return (
                <CommitDetails branch={context.currentBranch} getCommitChanges={getCommitChanges} key={index} checkout={checkout} commit={commit}></CommitDetails>
              );
            })}
          </div>
        </div>
        {hasNextPage && <GitUIButton data-id='load-more-commits' disabledCondition={fetchIsDisabled()} className="mb-1 ms-2 btn btn-sm" onClick={loadNextPage}><FormattedMessage id="gitui.loadMore" /></GitUIButton>}
        </>
        : <div className="text-muted"><FormattedMessage id="gitui.noCommits" /></div>}
    </>
  )
}
