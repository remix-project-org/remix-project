import { faBan, faCaretDown, faCaretRight, faCircleCheck, faCircleInfo, faInfo, faTrash, faTriangleExclamation, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useContext, useEffect, useState } from "react";
import { gitActionsContext, pluginActionsContext } from "../../state/context";
import { gitPluginContext } from "../gitui";
import { FormattedMessage } from "react-intl";

export const LogNavigation = ({ eventKey, activePanel, callback }) => {
  const context = useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)

  const [logState, setLogState] = useState({
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    successCount: 0
  });
  const handleClick = () => {
    if (!callback) return
    if (activePanel === eventKey) {
      callback('')
    } else {
      callback(eventKey)
    }
  }

  useEffect(() => {
    if (!context.log) return
    // count different types of logs
    const errorCount = context.log.filter(log => log.type === 'error').length
    const warningCount = context.log.filter(log => log.type === 'warning').length
    const infoCount = context.log.filter(log => log.type === 'info').length
    const successCount = context.log.filter(log => log.type === 'success').length
    // update the state
    setLogState({
      errorCount,
      warningCount,
      infoCount,
      successCount
    })
  }, [context.log])

  const clearLogs = () => {
    actions.clearGitLog()
  }

  return (
    <>
      <div className={'flex justify-between pt-1 pb-1 ' + (activePanel === eventKey ? 'bg-light' : '')}>
        <span onClick={() => handleClick()} role={'button'} className='nav flex justify-start items-center w-3/4 ml-1'>
          {
            activePanel === eventKey ? <FontAwesomeIcon className='' icon={faCaretDown}></FontAwesomeIcon> : <FontAwesomeIcon className='' icon={faCaretRight}></FontAwesomeIcon>
          }
          <label className="pl-2 nav form-check-label mr-2"><FormattedMessage id="gitui.log" /></label>
          {logState.errorCount > 0 && (
            <div className="text-danger mr-1">
              {logState.errorCount}
              <FontAwesomeIcon className="ml-1" icon={faTriangleExclamation} />
            </div>
          )}

          {logState.warningCount > 0 && (
            <div className="text-warning mr-1">
              {logState.warningCount}
              <FontAwesomeIcon className="ml-1" icon={faWarning} />
            </div>
          )}

          {logState.infoCount > 0 && (
            <div className="text-info mr-1">
              {logState.infoCount}
              <FontAwesomeIcon className="ml-1" icon={faCircleInfo} />
            </div>
          )}

          {logState.successCount > 0 && (
            <div className="text-success">
              {logState.successCount}
              <FontAwesomeIcon className="ml-1" icon={faCircleCheck} />
            </div>
          )}
        </span>
        {context.log && context.log.length > 0 && (
          <FontAwesomeIcon onClick={clearLogs} className='inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors' icon={faBan}></FontAwesomeIcon>)}
      </div>
    </>
  );
}
