import { ReadCommitResult } from "isomorphic-git";
import { Accordion } from "react-bootstrap";
import React, { useEffect, useState } from "react";
import { CommitDetails } from "../commits/commitdetails";
import { CommitsNavigation } from "../../navigation/commits";
import { branch, remote } from "@remix-api";
import { gitActionsContext } from "../../../state/context";
import { gitPluginContext } from "../../gitui";

export interface BrancheDifferenceProps {
  commits: ReadCommitResult[];
  title: string,
  remote?: remote,
  branch?: branch
  ahead?: boolean,
  behind?: boolean
}

export const BranchDifferenceDetails = (props: BrancheDifferenceProps) => {
  const { commits, title, branch, remote, ahead, behind } = props;
  const [activePanel, setActivePanel] = useState<string>("");
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)

  if (commits.length === 0) return null

  const getRemote = () => {
    return remote ? remote : context.upstream ? context.upstream : context.defaultRemote ? context.defaultRemote : null
  }

  const getCommitChanges = async (commit: ReadCommitResult) => {
    await actions.getCommitChanges(commit.oid, commit.commit.parent[0], null, getRemote())
  }

  return (
    <Accordion activeKey={activePanel} className="mt-2" defaultActiveKey="">
      <CommitsNavigation ahead={ahead} behind={behind} branch={branch} remote={remote} title={title} eventKey="0" activePanel={activePanel} callback={setActivePanel} />
      <Accordion.Collapse className="pl-2 border-l ml-1" eventKey="0">
        <div data-id={`branchdifference-commits-${branch.name}${ahead?'-ahead':''}${behind?'-behind':''}`} className="ml-1">
          {commits && commits.map((commit, index) => {
            return (
              <CommitDetails branch={branch} getCommitChanges={getCommitChanges} key={index} checkout={()=>{}} commit={commit}></CommitDetails>
            );
          })}
        </div>
      </Accordion.Collapse>
    </Accordion>)
}