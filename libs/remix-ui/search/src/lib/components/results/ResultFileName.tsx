import React, { useEffect, useState } from 'react'
import { SearchResult } from '../../types'
import { CustomTooltip, getPathIcon } from '@remix-ui/helper'
import * as path from 'path'
interface ResultItemProps {
  file: SearchResult
}

export const ResultFileName = (props: ResultItemProps) => {
  const [icon, setIcon] = useState<string>('')

  useEffect(() => {
    if (props.file && props.file.path) {
      setIcon(getPathIcon(props.file.path))
    }
  }, [props.file])

  return (
    <>
      {icon ? <div className={`${icon} caret caret_tv`}></div> : null}
      <CustomTooltip tooltipText={props.file.filename} tooltipClasses="text-nowrap" tooltipId="resultFileNameTooltip" placement="top-start">
        <div className="search_plugin_search_file_name ms-2">
          {path.basename(props.file.path)}
          <span className="ps-1 text-muted text-lowercase">{path.dirname(props.file.path)}</span>
        </div>
      </CustomTooltip>
    </>
  )
}
