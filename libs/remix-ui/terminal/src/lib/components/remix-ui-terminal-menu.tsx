import { CustomTooltip } from '@remix-ui/helper'
import React, { useState, useEffect, useRef, useContext } from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import { listenOnNetworkAction } from '../actions/terminalAction'
import { TerminalContext } from '../context'
import { RemixUiTerminalProps } from '../types/terminalTypes'

export const RemixUITerminalMenu = (props: RemixUiTerminalProps) => {
  const { terminalState, dispatch } = useContext(TerminalContext)
  const intl = useIntl()

  useEffect(() => {
    props.plugin.call('layout', 'minimize', props.plugin.profile.name, !terminalState.isOpen)
  }, [terminalState.isOpen])

  function handleClearConsole(event: any): void {
    dispatch({ type: 'clearconsole', payload: []})
  }

  function listenOnNetwork(event: any): void {
    const isListening = event.target.checked
    listenOnNetworkAction(props.plugin, isListening)
  }

  function setSearchInput(arg0: string): void {
    dispatch({ type: 'search', payload: arg0 })
  }

  return (<div className='d-flex flex-row align-items-center h-100'>
    <CustomTooltip placement="top" tooltipId="terminalpendingTransactions" tooltipClasses="text-nowrap" tooltipText={<FormattedMessage id="terminal.pendingTransactions" />}>
      <div className="mx-2">0</div>
    </CustomTooltip>
    <CustomTooltip
      placement="top"
      tooltipId="terminalListenOnN"
      tooltipClasses="text-nowrap"
      tooltipText={terminalState.isVM ? intl.formatMessage({ id: 'terminal.listenVM' }) : intl.formatMessage({ id: 'terminal.listenTitle' })}
    >
      <div className="h-80 mx-3 align-items-center remix_ui_terminal_listenOnNetwork form-check">
        <input
          className="form-check-input"
          id="listenNetworkCheck"
          onChange={listenOnNetwork}
          type="checkbox"
          disabled={terminalState.isVM}
        />
        <label
          className="form-check-label text-nowrap"
          htmlFor="listenNetworkCheck"
          data-id="listenNetworkCheckInput"
        >
          <FormattedMessage id="terminal.listen" />
        </label>
      </div>
    </CustomTooltip>
    <div className="remix_ui_terminal_search mx-1 d-flex align-items-center h-100">
      <i className="remix_ui_terminal_searchIcon d-flex align-items-center justify-content-center fas fa-search bg-light" aria-hidden="true"></i>
      <input
        onChange={(event) => setSearchInput(event.target.value.trim())}
        type="text"
        className="remix_ui_terminal_filter border form-control"
        id="searchInput"
        placeholder={intl.formatMessage({ id: 'terminal.search' })}
        data-id="terminalInputSearchTerminal"
      />
    </div>
    <div className="mx-2 remix_ui_terminal_console" id="clearConsole" data-id="terminalClearConsole" onClick={handleClearConsole}>
      <CustomTooltip placement="top" tooltipId="terminalClearTerminal" tooltipClasses="text-nowrap" tooltipText={<FormattedMessage id="terminal.clearConsole" />}>
        <i className="fas fa-ban" aria-hidden="true"></i>
      </CustomTooltip>
    </div>
  </div>)
}
