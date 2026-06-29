import { faCaretUp, faCaretDown, faArrowUp, faArrowDown, faArrowRotateRight, faCaretRight, faCircleCheck, faArrowsUpDown, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useContext, useEffect } from "react";
import { pluginActionsContext } from "../../state/context";
import GitUIButton from "../buttons/gituibutton";
import { SourceControlButtons } from "../buttons/sourcecontrolbuttons";
import LoaderIndicator from "./loaderindicator";
import { FormattedMessage } from "react-intl";

export const CommandsNavigation = ({ eventKey, activePanel, callback }) => {
  const pluginactions = React.useContext(pluginActionsContext)

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
      <div className={'d-flex justify-content-between ' + (activePanel === eventKey ? 'bg-light' : '')}>
        <span data-id='commands-panel' onClick={() => handleClick()} role={'button'} className="nav d-flex justify-content-start align-items-center w-75 ms-1">
          {
            activePanel === eventKey ? <FontAwesomeIcon className='' icon={faCaretDown}></FontAwesomeIcon> : <FontAwesomeIcon className='' icon={faCaretRight}></FontAwesomeIcon>
          }
          <label className="ps-2 nav form-check-label"><FormattedMessage id="gitui.commands" /></label>
        </span>
        <LoaderIndicator></LoaderIndicator>
      </div>
    </>
  );
}
