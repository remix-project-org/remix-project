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
      <div className={'flex justify-between ' + (activePanel === eventKey ? 'bg-light' : '')}>
        <span onClick={() => handleClick()} role={'button'} className='nav flex justify-start items-center w-3/4 ml-1'>
          {
            activePanel === eventKey ? <FontAwesomeIcon className='' icon={faCaretDown}></FontAwesomeIcon> : <FontAwesomeIcon className='' icon={faCaretRight}></FontAwesomeIcon>
          }
          <label className="nav pl-2 form-check-label"><FormattedMessage id="gitui.settings" /></label>

        </span>

        <span className='flex justify-end items-center w-1/4'>
          <CustomTooltip tooltipText={<FormattedMessage id="gitui.missingValues" />}>
            <button onClick={async () => { await pluginactions.loadFiles() }} className='inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors text-warning'><FontAwesomeIcon icon={faTriangleExclamation} className="" /></button>
          </CustomTooltip>

        </span>

      </div>
    </>
  );
}
