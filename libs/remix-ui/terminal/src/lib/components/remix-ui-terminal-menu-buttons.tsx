import React, { useContext, useEffect } from 'react' // eslint-disable-line
import { appPlatformTypes, platformContext } from '@remix-ui/app'
import { TerminalContext } from '../context'
import { RemixUiTerminalProps, SET_OPEN } from '../types/terminalTypes'
import './remix-ui-terminal-menu-buttons.css'

export const RemixUITerminalMenuButtons = (props: RemixUiTerminalProps) => {
  const { xtermState, dispatchXterm, terminalState, dispatch } = useContext(TerminalContext)
  const platform = useContext(platformContext)

  function selectOutput(event: any): void {
    props.plugin.call('layout', 'minimize', props.plugin.profile.name, false)
    dispatchXterm({ type: 'SHOW_OUTPUT', payload: true })
    dispatch({ type: SET_OPEN, payload: true })
  }

  const showTerminal = async(event: any): Promise<void> => {
    props.plugin.call('layout', 'minimize', props.plugin.profile.name, false)
    if ( xtermState.terminals.length === 0) {
      const start_time = Date.now()
      const pid = await props.plugin.call('xterm', 'createTerminal', xtermState.workingDir, null)
      const end_time = Date.now()
      console.log(`createTerminal took ${end_time - start_time} ms`)
      dispatchXterm({ type: 'HIDE_ALL_TERMINALS', payload: null })
      dispatchXterm({ type: 'SHOW_OUTPUT', payload: false })
      dispatchXterm({ type: 'ADD_TERMINAL', payload: { pid, queue: '', timeStamp: Date.now(), ref: null, hidden: false } })
    } else {
      dispatchXterm({ type: 'SHOW_OUTPUT', payload: false })
    }
    dispatch({ type: SET_OPEN, payload: true })
  }

  return (
    <div className='d-flex flex-row align-items-center'>
      <button id="tabOutput" data-id="tabOutput" className={`xtermButton btn btn-sm border-secondary me-2 border ${!xtermState.showOutput ? '' : 'd-flex btn-secondary'}`} onClick={selectOutput}>
        Output
      </button>
      <button data-id="tabXTerm" id="tabXTerm" className={`xtermButton btn btn-sm border-secondary ${(xtermState.terminalsEnabled || platform === appPlatformTypes.desktop) ? 'd-block' : 'd-none'} ${xtermState.showOutput ? '' : 'btn-secondary'}`}
        onClick={async(e) => await showTerminal(e)}>
        <span className="far fa-terminal border-0 ms-1"></span>
      </button>
    </div>
  )
}