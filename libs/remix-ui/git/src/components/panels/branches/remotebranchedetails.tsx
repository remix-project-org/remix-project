import { ReadCommitResult } from "isomorphic-git"
import React, { useEffect, useState, useContext } from "react";
import { Accordion } from "react-bootstrap";
import { CommitDetailsNavigation } from "../../navigation/commitdetails";
import { gitActionsContext } from "../../../state/context";
import { gitPluginContext } from "../../gitui";
import { branch, GitEvent, MatomoEvent } from "@remix-api";
import { gitMatomoEventTypes } from "../../../types";
import { BrancheDetailsNavigation } from "../../navigation/branchedetails";
import { CommitDetailsItems } from "../commits/commitdetailsitem";
import { CommitDetails } from "../commits/commitdetails";
import GitUIButton from "../../buttons/gituibutton";
import { TrackingContext } from "@remix-ide/tracking";

export interface BrancheDetailsProps {
  branch: branch;
  allowCheckout: boolean
}

export const RemoteBranchDetails = (props: BrancheDetailsProps) => {
  const { branch, allowCheckout } = props;
  const actions = React.useContext(gitActionsContext)
  const context = React.useContext(gitPluginContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const [activePanel, setActivePanel] = useState<string>("");
  const [hasNextPage, setHasNextPage] = useState<boolean>(false)
  const [lastPageNumber, setLastPageNumber] = useState<number>(0)

  // Component-specific tracker with default GitEvent type
  const trackMatomoEvent = <T extends MatomoEvent = GitEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  useEffect(() => {
    if (activePanel === "0") {

      if (lastPageNumber === 0)
        actions.getBranchCommits(branch, 1)
    }
  }, [activePanel])

  useEffect(() => {
    let hasNextPage = false
    let lastPageNumber = 0
    context.remoteBranchCommits && Object.entries(context.remoteBranchCommits).map(([key, value]) => {
      if (key == branch.name) {
        value.map((page, index) => {
          hasNextPage = page.hasNextPage
          lastPageNumber = page.page
        })
      }
    })
    setHasNextPage(hasNextPage)
    setLastPageNumber(lastPageNumber)
  }, [context.remoteBranchCommits])

  const checkout = async (branch: branch) => {
    trackMatomoEvent({
      category: 'git',
      action: 'CHECKOUT_REMOTE_BRANCH',
      name: 'CHECKOUT_ACTION',
      isClick: true
    })
    await actions.fetch({
      remote: branch.remote,
      ref: branch,
      depth: 20,
      singleBranch: true,
      relative: false,
      quiet: true
    })
    await actions.checkout({
      ref: branch.name,
      refresh: true
    });
    await actions.getBranches()
  }

  const loadNextPage = () => {
    actions.getBranchCommits(branch, lastPageNumber + 1)
  }

  const checkoutCommit = async (oid: string) => {
    try {
      actions.checkout({ ref: oid })
    } catch (e) {
      //
    }
  };

  const getCommitChanges = async (commit: ReadCommitResult) => {
    const changes = await actions.getCommitChanges(commit.oid, commit.commit.parent[0], branch, branch.remote)
    if (!changes) {
      await actions.fetch({
        remote: branch.remote,
        ref: branch,
        depth: 20,
        singleBranch: true,
        relative: false,
        quiet: true
      })
    }
  }

  return (<Accordion activeKey={activePanel} defaultActiveKey="">
    <BrancheDetailsNavigation allowCheckout={allowCheckout} checkout={checkout} branch={branch} eventKey="0" activePanel={activePanel} callback={setActivePanel} />
    <Accordion.Collapse className="ps-2 border-start ms-1" eventKey="0">
      <>
        <div data-id={`remote-branch-commits-${branch && branch.name}`} className="ms-1">
          {context.remoteBranchCommits && Object.entries(context.remoteBranchCommits).map(([key, value]) => {
            if (key == branch.name) {
              return value.map((page, index) => {
                return page.commits.map((commit, index) => {
                  return (<CommitDetails branch={branch} getCommitChanges={getCommitChanges} key={index} checkout={checkoutCommit} commit={commit}></CommitDetails>)
                })
              })
            }
          })}

        </div>
        {hasNextPage && <GitUIButton data-id='load-more-remote-branches' className="mb-1 ms-2 btn btn-sm" onClick={loadNextPage}>Load more</GitUIButton>}
      </>
    </Accordion.Collapse>
  </Accordion>)
}