import { count } from "console"
import { CustomIconsToggle, CustomMenu, CustomTooltip } from "@remix-ui/helper"
import React, { useState } from "react"
import { Dropdown } from "react-bootstrap"
import { FormattedMessage } from "react-intl"

export const SourceControlMenu = () => {
  const [showIconsMenu, hideIconsMenu] = useState<boolean>(false)
  return (
    <Dropdown id="workspacesMenuDropdown" data-id="sourceControlMenuDropdown" onToggle={() => hideIconsMenu(!showIconsMenu)} show={showIconsMenu}>
      <Dropdown.Toggle
        onClick={() => {
          hideIconsMenu(!showIconsMenu)
        }}
        as={CustomIconsToggle}
        icon={'fas fa-bars'}
      ></Dropdown.Toggle>
      <Dropdown.Menu as={CustomMenu} data-id="wsdropdownMenu" className='form-select remixui_menuwidth' rootCloseEvent="click">
        <Dropdown.Item key={0}>
          <CustomTooltip
            placement="right-start"
            tooltipId="cloneWorkspaceTooltip"
            tooltipClasses="whitespace-nowrap"
            tooltipText={<FormattedMessage id='filePanel.workspace.clone' defaultMessage='Clone Git Repository' />}
          >
            <div
              data-id='cloneGitRepository'
              onClick={() => {
                hideIconsMenu(!showIconsMenu)
              }}
              key={`cloneGitRepository-fe-ws`}
            >
              <span
                id='cloneGitRepository'
                data-id='cloneGitRepository'
                onClick={() => {
                  hideIconsMenu(!showIconsMenu)
                }}
                className='fab fa-github pl-2'
              >
              </span>
              <span className="pl-3"><FormattedMessage id='filePanel.clone' defaultMessage='Clone' /></span>
            </div>
          </CustomTooltip>
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}
