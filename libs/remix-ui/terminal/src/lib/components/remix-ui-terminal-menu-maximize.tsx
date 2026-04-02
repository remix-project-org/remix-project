import { CustomTooltip } from '@remix-ui/helper'
import React from 'react' // eslint-disable-line
import { RemixUiTerminalProps } from '../types/terminalTypes'

export const RemixUITerminalMenuMaximize = (props: RemixUiTerminalProps) => {

  async function handleMaximizeTerminal(): Promise<void> {
    if (props.maximizePanel) {
      await props.maximizePanel()
    }
  }

  return (
    <>
      <CustomTooltip
        placement="top"
        tooltipId="terminalMaximize"
        tooltipClasses="whitespace-nowrap"
        tooltipText={props.isMaximized ? "Minimize Panel" : "Maximize Panel"}
      >
        <div
          className="codicon-screen-icon mx-2"
          data-id="maximizeBottomPanel"
          onClick={handleMaximizeTerminal}
          style={{ cursor: 'pointer' }}
        >
          {props.isMaximized ? '\ueb4d' : '\ueb4c' /* Actual icons were not being rendered, so used unicode for codicon-screen-full & codicon-screen-normal icons*/ }
        </div>
      </CustomTooltip>
    </>
  )
}
