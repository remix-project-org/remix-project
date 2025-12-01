import React, { useState } from 'react'
import { CustomTooltip } from '@remix-ui/helper'
import { FormattedMessage } from 'react-intl'

export type FileHoverIconsProps = {
  file: any
  handleNewFolderOp?: any
  handleNewFileOp?: any
  renamePathOp?: (path: string, type: string, isNew?: boolean) => void
  deletePathOp?: (path: string | string[]) => void | Promise<void>
}

export function FileHoverIcons(props: FileHoverIconsProps) {
  const [mouseOver, setMouseOver] = useState(false)
  return (
    <>
      {<div className="d-flex flex-row align-items-center">
        {
          props.file.isDirectory ? (
            <>
              <CustomTooltip
                placement="bottom"
                delay={{ show: 1000, hide: 0 }}
                tooltipText={<FormattedMessage id="filePanel.createNewFolder" />}
                tooltipId={`filePanel.createNewFolder.${props.file.path}`}
                tooltipClasses="text-nowrap"
              >
                <span
                  data-id="fileExplorerHoverIcons-createNewFolder"
                  className="far fa-folder fa-1x me-2 remixui_icons"
                  onClick={async (e) => {
                    e.stopPropagation()
                    await props.handleNewFolderOp(props.file.path)
                  }}
                  style={{ cursor: mouseOver ? 'pointer' : 'default' }}
                  onMouseEnter={(e) => setMouseOver(true)}
                  onMouseLeave={(e) => setMouseOver(false)}
                ></span>
              </CustomTooltip>
              <CustomTooltip
                placement="bottom"
                delay={{ show: 1000, hide: 0 }}
                tooltipText={<FormattedMessage id="filePanel.createNewFile" />}
                tooltipId={`fileExplorer.createNewFile.${props.file.path}`}
                tooltipClasses="text-nowrap"
              >
                <span
                  data-id="fileExplorerHoverIcons-createNewFile"
                  className="far fa-file fa-1x remixui_icons me-2"
                  onClick={async (e) => {
                    e.stopPropagation()
                    await props.handleNewFileOp(props.file.path)
                  }}
                  style={{ cursor: mouseOver ? 'pointer' : 'default' }}
                  onMouseEnter={(e) => setMouseOver(true)}
                  onMouseLeave={(e) => setMouseOver(false)}
                ></span>
              </CustomTooltip>
            </>
          ) : null
        }
        <CustomTooltip
          placement="bottom"
          delay={{ show: 1000, hide: 0 }}
          tooltipText={<FormattedMessage id="filePanel.rename" />}
          tooltipId={`filePanel.rename.${props.file.path}`}
          tooltipClasses="text-nowrap"
        >
          <span
            data-id="fileExplorerHoverIcons-rename"
            className="far fa-pen fa-1x remixui_icons me-2"
            onClick={(e) => {
              e.stopPropagation()
              props.renamePathOp(props.file.path, props.file.type)
            }}
            style={{ cursor: mouseOver ? 'pointer' : 'default' }}
            onMouseEnter={(e) => setMouseOver(true)}
            onMouseLeave={(e) => setMouseOver(false)}
          ></span>
        </CustomTooltip>
        <CustomTooltip
          placement="bottom"
          delay={{ show: 1000, hide: 0 }}
          tooltipText={<FormattedMessage id="filePanel.deleteItem" />}
          tooltipId={`filePanel.deleteItem.${props.file.path}`}
          tooltipClasses="text-nowrap"
        >
          <span
            data-id="fileExplorerHoverIcons-delete"
            className="far fa-trash fa-1x remixui_icons me-2"
            onClick={async (e) => {
              e.stopPropagation()
              await props.deletePathOp(props.file.path)
            }}
            style={{ cursor: mouseOver ? 'pointer' : 'default' }}
            onMouseEnter={(e) => setMouseOver(true)}
            onMouseLeave={(e) => setMouseOver(false)}
          ></span>
        </CustomTooltip>
      </div>
      }
    </>
  )
}
