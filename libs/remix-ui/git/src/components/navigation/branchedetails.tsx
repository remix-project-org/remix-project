import { faCaretUp, faCaretDown, faCaretRight, faArrowUp, faArrowDown, faArrowRotateRight, faArrowsUpDown, faGlobe, faCheckCircle, faToggleOff, faToggleOn, faSync } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useContext, useEffect } from "react";
import { gitActionsContext } from "../../state/context";
import { branch } from "@remix-api";
import GitUIButton from "../buttons/gituibutton";
import { gitPluginContext } from "../gitui";
import { removeGitFromUrl } from "../../utils";
import { useIntl } from "react-intl";

interface BrancheDetailsNavigationProps {
  eventKey: string;
  activePanel: string;
  callback: (eventKey: string) => void;
  branch: branch;
  checkout: (branch: branch) => void;
  allowCheckout: boolean;
}

export const BrancheDetailsNavigation = (props: BrancheDetailsNavigationProps) => {
  const { eventKey, activePanel, callback, branch, checkout, allowCheckout } = props;
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)
  const intl = useIntl()
  const handleClick = () => {
    if (!callback) return
    if (activePanel === eventKey) {
      callback('')
    } else {
      callback(eventKey)
    }
  }

  const getRemote = () => {
    return context.upstream ? context.upstream : context.defaultRemote ? context.defaultRemote : null
  }

  const openRemote = () => {
    const remote = branch.remote || getRemote()
    window.open(`${removeGitFromUrl(remote.url)}/tree/${branch.name}`, '_blank');
  }

  const reloadBranch = () => {
    actions.getBranchCommits(branch, 1)
  }

  const canFetch = () => {
    if (getRemote())
      return context.branches.find((b) => b.name === branch.name && b.remote && b.remote.url === getRemote().url) ? true : false
  }

  const fetchBranch = async () => {
    await actions.fetch({
      remote: null,
      ref: branch,
      singleBranch: true,
      relative: true
    })

  }

  if (branch.name === 'HEAD'){
    return null;
  }

  return (
    <>
      <div className="d-flex flex-row w-100 mb-2 mt-2">
        <div data-type='branches-branch' data-id={`branches-${context.currentBranch.name === branch.name ? 'current-' : ''}branch-${branch.name}`} onClick={() => handleClick()} role={'button'} className='pointer d-flex flex-row w-100 commit-navigation'>
          {
            activePanel === eventKey ? <FontAwesomeIcon className='' icon={faCaretDown}></FontAwesomeIcon> : <FontAwesomeIcon className='' icon={faCaretRight}></FontAwesomeIcon>
          }
          <i className="fa fa-code-branch ms-2"></i>
          <div className={`ms-1 ${context.currentBranch.name === branch.name && allowCheckout ? 'text-success' : ''}`}>{branch.name} {branch.remote ? `on ${branch.remote.name}` : ''}</div>

        </div>
        {allowCheckout ?
          context.currentBranch && context.currentBranch.name === branch.name ?
            <GitUIButton data-id={`branches-toggle-current-branch-${branch.name}`} className="btn btn-sm p-0 me-1" onClick={() => { }}>
              <FontAwesomeIcon className='pointer text-success' icon={faToggleOff} ></FontAwesomeIcon>
            </GitUIButton>
            :
            <GitUIButton tooltip={intl.formatMessage({ id: 'gitui.checkoutBranch' })} data-id={`branches-toggle-branch-${branch.name}`} className="btn btn-sm p-0 me-1" onClick={() => checkout(branch)}>
              <FontAwesomeIcon icon={faToggleOn}></FontAwesomeIcon>
            </GitUIButton>
          : null}
        {!branch.remote && canFetch() && <>
          <GitUIButton tooltip={intl.formatMessage({ id: 'gitui.fetchBranch' })} className="btn btn-sm p-0 me-1 text-muted" onClick={() => fetchBranch()}><FontAwesomeIcon icon={faSync} ></FontAwesomeIcon></GitUIButton>
          <GitUIButton tooltip={intl.formatMessage({ id: 'gitui.openOnRemote' })} className="btn btn-sm p-0 me-1 text-muted" onClick={() => openRemote()}><FontAwesomeIcon icon={faGlobe} ></FontAwesomeIcon></GitUIButton>
        </>}
        {branch.remote?.url && <>
          <GitUIButton tooltip={intl.formatMessage({ id: 'gitui.fetchBranch' })} className="btn btn-sm p-0 me-1 text-muted" onClick={() => reloadBranch()}>
            <FontAwesomeIcon icon={faSync} ></FontAwesomeIcon>
          </GitUIButton>
        </>}

        {branch.remote?.url && <>
          <GitUIButton tooltip={intl.formatMessage({ id: 'gitui.openRemote' })} className="btn btn-sm p-0 me-1 text-muted" onClick={() => openRemote()}>
            <FontAwesomeIcon icon={faGlobe} ></FontAwesomeIcon>
          </GitUIButton>
        </>}

      </div>
    </>
  );
}
