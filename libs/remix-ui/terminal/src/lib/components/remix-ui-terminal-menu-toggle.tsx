import { CustomTooltip } from '@remix-ui/helper'
import React from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { RemixUiTerminalProps } from '../types/terminalTypes'
export const RemixUITerminalMenuToggle = (props: RemixUiTerminalProps) => {

  async function handleToggleTerminal(): Promise<void> {
    // If panel is maximized, un-maximize it first to show main panel
    if (props.isMaximized && props.maximizePanel) {
      await props.maximizePanel()
    }
    // Toggle the bottom terminal panel using terminal-wrap component
    await props.plugin.call('terminal', 'togglePanel')
  }

  return (
    <>
      <CustomTooltip
        placement="top"
        tooltipId="terminalToggle"
        tooltipClasses="text-nowrap"
        tooltipText={<FormattedMessage id="terminal.hideTerminal" />}
      >
        <i
          className="codicon codicon-close fw-bold fs-5"
          data-id="hideBottomPanel"
          onClick={handleToggleTerminal}
        ></i>
      </CustomTooltip>
    </>
  )
}