import { faCaretUp, faCaretDown, faArrowUp, faArrowDown, faArrowRotateRight, faCaretRight, faArrowsUpDown, faPlus, faMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CustomTooltip } from "@remix-ui/helper";
import React, { useContext, useEffect } from "react";
import { FormattedMessage } from "react-intl";
import { gitActionsContext, pluginActionsContext } from "../../state/context";
import { sourceControlGroup } from "../../types";
import { gitPluginContext } from "../gitui";

interface SourceControlGroupNavigationProps {
    eventKey: string;
    activePanel: string;
    callback: (eventKey: string) => void;
    group: sourceControlGroup
}

export const SourceControlGroupNavigation = (props: SourceControlGroupNavigationProps) => {
  const { eventKey, activePanel, callback, group } = props;
  const actions = React.useContext(gitActionsContext)
  const pluginActions = React.useContext(pluginActionsContext)
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
      <div className={'flex justify-between  pt-1 ' + (activePanel === eventKey? 'bg-light': '')}>
        <span onClick={()=>handleClick()} role={'button'} className='nav flex justify-start items-center w-3/4 ml-1'>
          {
            activePanel === eventKey ? <FontAwesomeIcon className='' icon={faCaretDown}></FontAwesomeIcon> : <FontAwesomeIcon className='' icon={faCaretRight}></FontAwesomeIcon>
          }
          <label className="pl-1 nav form-check-label">{group.name}</label>
        </span>
        {
          activePanel === eventKey ?
            <span className='flex justify-end items-center w-1/4 py-2'>
              {group.name === 'Changes' ?
                <CustomTooltip tooltipText={<FormattedMessage id="git.stageall" />}>
                  <button data-id='sourcecontrol-add-all' onClick={async () => { await actions.addall(context.allchangesnotstaged) }} className='inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors' style={{ marginLeft: '1rem', marginRight: '1.3rem' }}><FontAwesomeIcon icon={faPlus} className="" /></button>
                </CustomTooltip>: null}

            </span> : null
        }
      </div>
    </>
  );
}
