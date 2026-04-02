import { faCaretUp, faCaretDown, faArrowUp, faArrowDown, faArrowRotateRight, faCaretRight, faArrowsUpDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CustomTooltip } from "@remix-ui/helper";
import React, { useContext, useEffect } from "react";
import { FormattedMessage } from "react-intl";
import { pluginActionsContext } from "../../state/context";
import { SourceControlBase } from "../buttons/sourceControlBase";
import { SourceControlButtons } from "../buttons/sourcecontrolbuttons";
import { gitPluginContext } from "../gitui";
import LoaderIndicator from "./loaderindicator";
import { SourceControlMenu } from "./menu/sourcecontrolmenu";
import { gitUIPanels } from "../../types";

export const SourceControlNavigation = ({ eventKey, activePanel, callback }) => {
  const pluginactions = React.useContext(pluginActionsContext)
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
      <div className={'flex items-center justify-between ' + (activePanel === eventKey ? 'bg-light' : '')}>
        <span data-id='sourcecontrol-panel' onClick={() => handleClick()} role={'button'} className='nav flex justify-start items-center w-3/4 ml-1'
        >
          {
            activePanel === eventKey ? <FontAwesomeIcon className='' icon={faCaretDown}></FontAwesomeIcon> : <FontAwesomeIcon className='' icon={faCaretRight}></FontAwesomeIcon>
          }
          <label className="nav pl-2 form-check-label"><FormattedMessage id="gitui.sourceControl" /></label>
          <LoaderIndicator></LoaderIndicator>

        </span>

        <SourceControlBase><SourceControlButtons panel={gitUIPanels.SOURCECONTROL}/></SourceControlBase>

      </div>
    </>
  );
}
