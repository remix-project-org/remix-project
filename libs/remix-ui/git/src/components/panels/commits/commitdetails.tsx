import { ReadCommitResult } from "isomorphic-git"
import React, { useEffect, useState } from "react";
import { Accordion } from "react-bootstrap";
import { CommitDetailsNavigation } from "../../navigation/commitdetails";
import { gitActionsContext } from "../../../state/context";
import { gitPluginContext } from "../../gitui";
import { CommitDetailsItems } from "./commitdetailsitem";
import { branch, remote } from "@remix-ui/git";
import { removeGitFromUrl } from "../../../utils";

export interface CommitDetailsProps {
  commit: ReadCommitResult;
  checkout: (oid: string) => void;
  getCommitChanges: (commit: ReadCommitResult) => void;
  branch: branch
}

export const CommitDetails = (props: CommitDetailsProps) => {
  const { commit, checkout, getCommitChanges, branch } = props;
  const actions = React.useContext(gitActionsContext)
  const context = React.useContext(gitPluginContext)
  const [activePanel, setActivePanel] = useState<string>("");

  useEffect(() => {
    if (activePanel === "0") {
      getCommitChanges(commit)
    }
  }, [activePanel])

  const getRemote = (): remote | null => {
    return context.upstream ? context.upstream : context.defaultRemote ? context.defaultRemote : branch.remote ? branch.remote : null
  }

  const commitsAhead = (remote: remote) => {
    if (!remote) return [];
    return context.branchDifferences[`${remote.name}/${branch.name}`]?.uniqueHeadCommits || [];
  }

  const isAheadOfRepo = () => {
    return commitsAhead(getRemote()).findIndex((c) => c.oid === commit.oid) > -1
  }

  const openFileOnRemote = (file: string, hash: string, branch: branch) => {
    if (!getRemote()) return
    window.open(`${getRemote() ? `${removeGitFromUrl(getRemote().url)}/blob/${hash}/${file}` : ""}`, "_blank")
  }

  return (<Accordion activeKey={activePanel} defaultActiveKey="">
    <CommitDetailsNavigation isAheadOfRepo={isAheadOfRepo()} branch={branch} commit={commit} checkout={checkout} eventKey="0" activePanel={activePanel} callback={setActivePanel} />
    <Accordion.Collapse className="pl-2 border-l ml-1" eventKey="0">
      <>
        {context.commitChanges && context.commitChanges.filter(
          (change) => change.hashModified === commit.oid && change.hashOriginal === commit.commit.parent[0]
        ).map((change, index) => {
          return (<CommitDetailsItems branch={branch} openFileOnRemote={openFileOnRemote} isAheadOfRepo={isAheadOfRepo()} key={index} commitChange={change}></CommitDetailsItems>)
        })}

      </>
    </Accordion.Collapse>
  </Accordion>)
}