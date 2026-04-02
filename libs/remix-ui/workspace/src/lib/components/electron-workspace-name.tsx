import { CustomTooltip } from "@remix-ui/helper"
import React from "react"
import path from 'path'

interface ElectronWorkspaceNameProps {
  path: string
  plugin: any
}

export const ElectronWorkspaceName = (props: ElectronWorkspaceNameProps) => {
  const { path: dir } = props

  const parsePath = () => {
    const pathArray = dir.split(path.posix.sep)
    return pathArray[pathArray.length - 1]
  }

  const openInExplorer = () => {
    props.plugin.call('fs', 'revealInExplorer', {
      path: [dir]
    }, true)
  }

  return (
    (dir === undefined || dir === '') ? <></> :
      <div className="flex items-baseline mt-2">
        <CustomTooltip
          placement="bottom"
          tooltipId="workspace-name"
          tooltipClasses="whitespace-nowrap"
          tooltipText={dir}
        >
          <div
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flexGrow: 1,
            }}

          >{parsePath()}</div>
        </CustomTooltip>
        <CustomTooltip
          placement="top"
          tooltipId="workspace-open-in-explorer"
          tooltipClasses="whitespace-nowrap"
          tooltipText='Open in file explorer'
        >
          <i onClick={openInExplorer} style={{ cursor: 'pointer' }} className="fa fas fa-arrow-up-right-from-square ml-2"></i>
        </CustomTooltip>
      </div>

  )
}
