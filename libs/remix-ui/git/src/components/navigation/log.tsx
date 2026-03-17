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
      <div className={'d-flex justify-content-between pt-1 pb-1 ' + (activePanel === eventKey ? 'bg-light' : '')}>
        <span onClick={() => handleClick()} role={'button'} className='nav d-flex justify-content-start align-items-center w-75 ms-1'>
          {
            activePanel === eventKey ? <FontAwesomeIcon className='' icon={faCaretDown}></FontAwesomeIcon> : <FontAwesomeIcon className='' icon={faCaretRight}></FontAwesomeIcon>
          }
          <label className="ps-2 nav form-check-label me-2"><FormattedMessage id="gitui.log" /></label>
          {logState.errorCount > 0 && (
            <div className="text-danger me-1">
              {logState.errorCount}
              <FontAwesomeIcon className="ms-1" icon={faTriangleExclamation} />
            </div>
          )}

          {logState.warningCount > 0 && (
            <div className="text-warning me-1">
              {logState.warningCount}
              <FontAwesomeIcon className="ms-1" icon={faWarning} />
            </div>
          )}

          {logState.infoCount > 0 && (
            <div className="text-info me-1">
              {logState.infoCount}
              <FontAwesomeIcon className="ms-1" icon={faCircleInfo} />
            </div>
          )}

          {logState.successCount > 0 && (
            <div className="text-success">
              {logState.successCount}
              <FontAwesomeIcon className="ms-1" icon={faCircleCheck} />
            </div>
          )}
        </span>
        {context.log && context.log.length > 0 && (
          <FontAwesomeIcon onClick={clearLogs} className='btn btn-sm' icon={faBan}></FontAwesomeIcon>)}
      </div>
    </>
  );
}
