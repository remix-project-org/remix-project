import { faCaretDown, faArrowUp, faArrowDown, faArrowRotateRight, faCaretRight, faArrowsUpDown, faCloudArrowUp, faCloudArrowDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CustomTooltip } from "@remix-ui/helper";
import React, { useEffect } from "react";
import { FormattedMessage } from "react-intl";
import { pluginActionsContext } from "../../state/context";
import { branch, remote } from "@remix-api";
import { SourceControlBase } from "../buttons/sourceControlBase";
import { SourceControlButtons } from "../buttons/sourcecontrolbuttons";
import { gitPluginContext } from "../gitui";
import LoaderIndicator from "./loaderindicator";
import { gitUIPanels } from "../../types";

export interface CommitsNavigationProps {
  title: string,
  eventKey: string,
  activePanel: string,
  callback: (eventKey: string) => void
  branch?: branch,
  remote?: remote
  showButtons?: boolean
  ahead?: boolean,
  behind?: boolean,
}

export const CommitsNavigation = ({ eventKey, activePanel, callback, title, branch, remote, showButtons, ahead, behind }: CommitsNavigationProps) => {
  const pluginactions = React.useContext(pluginActionsContext)
  const [pullEnabled, setPullEnabled] = React.useState(true)
  const [pushEnabled, setPushEnabled] = React.useState(true)
  const [syncEnabled, setSyncEnabled] = React.useState(false)
  const [fetchEnabled, setFetchEnabled] = React.useState(true)
  const context = React.useContext(gitPluginContext)

  const handleClick = () => {
    if (!callback) return
    if (activePanel === eventKey) {
      callback('')
    } else {
      callback(eventKey)
    }
  }

  return (
    <>
      <div className={`flex justify-between ${activePanel === eventKey ? 'bg-light' : ''} ${ahead || behind? 'text-success':''}`}>
        <span data-id={`commits-panel${ahead?'-ahead':''}${behind?'-behind':''}`} onClick={() => handleClick()} role={'button'} className='nav flex justify-start items-center w-full ml-1'>
          {
            activePanel === eventKey ? <FontAwesomeIcon className='' icon={faCaretDown}></FontAwesomeIcon> : <FontAwesomeIcon className='' icon={faCaretRight}></FontAwesomeIcon>
          }
          {ahead? <FontAwesomeIcon className='ml-1' icon={faCloudArrowUp}></FontAwesomeIcon> : null}
          {behind? <FontAwesomeIcon className='ml-1' icon={faCloudArrowDown}></FontAwesomeIcon> : null}
          <label className={`pl-2 nav form-check-label ${ahead || behind? 'text-success':''}`}>{title}</label>
          <LoaderIndicator></LoaderIndicator>
        </span>
        {showButtons ?
          <SourceControlBase branch={branch} remote={remote}>
            <SourceControlButtons panel={gitUIPanels.COMMITS} />
          </SourceControlBase> : null}

      </div>
    </>
  );
}
