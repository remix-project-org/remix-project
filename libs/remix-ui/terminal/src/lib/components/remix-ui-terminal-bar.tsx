import { appPlatformTypes, platformContext } from '@remix-ui/app'
import React, { useState, useEffect, useRef, useContext } from 'react' // eslint-disable-line
import { TerminalContext } from '../context'
import { RemixUiTerminalProps } from '../types/terminalTypes'
import { RemixUITerminalMenu } from './remix-ui-terminal-menu'
import { RemixUITerminalMenuToggle } from './remix-ui-terminal-menu-toggle'
import { RemixUITerminalMenuMaximize } from './remix-ui-terminal-menu-maximize'
import { RemixUIXtermMenu } from '../../../../xterm/src/lib/components/remix-ui-terminal-menu-xterm'
import { RemixUITerminalMenuButtons } from './remix-ui-terminal-menu-buttons'
import { RemixUITerminalMenuClear } from './remix-ui-terminal-menu-clear'

export const RemixUITerminalBar = (props: RemixUiTerminalProps) => {
  const { terminalState, xtermState } = useContext(TerminalContext)
  const platform = useContext(platformContext)
  const terminalMenu = useRef(null)
  const [isDebuggerActive, setIsDebuggerActive] = useState(false)

  useEffect(() => {
    props.plugin.call('layout', 'minimize', props.plugin.profile.name, !terminalState.isOpen)
  }, [terminalState.isOpen])

  useEffect(() => {
    // Check if debugger is active
    const checkDebuggerActive = async () => {
      try {
        const active = await props.plugin.call('sidePanel', 'currentFocus')
        const isDebuggerFocused = active === 'debugger'
        setIsDebuggerActive(isDebuggerFocused)
      } catch (err) {
        console.error('Failed to check debugger active state', err)
      }
    }

    checkDebuggerActive()

    // Listen for plugin activation/deactivation
    const onPluginActivated = (name: string) => {
      const isDebugger = name === 'debugger'
      setIsDebuggerActive(isDebugger)
    }

    // Listen to focusChanged which fires when user switches plugins
    props.plugin.on('sidePanel', 'focusChanged', onPluginActivated)
    props.plugin.on('sidePanel', 'pluginDisabled', onPluginActivated)

    return () => {
      props.plugin.off('sidePanel', 'focusChanged', onPluginActivated)
      props.plugin.off('sidePanel', 'pluginDisabled', onPluginActivated)
    }
  }, [props.plugin])

  // Re-check if debugger is active when isDebugging changes
  useEffect(() => {
    if (props.isDebugging) {
      const checkDebuggerActive = async () => {
        try {
          // Add a small delay to allow the debugger to activate
          await new Promise(resolve => setTimeout(resolve, 100))
          const active = await props.plugin.call('sidePanel', 'currentFocus')
          setIsDebuggerActive(active === 'debugger')
        } catch (err) {
          console.error('Failed to check debugger active state on debugging change', err)
        }
      }
      checkDebuggerActive()
    } else {
      // When debugging stops, reset the active state
      setIsDebuggerActive(false)
    }
  }, [props.isDebugging, props.plugin])

  // Show "Execution trace" title when debugging
  const showExecutionTrace = props.isDebugging && isDebuggerActive

  return (<>
    <div className="remix_ui_terminal_bar d-flex">
      <div
        className="remix_ui_terminal_menu d-flex w-100 align-items-center position-relative border-top border-dark"
        ref={terminalMenu}
        data-id="terminalToggleMenu"
      >
        {showExecutionTrace ? (
          // Only show "Execution trace" title when debugging
          <div className="d-flex align-items-center ps-3">
            <h6 className="m-0" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--bs-body-color)', lineHeight: '1.5rem' }}>Execution trace</h6>
          </div>
        ) : (
          // Show regular terminal menu when not debugging
          // left: contextual info & filtering (tx count, listen on network, search)
          // right: action controls (clear, output/xterm tabs, maximize, minimize)
          <>
            {platform === appPlatformTypes.desktop ?
              <div className='d-flex flex-row w-100 justify-content-between align-items-center'>
                <div className='d-flex flex-row align-items-center remix_ui_terminal_menu_leftgroup'>
                  {xtermState.showOutput ? <RemixUITerminalMenu {...props} /> : <RemixUIXtermMenu {...props} />}
                </div>
                <div className='d-flex flex-row align-items-center remix_ui_terminal_menu_right'>
                  <RemixUITerminalMenuButtons {...props} />
                  {xtermState.showOutput && <RemixUITerminalMenuClear {...props} />}
                  <RemixUITerminalMenuMaximize {...props} />
                  <RemixUITerminalMenuToggle {...props} />
                </div>
              </div> :
              <div className='d-flex flex-row w-100 justify-content-between align-items-center'>
                <div className='d-flex flex-row align-items-center remix_ui_terminal_menu_leftgroup'>
                  <RemixUITerminalMenu {...props} />
                </div>
                <div className='d-flex flex-row align-items-center remix_ui_terminal_menu_right'>
                  <RemixUITerminalMenuClear {...props} />
                  <RemixUITerminalMenuMaximize {...props} />
                  <RemixUITerminalMenuToggle {...props} />
                </div>
              </div>
            }
          </>
        )}
      </div>
    </div></>
  )
}