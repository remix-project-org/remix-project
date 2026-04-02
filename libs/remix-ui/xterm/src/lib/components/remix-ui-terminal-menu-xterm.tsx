import { CustomTooltip } from '@remix-ui/helper';
import { TerminalContext } from '@remix-ui/terminal';
import { createTerminal } from '@remix-ui/xterm';
import React, { useState, useEffect, useRef, useContext } from 'react' // eslint-disable-line
import { Dropdown, ButtonGroup } from 'react-bootstrap';
import { FormattedMessage } from 'react-intl';
import { RemixUiTerminalProps } from "../../../../terminal/src/lib/types/terminalTypes";

export const RemixUIXtermMenu = (props: RemixUiTerminalProps) => {
  const { xtermState, dispatchXterm } = useContext(TerminalContext)

  function onClearTerminal(): void | PromiseLike<void> {
    const terminal = xtermState.terminals.find(xtermState => xtermState.hidden === false)
    if (terminal && terminal.ref && terminal.ref.terminal)
      terminal.ref.terminal.clear()
  }

  function onCreateTerminal(shell?: string): void | PromiseLike<void> {
    createTerminal(shell, props.plugin, xtermState.workingDir, dispatchXterm)
  }

  function onCloseTerminal(): void | PromiseLike<void> {
    const pid = xtermState.terminals.find(xtermState => xtermState.hidden === false).pid
    if (pid)
      props.plugin.call('xterm', 'closeTerminal', pid)
  }

  return (<>
    <div className={`flex flex-row items-center ${xtermState.showOutput ? 'hidden' : ''}`}>
      <div data-id="createTerminalButton" className="mx-2" onClick={async () => onCreateTerminal()}>
        <CustomTooltip tooltipText={<FormattedMessage id='xterm.new' defaultMessage='New terminal' />}>
          <i className="fas fa-plus border-0 p-0 m-0"></i>
        </CustomTooltip>
      </div>
      <div className=''>
        <CustomTooltip tooltipText={<FormattedMessage id='xterm.shells' defaultMessage='Shells' />}>
          <Dropdown as={ButtonGroup}>
            <Dropdown.Toggle data-id='select_shell' split variant="" id="dropdown-split-basic" />
            <Dropdown.Menu className='form-select remixui_menuwidth'>
              {xtermState.shells.map((shell, index) => {
                return (<Dropdown.Item data-id={`select_${shell}`} key={index} onClick={async () => await onCreateTerminal(shell)}>{shell}</Dropdown.Item>)
              })}
            </Dropdown.Menu>
          </Dropdown>
        </CustomTooltip>
      </div>
      <div data-id="closeTerminalButton" className="mx-2" onClick={onCloseTerminal}>
        <CustomTooltip tooltipText={<FormattedMessage id='xterm.close' defaultMessage='Close terminal' />}>
          <i className="far fa-trash border-0 ml-1"></i>
        </CustomTooltip>
      </div>
      <div data-id="clearTerminalButton" className="mx-2" onClick={async () => onClearTerminal()}>
        <CustomTooltip tooltipText={<FormattedMessage id='xterm.clear' defaultMessage='Clear Terminal' />}>
          <i className="fas fa-ban border-0 p-0 m-0"></i>
        </CustomTooltip>
      </div>
    </div>
  </>)
}