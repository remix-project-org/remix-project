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
import { BranchDifferences } from "./branchdifferences";
import GitUIButton from "../../buttons/gituibutton";
import { TrackingContext } from "@remix-ide/tracking";

export interface BrancheDetailsProps {
  branch: branch;
}

export const LocalBranchDetails = (props: BrancheDetailsProps) => {
  const { branch } = props;
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
      actions.getBranchDifferences(branch, null, context)
    }
  }, [activePanel])

  const checkout = async (branch: branch) => {
    trackMatomoEvent({
      category: 'git',
      action: 'CHECKOUT_LOCAL_BRANCH',
      name: 'CHECKOUT_ACTION',
      isClick: true
    })
    await actions.checkout({
      ref: branch.name,
      remote: branch.remote && branch.remote.name || null,
      refresh: true
    });
  }

  const loadNextPage = () => {
    actions.getBranchCommits(branch, lastPageNumber + 1)
  }

  const checkoutCommit = async (oid: string) => {
    try {

      actions.checkout({ ref: oid })
      ;
    } catch (e) {
      //
    }
  };

  const getRemote = () => {
    return context.upstream ? context.upstream : context.defaultRemote ? context.defaultRemote : null
  }

  const getCommitChanges = async (commit: ReadCommitResult) => {
    await actions.getCommitChanges(commit.oid, commit.commit.parent[0], null, getRemote())
  }

  return (<Accordion activeKey={activePanel} defaultActiveKey="">
    <BrancheDetailsNavigation allowCheckout={true} checkout={checkout} branch={branch} eventKey="0" activePanel={activePanel} callback={setActivePanel} />
    <Accordion.Collapse className="ps-2 border-start ms-1" eventKey="0">
      <>
        <div className="ms-1">
          <BranchDifferences branch={branch}></BranchDifferences>
          <div data-id={`local-branch-commits-${branch && branch.name}`}>
            {context.localBranchCommits && Object.entries(context.localBranchCommits).map(([key, value]) => {

              if (key == branch.name) {
                return value.map((commit, index) => {
                  return (<CommitDetails branch={branch} key={index} getCommitChanges={getCommitChanges} checkout={checkoutCommit} commit={commit}></CommitDetails>)
                })
              }
            })}
          </div>
        </div>
        {hasNextPage && <GitUIButton data-id='load-more-local-branches' className="mb-1 ms-2 btn btn-sm" onClick={loadNextPage}>Load more</GitUIButton>}
      </>
    </Accordion.Collapse>
  </Accordion>)
}