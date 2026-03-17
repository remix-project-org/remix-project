import { branch, commitChange } from "@remix-api";
import React from "react";
import path from "path";
import { gitActionsContext, pluginActionsContext } from "../../../state/context";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import GitUIButton from "../../buttons/gituibutton";
import { useIntl } from "react-intl";

export interface CCommitDetailsItemsProps {
  commitChange: commitChange;
  isAheadOfRepo: boolean;
  openFileOnRemote: (file: string, hash: string, branch: branch) => void;
  branch: branch
}

export const CommitDetailsItems = (props: CCommitDetailsItemsProps) => {
  const { commitChange, isAheadOfRepo, openFileOnRemote, branch } = props;
  const actions = React.useContext(gitActionsContext)
  const pluginActions = React.useContext(pluginActionsContext)
  const intl = useIntl()

  const openChanges = async (change: commitChange) => {
    await actions.diff(change)
    await pluginActions.openDiff(change)
  }

  const openRemote = () => {
    openFileOnRemote(commitChange.path, commitChange.hashModified, branch)
  }

  function FunctionStatusIcons() {
    const status = commitChange.type
    return (<>

      {status && status.indexOf("modified") === -1 ? <></> : <span>M</span>}
      {status && status.indexOf("deleted") === -1 ? <></> : <span>D</span>}
      {status && status.indexOf("added") === -1 ? <></> : <span>A</span>}

    </>)
  }
  return (<>
    <div data-id={`commit-change-${commitChange.type}-${path.basename(commitChange.path)}`} className={`d-flex w-100 d-flex flex-row commitdetailsitem ${isAheadOfRepo ? 'text-success' : ''}`}>
      <div className='pointer gitfile long-and-truncated' onClick={async () => await openChanges(commitChange)}>
        <span className='fw-bold long-and-truncated'>{path.basename(commitChange.path)}</span>
        <div className='text-secondary long-and-truncated'> {commitChange.path}</div>
      </div>
      <div className="d-flex align-items-end">
        {!isAheadOfRepo ?
          <GitUIButton tooltip={intl.formatMessage({ id: 'gitui.openOnRemote' })} className="btn btn-sm p-0 text-muted me-1" onClick={() => openRemote()}><FontAwesomeIcon icon={faGlobe} ></FontAwesomeIcon></GitUIButton>
          : <></>}
        <FunctionStatusIcons></FunctionStatusIcons>
      </div>
    </div>
  </>)
}
