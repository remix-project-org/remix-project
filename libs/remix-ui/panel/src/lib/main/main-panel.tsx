/* eslint-disable no-unused-expressions */
import React, {useContext, useEffect, useRef, useState} from 'react' // eslint-disable-line
import DragBar from '../dragbar/dragbar'
import RemixUIPanelPlugin from '../plugins/panel-plugin'
import { PluginRecord } from '../types'
import { appPlatformTypes, platformContext } from '@remix-ui/app'
import './main-panel.css'

export type RemixUIMainPanelProps = {
  layout: any
}

const RemixUIMainPanel = (props: RemixUIMainPanelProps) => {
  const platform = useContext(platformContext)
  const { layout } = props
  const [plugins, setPlugins] = useState<PluginRecord[]>([])
  const [terminalVisible, setTerminalVisible] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const mainPanelRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const bottomBarRef = useRef<HTMLDivElement>(null)

  const refs = [tabsRef, editorRef, mainPanelRef, terminalRef]

  const renderPanels = () => {
    if (layout.panels) {
      const pluginPanels: PluginRecord[] = []
      Object.values(layout.panels).map((panel: any) => {
        pluginPanels.push({
          profile: panel.plugin.profile,
          active: panel.active,
          view: panel.plugin.profile.name === 'tabs' ? panel.plugin.renderTabsbar() : panel.plugin.render(),
          class: panel.plugin.profile.name + '-wrap ' + (panel.minimized ? 'minimized ' : ' ') + ((platform === appPlatformTypes.desktop)? 'desktop' : ''),
          minimized: panel.minimized,
          pinned: panel.pinned
        })
      })
      setPlugins(pluginPanels)
    }
  }

  useEffect(() => {
    renderPanels()
    layout.event.on('change', () => {
      renderPanels()
    })

    return () => {
      layout.event.off('change')
    }
  }, [])

  useEffect(() => {
    // Watch for terminal visibility changes
    const checkTerminalVisibility = () => {
      if (terminalRef.current) {
        const isHidden = terminalRef.current.classList.contains('d-none') || terminalRef.current.classList.contains('minimized')
        setTerminalVisible(!isHidden)
      }
    }

    // Initial check
    checkTerminalVisibility()

    // Watch for class changes on terminal
    const observer = new MutationObserver(checkTerminalVisibility)
    if (terminalRef.current) {
      observer.observe(terminalRef.current, {
        attributes: true,
        attributeFilter: ['class']
      })
    }

    return () => observer.disconnect()
  }, [plugins])

  const showTerminal = (hide: boolean) => {
    layout.panels.terminal.minimized = hide
    layout.event.emit('change', layout.panels)
    layout.emit('change', layout.panels)
  }

  const resize = (height: number) => {
    syncBottomBarPosition()
    layout.emit('resize', height)
  }

  const syncBottomBarPosition = () => {
    if (terminalRef.current && bottomBarRef.current && mainPanelRef.current && !layout.panels.terminal.minimized) {
      const bottomBarElement = bottomBarRef.current
      const terminalElement = terminalRef.current
      const mainPanelElement = mainPanelRef.current

      const bottomBarHeight = bottomBarElement.offsetHeight;

      if (editorRef.current) {
        const dragBarHeight = 8
        const newEditorHeight = mainPanelElement.offsetHeight - terminalElement.offsetHeight - bottomBarHeight - dragBarHeight
        editorRef.current.style.height = `${newEditorHeight}px`
      }
    } else if (bottomBarRef.current) {
      bottomBarRef.current.style.visibility = 'hidden'
      if (editorRef.current && mainPanelRef.current && bottomBarRef.current) {
        editorRef.current.style.height = `${mainPanelRef.current.offsetHeight - bottomBarRef.current.offsetHeight}px`
      }
    }
  }

  return (
    <div className="mainview" ref={mainPanelRef}>
      {Object.values(plugins).map((pluginRecord, i) => {
        let panelRef = refs[i]
        if (pluginRecord.profile.name === 'terminal') {
          panelRef = terminalRef
        } else if (pluginRecord.profile.name === 'bottomBar') {
          panelRef = bottomBarRef
        }

        return (
          <React.Fragment key={`mainView${i}`}>
            {pluginRecord.profile.name === 'terminal' && terminalVisible ? (
              <DragBar key="dragbar-terminal" onResize={resize} hidden={!terminalVisible} setHideStatus={showTerminal} refObject={terminalRef}></DragBar>
            ) : null}
            <RemixUIPanelPlugin ref={panelRef} key={pluginRecord.profile.name} pluginRecord={pluginRecord} />
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default RemixUIMainPanel
