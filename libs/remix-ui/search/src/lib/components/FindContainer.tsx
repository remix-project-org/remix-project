import { CustomTooltip } from '@remix-ui/helper'
import React, { useContext, useEffect, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { SearchContext } from '../context/context'
import { Find } from './Find'
import { OverWriteCheck } from './OverWriteCheck'
import { Replace } from './Replace'

export const FindContainer = (props) => {
  const { setReplaceEnabled } = useContext(SearchContext)
  const [expanded, setExpanded] = useState<boolean>(false)
  const toggleExpand = () => setExpanded(!expanded)
  useEffect(() => {
    setReplaceEnabled(expanded)
  }, [expanded])
  return (
    <div className="search_plugin_find_container">
      <CustomTooltip tooltipText={<FormattedMessage id="search.toggleReplace" />} tooltipClasses="whitespace-nowrap" tooltipId="toggleReplaceTooltip" placement="left-start">
        <div
          data-id="toggle_replace"
          className={`codicon codicon-find-${expanded ? 'expanded' : 'collapsed'} search_plugin_find_container_arrow`}
          role="button"
          onClick={toggleExpand}
          aria-label="Toggle Replace"
          aria-expanded="true"
          aria-disabled="false"
        ></div>
      </CustomTooltip>
      <div className="search_plugin_find_container_internal">
        <Find></Find>
        {expanded ? (
          <>
            <Replace></Replace>
            <OverWriteCheck></OverWriteCheck>
          </>
        ) : null}
      </div>
    </div>
  )
}
