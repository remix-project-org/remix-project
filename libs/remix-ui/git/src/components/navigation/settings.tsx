import { faCaretUp, faCaretDown, faArrowUp, faArrowDown, faArrowRotateRight, faCaretRight, faArrowsUpDown, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CustomTooltip } from "@remix-ui/helper";
import React, { useContext, useEffect } from "react";
import { FormattedMessage } from "react-intl";
import { pluginActionsContext } from "../../state/context";

export const SettingsNavigation = ({ eventKey, activePanel, callback }) => {
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
        <span onClick={() => handleClick()} role={'button'} className='nav d-flex justify-content-start align-items-center w-75 ms-1'>
          {
            activePanel === eventKey ? <FontAwesomeIcon className='' icon={faCaretDown}></FontAwesomeIcon> : <FontAwesomeIcon className='' icon={faCaretRight}></FontAwesomeIcon>
          }
          <label className="nav ps-2 form-check-label"><FormattedMessage id="gitui.settings" /></label>

        </span>

        <span className='d-flex justify-content-end align-items-center w-25'>
          <CustomTooltip tooltipText={<FormattedMessage id="gitui.missingValues" />}>
            <button onClick={async () => { await pluginactions.loadFiles() }} className='btn btn-sm text-warning'><FontAwesomeIcon icon={faTriangleExclamation} className="" /></button>
          </CustomTooltip>

        </span>

      </div>
    </>
  );
}
