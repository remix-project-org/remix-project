import { appPlatformTypes, platformContext } from '@remix-ui/app'
import { CustomTooltip } from '@remix-ui/helper'
import React, { useState, useEffect, useRef, useContext } from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import { listenOnNetworkAction } from '../actions/terminalAction'
import { TerminalContext } from '../context'
import { RemixUiTerminalProps } from '../types/terminalTypes'
import { RemixUITerminalMenu } from './remix-ui-terminal-menu'
import { RemixUITerminalMenuToggle } from './remix-ui-terminal-menu-toggle'
import { RemixUIXtermMenu } from '../../../../xterm/src/lib/components/remix-ui-terminal-menu-xterm'
import { RemixUITerminalMenuButtons } from './remix-ui-terminal-menu-buttons'

export const RemixUITerminalBar = (props: RemixUiTerminalProps) => {
  const { terminalState, xtermState } = useContext(TerminalContext)
  const platform = useContext(platformContext)
  const intl = useIntl()
  const terminalMenu = useRef(null)

  useEffect(() => {
    props.plugin.call('layout', 'minimize', props.plugin.profile.name, !terminalState.isOpen)
  }, [terminalState.isOpen])

  return (<>
    <div className="remix_ui_terminal_bar d-flex">
      <div
        className="remix_ui_terminal_menu d-flex w-100 align-items-center position-relative border-top border-dark"
        ref={terminalMenu}
        data-id="terminalToggleMenu"
      >
        {platform === appPlatformTypes.desktop ?
          <div className='d-flex flex-row w-100 justify-content-end align-items-center'>
            <RemixUITerminalMenuButtons {...props} />
            {xtermState.showOutput? <RemixUITerminalMenu {...props} />: <RemixUIXtermMenu {...props} />}
            <RemixUITerminalMenuToggle {...props} />
          </div> :
          <div className='d-flex flex-row w-100 justify-content-end align-items-center'>
            <RemixUITerminalMenu {...props} />
            <RemixUITerminalMenuToggle {...props} />
          </div>
        }
      </div>
    </div></>
  )
}