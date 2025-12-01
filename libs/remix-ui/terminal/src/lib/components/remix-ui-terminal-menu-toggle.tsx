import { CustomTooltip } from '@remix-ui/helper'
import React from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { RemixUiTerminalProps } from '../types/terminalTypes'
export const RemixUITerminalMenuToggle = (props: RemixUiTerminalProps) => {

  async function handleToggleTerminal(): Promise<void> {
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
          className="mx-2 codicon codicon-close fw-bold fs-6"
          data-id="hideBottomPanel"
          onClick={handleToggleTerminal}
        ></i>
      </CustomTooltip>
    </>
  )
}