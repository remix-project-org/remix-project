import { appPlatformTypes, platformContext } from '@remix-ui/app'
import { RemixUiXterminals, xTerminInitialState, xtermReducer } from '@remix-ui/xterm'
import React, { useContext, useReducer } from 'react' // eslint-disable-line
import { RemixUITerminalBar } from './components/remix-ui-terminal-bar'
import { TerminalContext } from './context'
import { initialState, registerCommandReducer } from './reducers/terminalReducer'
import RemixUiTerminal from './remix-ui-terminal'
import { RemixUiTerminalProps } from './types/terminalTypes'

export const RemixUITerminalWrapper = (props: RemixUiTerminalProps) => {
  const [terminalState, dispatch] = useReducer(registerCommandReducer, initialState)
  const [xtermState, dispatchXterm] = useReducer(xtermReducer, xTerminInitialState)
  const platform = useContext(platformContext)
  const providerState = {
    terminalState,
    dispatch,
    xtermState,
    dispatchXterm
  }

  return (<>
    <TerminalContext.Provider value={providerState}>
      <RemixUITerminalBar {...props} />
      {platform !== appPlatformTypes.desktop && <RemixUiTerminal {...props} />}
      {platform === appPlatformTypes.desktop &&
        <>
          <RemixUiTerminal visible={xtermState.showOutput} plugin={props.plugin} onReady={props.onReady} isDebugging={props.isDebugging} debuggerCallStack={props.debuggerCallStack} />
          <RemixUiXterminals {...props} />
        </>
      }
    </TerminalContext.Provider>
  </>)
}