import { faCaretDown, faCaretRight, faArrowRightArrowLeft, faGlobe, faToggleOff, faToggleOn, faTrash, faCheck, faSync } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CustomTooltip } from "@remix-ui/helper";
import React, { useContext, useEffect } from "react";
import { gitActionsContext } from "../../state/context";
import { remote } from "@remix-api";
import { gitMatomoEventTypes } from "../../types";
import GitUIButton from "../buttons/gituibutton";
import { gitPluginContext } from "../gitui";
import { removeGitFromUrl } from "../../utils";
import { useIntl } from "react-intl";

interface RemotesDetailsNavigationProps {
  eventKey: string;
  activePanel: string;
  callback: (eventKey: string) => void;
  remote: remote;
}

export const RemotesDetailsNavigation = (props: RemotesDetailsNavigationProps) => {
  const { eventKey, activePanel, callback, remote } = props;
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

  const openRemote = () => {
    window.open(`${removeGitFromUrl(remote.url)}`, '_blank');
  }

  const setAsDefault = async () => {
    actions.setDefaultRemote(remote)
  }

  const isDefault = () => {
    return (context.defaultRemote && context.defaultRemote?.url === remote.url) || (context.upstream && context.upstream?.url === remote.url)
  }

  return (
    <>
      <div className="d-flex flex-row w-100 mb-2 mt-2">
        <div data-id={`remote-detail-${remote.name}${isDefault() ? '-default' : ''}`} onClick={() => handleClick()} role={'button'} className='pointer long-and-truncated d-flex flex-row commit-navigation'>
          {
            activePanel === eventKey ? <FontAwesomeIcon className='' icon={faCaretDown}></FontAwesomeIcon> : <FontAwesomeIcon className='' icon={faCaretRight}></FontAwesomeIcon>
          }
          <CustomTooltip tooltipText={remote.url} placement="top">
            <div className={`long-and-truncated ms-1 ${isDefault() ? 'text-success' : ''}`}>
              {remote.name}  <FontAwesomeIcon className='' icon={faArrowRightArrowLeft}></FontAwesomeIcon> {remote.url}
            </div>
          </CustomTooltip>

        </div>
        {isDefault() ?
          <GitUIButton data-id={`default-remote-check-${remote.name}`}className="btn btn-sm" onClick={() => { }} disabledCondition={true}><FontAwesomeIcon className='text-success' icon={faCheck} ></FontAwesomeIcon></GitUIButton>
          :
          <GitUIButton data-id={`set-as-default-${remote.name}`} tooltip={intl.formatMessage({ id: 'gitui.setAsDefault' })} className="btn btn-sm" onClick={setAsDefault}><FontAwesomeIcon icon={faToggleOn}></FontAwesomeIcon></GitUIButton>
        }
        <GitUIButton tooltip={intl.formatMessage({ id: 'gitui.fetchRemote' })} data-id={`remote-sync-${remote.name}`} className="btn btn-sm" onClick={async () => {
          await actions.fetch({
            remote
          })
        }}><FontAwesomeIcon icon={faSync} ></FontAwesomeIcon></GitUIButton>
        <GitUIButton data-id={`remote-rm-${remote.name}`} className="btn btn-sm" onClick={() => actions.removeRemote(remote)}><FontAwesomeIcon className='text-danger' icon={faTrash} ></FontAwesomeIcon></GitUIButton>
        {remote?.url && <GitUIButton tooltip={intl.formatMessage({ id: 'gitui.openOnRemote' })} className="btn btn-sm pe-0" onClick={() => openRemote()}><FontAwesomeIcon icon={faGlobe} ></FontAwesomeIcon></GitUIButton>}
      </div>
    </>
  );
}
