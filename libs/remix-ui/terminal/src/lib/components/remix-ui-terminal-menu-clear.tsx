import { CustomTooltip } from '@remix-ui/helper'
import React, { useContext } from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { TerminalContext } from '../context'
import { RemixUiTerminalProps } from '../types/terminalTypes'

export const RemixUITerminalMenuClear = (props: RemixUiTerminalProps) => {
  const { dispatch } = useContext(TerminalContext)

  function handleClearConsole(event: any): void {
    dispatch({ type: 'clearconsole', payload: []})
  }

  return (
    <div className="d-flex remix_ui_terminal_console" id="clearConsole" data-id="terminalClearConsole" onClick={handleClearConsole}>
      <CustomTooltip placement="top" tooltipId="terminalClearTerminal" tooltipClasses="text-nowrap" tooltipText={<FormattedMessage id="terminal.clearConsole" />}>
        <i className="fas fa-ban fs-6" aria-hidden="true"></i>
      </CustomTooltip>
    </div>
  )
}
