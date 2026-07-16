import { fileDecoration, FileDecorationIcons } from '@remix-ui/file-decorators'
import { CustomTooltip } from '@remix-ui/helper'
import { Plugin } from '@remixproject/engine'

import React, { useState, useRef, useEffect, useReducer, useContext, useCallback } from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs'
import './remix-ui-tabs.css'
import { QuickDappBanner } from './components/QuickDappBanner'
// AIRequestForm import removed — DApp creation now goes through AI Assistant chatPipe
import { values } from 'lodash'
import { AppContext } from '@remix-ui/app'
import { useAuth } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'
import { desktopConnectionType, Features } from '@remix-api'
import isElectron from 'is-electron'
import { CompileDropdown, RunScriptDropdown, EmptyDropdown, AmpSqlDropdown } from '@remix-ui/tabs'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import TabProxy from 'apps/remix-ide/src/app/panels/tab-proxy'

/* eslint-disable-next-line */
export interface TabsUIProps {
  tabs: Array<Tab>
  plugin: TabProxy
  onSelect: (index: number) => void
  onClose: (index: number) => void
  onZoomOut: () => void
  onZoomIn: () => void
  onReady: (api: any) => void
  themeQuality: string
  maximize: boolean
  isDebugging?: boolean
  canRunScenario: boolean
}

export interface Tab {
  id: string
  icon: string
  iconClass: string
  name: string
  title: string
  tooltip: string
  show: boolean
}
export interface TabsUIApi {
  activateTab: (name: string) => void
  active: () => string
}
interface ITabsState {
  selectedIndex: number
  fileDecorations: fileDecoration[]
  currentExt: string
  name: string
}
interface ITabsAction {
  type: string
  payload: any
  ext?: string
  name?: string
}

const initialTabsState: ITabsState = {
  selectedIndex: -1,
  fileDecorations: [],
  currentExt: '',
  name: ''
}

const QUICKDAPP_SUBGRAPH_SETUP_OPTION = '- Subgraph: None (default) or a .subgraph file path/name'
const QUICKDAPP_SUBGRAPH_SETUP_RULE = 'Subgraph defaults to None. If I choose to use a .subgraph, ask me for the .subgraph file path/name and pass it to generate_dapp as subgraphFilePath. Do not redirect me to the .subgraph context menu and do not invent graphContext.'
const QUICKDAPP_GRAPH_CONTEXT_TOOL_ARG = '- subgraphFilePath: include only if I chose a .subgraph file path/name; graphContext: include only if a validated graphContext was already provided by The Graph handoff'
const QUICKDAPP_SCOPE_NOTICE = 'When asking setup options, briefly state this scope once: "QuickDApp publishes a browser-based static frontend. It does not provide a server runtime or secret storage, and selected contract bindings are fixed after creation."'

const tabsReducer = (state: ITabsState, action: ITabsAction) => {
  switch (action.type) {
  case 'SELECT_INDEX':
    return {
      ...state,
      currentExt: action.ext,
      selectedIndex: action.payload,
      name: action.name
    }
  case 'SET_FILE_DECORATIONS':
    return {
      ...state,
      fileDecorations: action.payload as fileDecoration[]
    }
  default:
    return state
  }
}
const PlayExtList = ['js', 'ts', 'sol', 'circom', 'vy', 'nr', 'yul', 'sql', 'subgraph']

export const TabsUI = (props: TabsUIProps) => {

  const [tabsState, dispatch] = useReducer(tabsReducer, initialTabsState)
  const currentIndexRef = useRef(-1)
  const tabsRef = useRef({})
  const tabsElement = useRef(null)
  const [ai_switch, setAI_switch] = useState<boolean>(true)
  const [bannerVisible, setBannerVisible] = useState<boolean>(true)
  const tabs = useRef(props.tabs)
  tabs.current = props.tabs // we do this to pass the tabs list to the onReady callbacks
  const appContext = useContext(AppContext)
  const { features } = useAuth()
  const { trackMatomoEvent } = useContext(TrackingContext)
  const canRunScenario = props.canRunScenario

  const compileSeq = useRef(0)
  const compileWatchdog = useRef<number | null>(null)
  const settledSeqRef = useRef<number>(0)

  const [compileState, setCompileState] = useState<'idle' | 'compiling' | 'compiled'>('idle')

  const isVegaVisualization = tabsState.name && tabsState.name.indexOf('amp/vega-specs/') !== -1 && tabsState.currentExt === 'json'

  useEffect(() => {
    if (props.tabs[tabsState.selectedIndex] && props.tabs[tabsState.selectedIndex].show) {
      tabsRef.current[tabsState.selectedIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
  }, [tabsState.selectedIndex])

  useEffect(() => {
    // Removed pluginIsClosed listener as the event is no longer emitted
  }, [])

  // Toggle the copilot in editor when clicked to update in status bar
  useEffect(() => {
    const run = async () => {
      props.plugin.on('settings', 'copilotChoiceUpdated', async (isChecked) => {
        setAI_switch(isChecked)
      })
    }
    if (tabsState.currentExt === 'sol') run()
  }, [tabsState.currentExt])

  const getAI = async () => {
    try {
      const init_state = await props.plugin.call('settings', 'getCopilotSetting')
      if (init_state === undefined || init_state === null) {
        await props.plugin.call('settings', 'updateCopilotChoice', ai_switch)
        return ai_switch
      }
      return init_state
    } catch (e) {
      return false
    }
  }

  const getFileDecorationClasses = (tab: any) => {
    const fileDecoration = tabsState.fileDecorations.find((fileDecoration: fileDecoration) => {
      if (`${fileDecoration.workspace.name}/${fileDecoration.path}` === tab.name) return true
    })
    return fileDecoration && fileDecoration.fileStateLabelClass
  }

  const getFileDecorationIcons = (tab: any) => {
    return <FileDecorationIcons file={{ path: tab.name }} fileDecorations={tabsState.fileDecorations} />
  }

  const renderTab = (tab: Tab, index) => {
    const classNameImg = 'my-1 me-1 text-dark ' + tab.iconClass
    const classNameTab = 'nav-item nav-link d-flex justify-content-center align-items-center px-2 py-1 tab' + (index === currentIndexRef.current ? ' active' : '')
    const invert = props.themeQuality === 'dark' ? 'invert(1)' : 'invert(0)'

    const handleTabMouseDown = (event: React.MouseEvent, tabIndex: number) => {
      if (event.button === 1) {
        event.preventDefault()
        event.stopPropagation()
        props.onClose(tabIndex)
      }
    }

    return (
      <CustomTooltip tooltipId="tabsActive" tooltipText={tab.tooltip} placement="bottom-start">
        <div
          ref={(el) => {
            tabsRef.current[index] = el
          }}
          className={classNameTab}
          data-id={index === currentIndexRef.current ? 'tab-active' : ''}
          data-path={tab.name}
          onMouseDown={(event) => handleTabMouseDown(event, index)}
        >
          {tab.icon ? <img className="my-1 me-1 iconImage" src={tab.icon} /> : <i className={classNameImg}></i>}
          <span className={`title-tabs ${getFileDecorationClasses(tab)}`}>{tab.title}</span>
          {getFileDecorationIcons(tab)}
          <span
            className="close-tabs"
            data-id={`close_${tab.name}`}
            onClick={(event) => {
              props.onClose(index)
              event.stopPropagation()
            }}
          >
            <i className="text-dark fas fa-times"></i>
          </span>
        </div>
      </CustomTooltip>
    )
  }

  const active = () => {
    if (currentIndexRef.current < 0) return ''
    if (!tabs.current[currentIndexRef.current]) return ''
    return tabs.current[currentIndexRef.current].name
  }

  const activateTab = (name: string) => {
    const index = tabs.current.findIndex((tab) => tab.name === name)
    currentIndexRef.current = index
    const ext = getExt(name)
    props.plugin.emit('extChanged', ext)
    dispatch({ type: 'SELECT_INDEX', payload: index, ext: getExt(name), name })
  }

  const setFileDecorations = (fileStates: fileDecoration[]) => {
    getAI().then(value => setAI_switch(value)).catch(error => console.log(error))
    dispatch({ type: 'SET_FILE_DECORATIONS', payload: fileStates })
  }

  const transformScroll = (event) => {
    if (!event.deltaY) {
      return
    }

    event.currentTarget.scrollLeft += event.deltaY + event.deltaX
    event.preventDefault()
  }

  useEffect(() => {
    props.onReady({
      activateTab,
      active,
      setFileDecorations
    })
    return () => {
      if (tabsElement.current) tabsElement.current.removeEventListener('wheel', transformScroll)
    }
  }, [])

  const getExt = (path) => {
    const root = path.split('#')[0].split('?')[0]
    const ext = root.indexOf('.') !== -1 ? /[^.]+$/.exec(root) : null
    if (ext) return ext[0].toLowerCase()
    else return ''
  }

  useEffect(() => {
    setCompileState('idle')
  }, [tabsState.selectedIndex])

  useEffect(() => {
    if (!props.plugin || tabsState.selectedIndex < 0) return

    const currentPath = props.tabs[tabsState.selectedIndex]?.name
    if (!currentPath) return

    const listener = (path: string) => {
      if (currentPath.endsWith(path)) {
        setCompileState('idle')
      }
    }

    props.plugin.on('editor', 'contentChanged', listener)

    return () => {
      props.plugin.off('editor', 'contentChanged')
    }
  }, [tabsState.selectedIndex, props.plugin, props.tabs])

  const handleCompileAndPublish = async (storageType: 'ipfs' | 'swarm') => {
    setCompileState('compiling')

    await props.plugin.call('manager', 'activatePlugin', 'solidity')
    await props.plugin.call('menuicons', 'select', 'solidity')
    try {
      await props.plugin.call('solidity', 'compile', active().substr(active().indexOf('/') + 1, active().length))
      trackMatomoEvent?.({
        category: 'editor',
        action: 'publishFromEditor',
        name: storageType,
        isClick: true
      })

      setTimeout(async () => {
        let buttonId
        if (storageType === 'ipfs') {
          buttonId = 'publishOnIpfs'
        } else {
          buttonId = 'publishOnSwarm'
        }

        const buttonToClick = document.getElementById(buttonId)

        if (buttonToClick) {
          buttonToClick.click()
        } else {
          await props.plugin.call('notification', 'toast', `Compilation failed, skipping 'Publish'.`)
          await props.plugin.call('manager', 'activatePlugin', 'solidity')
          await props.plugin.call('menuicons', 'select', 'solidity')
        }
      }, 500)

    } catch (e) {
      console.error(e)
      await props.plugin.call('notification', 'toast', `Compilation failed, skipping 'Publish'.`)
      await props.plugin.call('manager', 'activatePlugin', 'solidity')
      await props.plugin.call('menuicons', 'select', 'solidity')
    }

    setCompileState('idle')
  }

  const handleRunScript = async (runnerKey: string) => {
    if (runnerKey === 'new_script') {
      try {
        const path = 'scripts'
        let newScriptPath = `${path}/new_script.ts`
        let counter = 1

        while (await props.plugin.call('fileManager', 'exists', newScriptPath)) {
          newScriptPath = `${path}/new_script_${counter}.ts`
          counter++
        }

        const boilerplateContent = `// This script can be used to deploy and interact with your contracts.
//
// See the Remix documentation for more examples:
// https://remix-ide.readthedocs.io/en/latest/running_js_scripts.html

(async () => {
    try {
        console.log('Running script...')
    } catch (e) {
        console.error(e.message)
    }
})()`

        await props.plugin.call('fileManager', 'writeFile', newScriptPath, boilerplateContent)
        trackMatomoEvent?.({
          category: 'editor',
          action: 'runScript',
          name: 'new_script',
          isClick: true
        })
      } catch (e) {
        console.error(e)
        props.plugin.call('notification', 'toast', `Error creating new script: ${e.message}`)
      }
      return
    }

    const path = active().substr(active().indexOf('/') + 1)
    if (!path || !PlayExtList.includes(getExt(path))) {
      props.plugin.call('notification', 'toast', 'A runnable file (.js, .ts) must be selected.')
      return
    }

    try {
      setCompileState('compiling')

      const configurations = await props.plugin.call('scriptRunnerBridge', 'getConfigurations')

      const selectedConfig = configurations.find(c => c.name === runnerKey)
      if (!selectedConfig) {
        throw new Error(`Runner configuration "${runnerKey}" not found.`)
      }

      await props.plugin.call('scriptRunnerBridge', 'selectScriptRunner', selectedConfig)

      const content = await props.plugin.call('fileManager', 'readFile', path)
      await props.plugin.call('scriptRunnerBridge', 'execute', content, path)

      setCompileState('compiled')
      trackMatomoEvent?.({
        category: 'editor',
        action: 'runScriptWithEnv',
        name: runnerKey,
        isClick: true
      })
    } catch (e) {
      console.error(e)
      props.plugin.call('notification', 'toast', `Error running script: ${e.message}`)
      setCompileState('idle')
    }
  }

  const waitForFreshCompilationResult = async (
    mySeq: number,
    targetPath: string,
    startMs: number,
    maxWaitMs = 1500,
    intervalMs = 120
  ) => {
    const norm = (p: string) => p.replace(/^\/+/, '')
    const fileName = norm(targetPath).split('/').pop() || norm(targetPath)

    const hasFile = (res: any) => {
      if (!res) return false
      const byContracts =
        res.contracts && typeof res.contracts === 'object' &&
        Object.keys(res.contracts).some(k => k.endsWith(fileName) || norm(k) === norm(targetPath))
      const bySources =
        res.sources && typeof res.sources === 'object' &&
        Object.keys(res.sources).some(k => k.endsWith(fileName) || norm(k) === norm(targetPath))
      return byContracts || bySources
    }

    let last: any = null
    const until = startMs + maxWaitMs
    while (Date.now() < until) {
      if (mySeq !== compileSeq.current) return null
      try {
        const res = await props.plugin.call('solidity', 'getCompilationResult')
        last = res
        const ts = (res && (res.timestamp || res.timeStamp || res.time || res.generatedAt)) || null
        const isFreshTime = typeof ts === 'number' ? ts >= startMs : true
        if (res && hasFile(res) && isFreshTime) return res
      } catch {}
      await new Promise(r => setTimeout(r, intervalMs))
    }
    return last
  }

  const attachCompilationListener = (compilerName: string, mySeq: number, path: string, startedAt: number) => {
    try { props.plugin.off(compilerName, 'compilationFinished') } catch {}

    const onFinished = async (_success: boolean) => {
      if (mySeq !== compileSeq.current || settledSeqRef.current === mySeq) return

      if (compileWatchdog.current) {
        clearTimeout(compileWatchdog.current)
        compileWatchdog.current = null
      }

      const fresh = await waitForFreshCompilationResult(mySeq, path, startedAt)

      if (!fresh) {
        setCompileState('idle')
        await props.plugin.call('manager', 'activatePlugin', 'solidity')
        await props.plugin.call('menuicons', 'select', 'solidity')
      } else {
        const errs = Array.isArray(fresh.errors) ? fresh.errors.filter((e: any) => (e.severity || e.type) === 'error') : []
        if (errs.length > 0) {
          setCompileState('idle')
          await props.plugin.call('manager', 'activatePlugin', 'solidity')
          await props.plugin.call('menuicons', 'select', 'solidity')
        } else {
          setCompileState('compiled')
        }
      }
      settledSeqRef.current = mySeq
      try { props.plugin.off(compilerName, 'compilationFinished') } catch {}
    }
    props.plugin.on(compilerName, 'compilationFinished', onFinished)
  }

  const handleRunScenario = async () => {
    try {
      const currentFile = await props.plugin.call('fileManager', 'getCurrentFile')
      if (!currentFile) {
        await props.plugin.call('notification', 'toast', 'No file selected.')
        return
      }
      setCompileState('compiling')
      await props.plugin.call('udappTransactions', 'runScenario', currentFile)
      setCompileState('compiled')
    } catch (error) {
      console.error('Error running scenario:', error)
      await props.plugin.call('notification', 'toast', `Error running scenario: ${error.message}`)
      setCompileState('idle')
    }
  }

  const handleCompileClick = async () => {
    if (canRunScenario) {
      await handleRunScenario()
      return
    }

    setCompileState('compiling')
    trackMatomoEvent?.({
      category: 'editor',
      action: 'clickRunFromEditor',
      name: tabsState.currentExt,
      isClick: true
    })

    try {
      const activePathRaw = active()
      if (!activePathRaw || activePathRaw.indexOf('/') === -1) {
        setCompileState('idle')
        props.plugin.call('notification', 'toast', 'No file selected.')
        return
      }
      const path = activePathRaw.substr(activePathRaw.indexOf('/') + 1)

      if (tabsState.currentExt === 'js' || tabsState.currentExt === 'ts') {
        try {
          const content = await props.plugin.call('fileManager', 'readFile', path)
          await props.plugin.call('scriptRunnerBridge', 'execute', content, path)
          setCompileState('compiled')
        } catch (e) {
          console.error(e)
          props.plugin.call('notification', 'toast', `Script error: ${e.message}`)
          setCompileState('idle')
        }
        return
      }

      if (tabsState.currentExt === 'sql') {
        try {
          const content = await props.plugin.call('fileManager', 'readFile', path)
          const authToken: string | undefined = await props.plugin.call('config', 'getEnv', 'AMP_QUERY_TOKEN');
          const baseUrl: string | undefined = await props.plugin.call('config', 'getEnv', 'AMP_QUERY_URL');
          // Perform the Amp query
          props.plugin.call('notification', 'toast', 'Performing the query...')
          const data = await props.plugin.call('amp', 'performAmpQuery', content, baseUrl, authToken)
          const result = {
            query: content,
            data
          }
          const resultPath = `./amp/results/query-${Date.now()}.json`
          await props.plugin.call('fileManager', 'writeFile', resultPath, JSON.stringify(result, null, '\t'))
          props.plugin.call('notification', 'toast',`Query done. Result has been added to ${resultPath}`)
          setCompileState('compiled')
        } catch (e) {
          console.error(e)
          props.plugin.call('notification', 'toast', `SQL error: ${e.message}`)
          setCompileState('idle')
        }
        return
      }

      if (tabsState.currentExt === 'subgraph') {
        try {
          props.plugin.call('notification', 'toast', 'Running subgraph query...')
          await props.plugin.call('thegraph', 'runSubgraphFile', path)
          setCompileState('compiled')
        } catch (e) {
          console.error(e)
          props.plugin.call('notification', 'toast', `Subgraph error: ${e.message}`)
          setCompileState('idle')
        }
        return
      }

      if (isVegaVisualization) {
        try {
          const file = await props.plugin.call('fileManager', 'getCurrentFile')
          await props.plugin.call('vega', 'generateVisualization', file)
        } catch (e) {
          props.plugin.call('terminal', 'log', { type: 'error', value: e.message })
        }
      }

      const compilerName = {
        sol: 'solidity',
        yul: 'solidity',
        vy: 'vyper',
        circom: 'circuit-compiler',
        nr: 'noir-compiler'
      }[tabsState.currentExt]

      if (!compilerName) {
        setCompileState('idle')
        return
      }

      await props.plugin.call('fileManager', 'saveCurrentFile')
      try {
        await props.plugin.call('manager', 'activatePlugin', compilerName)
      } catch (e: any) {
        const isNoir = compilerName === 'noir-compiler'
        const isAlreadyRendered = typeof e.message === 'string' && e.message.includes('already rendered')

        if (isNoir && isAlreadyRendered) {
          console.warn('Noir plugin is already active, skipping activation to proceed with compilation.')
        } else {
          throw e
        }
      }

      const mySeq = ++compileSeq.current
      const startedAt = Date.now()

      attachCompilationListener(compilerName, mySeq, path, startedAt)

      if (compileWatchdog.current) clearTimeout(compileWatchdog.current)
      compileWatchdog.current = window.setTimeout(async () => {
        if (mySeq !== compileSeq.current || settledSeqRef.current === mySeq) return
        const maybe = await props.plugin.call('solidity', 'getCompilationResult').catch(() => null)
        if (maybe) {
          const fresh = await waitForFreshCompilationResult(mySeq, path, startedAt, 400, 120)
          if (fresh) {
            const errs = Array.isArray(fresh.errors) ? fresh.errors.filter((e: any) => (e.severity || e.type) === 'error') : []
            setCompileState(errs.length ? 'idle' : 'compiled')
            if (errs.length) {
              await props.plugin.call('manager', 'activatePlugin', compilerName)
              await props.plugin.call('menuicons', 'select', compilerName)
            }
            settledSeqRef.current = mySeq
            return
          }
        }
        setCompileState('idle')
        await props.plugin.call('manager', 'activatePlugin', compilerName)
        await props.plugin.call('menuicons', 'select', compilerName)
        settledSeqRef.current = mySeq
        try { props.plugin.off(compilerName, 'compilationFinished') } catch {}
      }, 3000)

      if (tabsState.currentExt === 'vy') {
        await props.plugin.call(compilerName, 'vyperCompileCustomAction')
      } else {
        await props.plugin.call(compilerName, 'compile', path).catch((error) => {
          props.plugin.call('notification', 'toast', error.message)
        })
      }

    } catch (e) {
      console.error(e)
      setCompileState('idle')
    }
  }

  const onNotify = (text: string, duration?: number) => {
    props.plugin.call('notification', 'toast', text, duration)
  }

  const handleQuickDappBannerClose = () => {
    setBannerVisible(false)
  }

  const handleQuickDappStartNow = async () => {
    // Permission gate: non-beta users see the QuickDapp lock screen
    const quickdappFeature = features?.[Features.DAPP_QUICKDAPP]
    if (!quickdappFeature?.is_enabled) {
      try {
        await props.plugin.call('manager', 'activatePlugin', 'quick-dapp-v2')
        await props.plugin.call('tabs' as any, 'focus', 'quick-dapp-v2')
      } catch (e) { /* best-effort */ }
      return
    }

    const currentFile = tabsState.name
    const currentFileName = currentFile?.split('/').pop() || ''

    // Guard: Block DApp creation from within a DApp workspace
    try {
      const currentWs = await props.plugin.call('filePanel', 'getCurrentWorkspace')
      if (currentWs?.name?.startsWith('dapp-')) {
        props.plugin.call('notification', 'toast',
          'DApp generation is not available from a DApp workspace. Please switch to your contract workspace first.'
        )
        return
      }
    } catch (e) { /* proceed if check fails */ }

    // Check if running in desktop mode - dapps should be created inline
    const isDesktop = isElectron()

    // Build the richest context we can — silently, no modals
    const contextParts: string[] = [QUICKDAPP_SCOPE_NOTICE, '']
    let instances: any[] = []

    // 1. Gather deployed contracts silently
    try {
      instances = await props.plugin.call('udappDeployedContracts', 'getDeployedContracts') || []
    } catch (e) {
      console.warn('[QuickDapp] Could not fetch deployed contracts:', e)
    }

    // 2. Try to match contracts to the current file
    let matchingInstances: any[] = []
    if (currentFileName && instances.length > 0) {
      matchingInstances = instances.filter((inst: any) => {
        const instFile = inst.contractData?.contract?.file || inst.filePath || ''
        return instFile && instFile.endsWith(currentFileName)
      })
      if (matchingInstances.length === 0) {
        const baseName = currentFileName.replace('.sol', '')
        matchingInstances = instances.filter((inst: any) =>
          baseName.toLowerCase().includes(inst.name?.toLowerCase())
        )
      }
    }

    // 3. Build context-aware prompt
    if (matchingInstances.length === 1) {
      // Best case: exactly one matching deployed contract
      const inst = matchingInstances[0]
      let chainId: string
      try {
        const providerObject = await props.plugin.call('blockchain', 'getProviderObject')
        const providerName = providerObject?.name || 'vm-unknown'
        if (providerName.startsWith('vm')) {
          chainId = providerName
        } else {
          const network = await props.plugin.call('network', 'detectNetwork')
          chainId = network?.id?.toString() || providerName
        }
      } catch (e) {
        chainId = 'unknown'
      }

      if (isDesktop) {
        // Desktop mode: always create inline
        contextParts.push(
          `I want to create a DApp frontend inline in the /frontend folder of my current workspace. Follow these steps exactly:`,
          ``,
          `STEP 1 - ASK FOR SETUP OPTIONS:`,
          `Location is fixed to Inline in /frontend for this request. Ask me once for:`,
          `- Base mini-app: No (default) or Yes`,
          `- Design: defaults, style notes, or a Figma URL`,
          QUICKDAPP_SUBGRAPH_SETUP_OPTION,
          ``,
          `Ask exactly those setup options. Do not ask Theme, Primary Color, DApp Title, Layout, or any other design subquestions.`,
          QUICKDAPP_SUBGRAPH_SETUP_RULE,
          `After asking, STOP and wait for my next reply. Do not check files, call generate_dapp, or write files in the same turn as this setup question.`,
          `In my next reply, use defaults for anything I skip. If I provide a Figma URL without a token, ask for the Figma Personal Access Token and STOP again.`,
          ``,
          `STEP 2 - CHECK FOR EXISTING CONTENT:`,
          `Check if /frontend exists with content. If yes, ask: "The /frontend folder already has files. Overwrite them?"`,
          ``,
          `STEP 3 - CALL THE TOOL:`,
          `After I confirm (or if /frontend is empty/doesn't exist), you MUST call generate_dapp with:`,
          `- description: my design answer, or "Modern dark mode single-page DApp using React and Ethers.js" if I skipped it`,
          `- contractName: "${inst.name}"`,
          `- contractAddress: "${inst.address}"`,
          `- chainId: "${chainId}"`,
          `- frontendMode: "inline"`,
          `- isBaseMiniApp: true only if I selected Base mini-app Yes; otherwise false`,
          `- figmaUrl and figmaToken only if I provided them`,
          QUICKDAPP_GRAPH_CONTEXT_TOOL_ARG,
          `- confirmOverwrite: true only if I confirmed overwrite`,
          `- setupOptionsConfirmed: true`,
          `- setupOptionsSummary: a short summary of my confirmed setup choices`,
          ``,
          `IMPORTANT: In this turn, only ask STEP 1 and then STOP. After my next reply, continue with STEP 2 and STEP 3.`
        )
      } else {
        // Web mode: ask for location choice
        contextParts.push(
          `I want to create a DApp frontend. Follow these steps exactly:`,
          ``,
          `STEP 1 - ASK FOR SETUP OPTIONS:`,
          `Ask me once: "How should I create your DApp?"`,
          `- Location: Workspace (default, new dedicated workspace) or Inline (in /frontend folder of current workspace)`,
          `- Base mini-app: No (default) or Yes`,
          `- Design: defaults, style notes, or a Figma URL`,
          QUICKDAPP_SUBGRAPH_SETUP_OPTION,
          ``,
          `Ask exactly those four setup options. Do not ask Theme, Primary Color, DApp Title, Layout, or any other design subquestions.`,
          QUICKDAPP_SUBGRAPH_SETUP_RULE,
          `After asking, STOP and wait for my next reply. Do not call generate_dapp or write files in the same turn as this setup question.`,
          `In my next reply, use defaults for anything I skip. If I provide a Figma URL without a token, ask for the Figma Personal Access Token and STOP again.`,
          ``,
          `STEP 2 - IF I CHOOSE INLINE:`,
          `Check if /frontend exists with content. If yes, ask: "The /frontend folder already has files. Overwrite them?"`,
          ``,
          `STEP 3 - CALL THE TOOL:`,
          `After I answer, you MUST call generate_dapp with:`,
          `- description: my design answer, or "Modern dark mode single-page DApp using React and Ethers.js" if I skipped it`,
          `- contractName: "${inst.name}"`,
          `- contractAddress: "${inst.address}"`,
          `- chainId: "${chainId}"`,
          `- frontendMode: "inline" or "workspace" based on my Location answer`,
          `- isBaseMiniApp: true only if I selected Base mini-app Yes; otherwise false`,
          `- figmaUrl and figmaToken only if I provided them`,
          QUICKDAPP_GRAPH_CONTEXT_TOOL_ARG,
          `- confirmOverwrite: true only if I chose Inline and confirmed overwrite`,
          `- setupOptionsConfirmed: true`,
          `- setupOptionsSummary: a short summary of my confirmed setup choices`,
          ``,
          `IMPORTANT: In this turn, only ask STEP 1 and then STOP. After my next reply, continue with STEP 2 and STEP 3.`
        )
      }
    } else if (matchingInstances.length > 1) {
      // Multiple matching contracts — let AI ask the user to choose
      const contractList = matchingInstances.map((inst: any, i: number) =>
        `${i + 1}) ${inst.name} at ${inst.address}`
      ).join('\n')
      contextParts.push(
        `I want to create a DApp frontend. I have multiple deployed contracts from "${currentFileName}":`,
        ``,
        contractList,
        ``,
        isDesktop
          ? `Please ask me which contract I'd like to use, then STOP. After my next reply selects a contract, ask exactly these setup options and STOP again: Base mini-app No(default)/Yes, Design defaults/style notes/Figma URL, and Subgraph None(default)/.subgraph file path or name. Location is fixed to Inline in /frontend for this request. ${QUICKDAPP_SUBGRAPH_SETUP_RULE} Do not ask Theme, Primary Color, DApp Title, Layout, or any other design subquestions. Only after my following reply, call generate_dapp with frontendMode="inline", setupOptionsConfirmed=true, setupOptionsSummary, and subgraphFilePath only if I chose a .subgraph file.`
          : `Please ask me which contract I'd like to use, then STOP. After my next reply selects a contract, ask exactly these setup options and STOP again: Location Workspace(default)/Inline, Base mini-app No(default)/Yes, Design defaults/style notes/Figma URL, and Subgraph None(default)/.subgraph file path or name. ${QUICKDAPP_SUBGRAPH_SETUP_RULE} Do not ask Theme, Primary Color, DApp Title, Layout, or any other design subquestions. Only after my following reply, call generate_dapp with setupOptionsConfirmed=true, setupOptionsSummary, and subgraphFilePath only if I chose a .subgraph file.`
      )
    } else if (instances.length > 0) {
      // No match for current file but other contracts exist
      const contractList = instances.map((inst: any, i: number) =>
        `${i + 1}) ${inst.name} at ${inst.address}`
      ).join('\n')
      contextParts.push(
        `I want to create a DApp frontend. I have "${currentFileName}" open but no deployed contracts matching it.`,
        `However, I have these other deployed contracts:`,
        ``,
        contractList,
        ``,
        isDesktop
          ? `Please ask me which contract to use, or if I'd like to compile and deploy "${currentFileName}" first, then STOP. After a contract is selected or deployed, ask exactly these setup options and STOP again: Base mini-app No(default)/Yes, Design defaults/style notes/Figma URL, and Subgraph None(default)/.subgraph file path or name. Location is fixed to Inline in /frontend for this request. ${QUICKDAPP_SUBGRAPH_SETUP_RULE} Do not ask Theme, Primary Color, DApp Title, Layout, or any other design subquestions. Only after my following reply, call generate_dapp with frontendMode="inline", setupOptionsConfirmed=true, setupOptionsSummary, and subgraphFilePath only if I chose a .subgraph file.`
          : `Please ask me which contract to use, or if I'd like to compile and deploy "${currentFileName}" first, then STOP. After a contract is selected or deployed, ask exactly these setup options and STOP again: Location Workspace(default)/Inline, Base mini-app No(default)/Yes, Design defaults/style notes/Figma URL, and Subgraph None(default)/.subgraph file path or name. ${QUICKDAPP_SUBGRAPH_SETUP_RULE} Do not ask Theme, Primary Color, DApp Title, Layout, or any other design subquestions. Only after my following reply, call generate_dapp with setupOptionsConfirmed=true, setupOptionsSummary, and subgraphFilePath only if I chose a .subgraph file.`
      )
    } else {
      // No deployed contracts at all — AI will guide compile→deploy→generate
      const filePath = currentFile?.indexOf('/') !== -1
        ? currentFile.substr(currentFile.indexOf('/') + 1)
        : currentFile
      if (isDesktop) {
        // Desktop mode: always create inline
        contextParts.push(
          `I want to create a DApp frontend inline in the /frontend folder of my current workspace for my Solidity contract.`,
          `I currently have "${currentFileName}" open at path "${filePath}", but no contracts are deployed yet.`,
          ``,
          `Please help me through the full process:`,
          ``,
          `STEP 1 - ASK FOR SETUP OPTIONS:`,
          `Location is fixed to Inline in /frontend for this request. Ask me once for Base mini-app No(default)/Yes, Design defaults/style/Figma, and Subgraph None(default)/.subgraph file path or name.`,
          `Ask exactly those setup options. Do not ask Theme, Primary Color, DApp Title, Layout, or any other design subquestions.`,
          QUICKDAPP_SUBGRAPH_SETUP_RULE,
          `After asking, STOP and wait for my next reply. Do not compile, deploy, call generate_dapp, or write files in the same turn as this setup question.`,
          ``,
          `STEP 2 - COMPILE AND DEPLOY:`,
          `Compile "${filePath}" and deploy the compiled contract.`,
          ``,
          `STEP 3 - CHECK FOR EXISTING CONTENT:`,
          `Check if /frontend exists with content. If yes, ask: "The /frontend folder already has files. Overwrite them?"`,
          ``,
          `STEP 4 - GENERATE DAPP:`,
          `After deployment and confirmation, call generate_dapp with frontendMode: "inline", isBaseMiniApp from my answer (default false), figmaUrl/figmaToken only if provided, subgraphFilePath only if I chose a .subgraph file, setupOptionsConfirmed=true, and setupOptionsSummary.`,
          ``,
          `Start by asking me for the setup options, then STOP.`
        )
      } else {
        // Web mode: ask for location choice
        contextParts.push(
          `I want to create a DApp frontend for my Solidity contract.`,
          `I currently have "${currentFileName}" open at path "${filePath}", but no contracts are deployed yet.`,
          ``,
          `Please help me through the full process:`,
          ``,
          `STEP 1 - ASK FOR SETUP OPTIONS:`,
          `Ask me once: "How should I create your DApp?"`,
          `- Location: Workspace (default, new dedicated workspace) or Inline (in /frontend folder of current workspace)`,
          `- Base mini-app: No (default) or Yes`,
          `- Design: defaults, style notes, or a Figma URL`,
          QUICKDAPP_SUBGRAPH_SETUP_OPTION,
          ``,
          `Ask exactly those four setup options. Do not ask Theme, Primary Color, DApp Title, Layout, or any other design subquestions.`,
          QUICKDAPP_SUBGRAPH_SETUP_RULE,
          `After asking, STOP and wait for my next reply. Do not compile, deploy, call generate_dapp, or write files in the same turn as this setup question.`,
          `In my next reply, use defaults for anything I skip. If I provide a Figma URL without a token, ask for the Figma Personal Access Token and STOP again.`,
          ``,
          `STEP 2 - COMPILE AND DEPLOY:`,
          `After I answer, compile "${filePath}" and deploy the compiled contract.`,
          ``,
          `STEP 3 - IF I CHOSE INLINE:`,
          `Check if /frontend exists with content. If yes, ask: "The /frontend folder already has files. Overwrite them?"`,
          ``,
          `STEP 4 - GENERATE DAPP:`,
          `After deployment, call generate_dapp with the deployed contract details, my location choice, isBaseMiniApp from my answer (default false), figmaUrl/figmaToken only if provided, subgraphFilePath only if I chose a .subgraph file, setupOptionsConfirmed=true, and setupOptionsSummary.`,
          ``,
          `Start by asking me for the setup options, then STOP.`
        )
      }
    }

    const prompt = contextParts.join('\n')

    // 4. Activate AI Assistant and send
    try {
      await props.plugin.call('manager', 'activatePlugin', 'remix-ai-assistant')
    } catch (e) { /* may already be active */ }
    try {
      await props.plugin.call('rightSidePanel', 'focusPanel')
    } catch (e) { /* best-effort */ }

    console.log('[QuickDapp] Start Now → chatPipe (no modal), prompt length:', prompt.length)
    try {
      await props.plugin.call('remixaiassistant' as any, 'chatPipe', prompt, false, { source: 'editor-tabs', presetId: 'quickdapp-start' })
      console.log('[QuickDapp] chatPipe returned')
    } catch (error) {
      console.error('[QuickDapp] chatPipe error:', error)
      props.plugin.call('notification', 'toast', 'Error opening AI Assistant. Please try again.')
    }
  }

  useEffect(() => {
    setBannerVisible(true)
  }, [tabsState.selectedIndex])

  const shouldShowQuickDappBanner = (() => {
    if (tabsState.currentExt !== 'sol' || !bannerVisible) return false
    const quickdappEnabled = appContext?.appConfig?.['quickdapp.enabled']
    if (quickdappEnabled === false) return false
    return true
  })()

  let mainLabel = ''
  if (canRunScenario) {
    mainLabel = compileState === 'compiling' ? 'Running...' : 'Run'
  } else if (tabsState.currentExt === 'sql') {
    mainLabel = 'Run SQL'
  } else if (tabsState.currentExt === 'subgraph') {
    mainLabel = compileState === 'compiling' ? 'Running...' : 'Run Query'
  } else if (isVegaVisualization) {
    mainLabel = 'Generate Visualization'
  } else {
    mainLabel = (tabsState.currentExt === 'js' || tabsState.currentExt === 'ts')
      ? (compileState === 'compiling' ? "Run script" :
        compileState === 'compiled' ? "Run script" : "Run script")
      : (compileState === 'compiling' ? "Compiling..." :
        compileState === 'compiled' ? "Compiled" : "Compile")
  }
  let dropDown
  if (tabsState.currentExt === 'js' || tabsState.currentExt === 'ts') {
    dropDown = (
      <><RunScriptDropdown
        onNotify={onNotify}
        plugin={props.plugin}
        onRun={handleRunScript}
        disabled={!(PlayExtList.includes(tabsState.currentExt)) || compileState === 'compiling'}
      />
      </>
    )
  } else if (tabsState.currentExt === 'sol' || tabsState.currentExt === 'yul') {
    dropDown = (
      <>
        <CompileDropdown
          tabPath={active().substr(active().indexOf('/') + 1, active().length)}
          compiledFileName={active()}
          plugin={props.plugin}
          disabled={!(PlayExtList.includes(tabsState.currentExt)) || compileState === 'compiling'}
          onRequestCompileAndPublish={handleCompileAndPublish}
          setCompileState={setCompileState}
        />
      </>
    )
  } else if (tabsState.currentExt === 'sql') {
    dropDown = (
      <>
        <AmpSqlDropdown
          onNotify={onNotify}
          plugin={props.plugin}
          disabled={!(PlayExtList.includes(tabsState.currentExt)) || compileState === 'compiling'}
        />
      </>
    )
  } else {
    dropDown = (
      <>
        <EmptyDropdown/>
      </>
    )
  }

  let btnDisabled = compileState === 'compiling' || !PlayExtList.includes(tabsState.currentExt)
  if (isVegaVisualization) {
    btnDisabled = false
  }

  const handleDebugWithRemixAI = async () => {
    try {
      // When debugging is active, ensure AI assistant is always on the right side
      if (props.isDebugging) {
        // First, activate the AI assistant to ensure it's loaded
        await props.plugin.call('manager', 'activatePlugin', 'remixaiassistant')

        // Check if AI assistant is currently active in the left side panel
        const leftPanelActive = await props.plugin.call('sidePanel', 'currentFocus')

        // Check if AI assistant is currently active in the right side panel
        const rightPanelActive = await props.plugin.call('rightSidePanel', 'currentFocus')

        if (leftPanelActive === 'remixaiassistant') {
          // AI is on the left side during debugging - move it to the right side
          const profile = await props.plugin.call('remixaiassistant', 'getProfile')
          await props.plugin.call('sidePanel', 'pinView', profile)
        } else if (rightPanelActive !== 'remixaiassistant') {
          // AI is not on either panel - pin it to the right side
          const profile = await props.plugin.call('remixaiassistant', 'getProfile')
          await props.plugin.call('sidePanel', 'pinView', profile)
        }
      }

      // Show right side panel if it's hidden
      const isPanelHidden = await props.plugin.call('rightSidePanel', 'isPanelHidden')
      if (isPanelHidden) {
        await props.plugin.call('rightSidePanel', 'togglePanel')
      }
      await props.plugin.call('menuicons', 'select', 'remixaiassistant')

      // Wait a bit for the panel to open and then send the debugging prompt
      setTimeout(async () => {
        const message = 'Give me more info about current debugging session'
        await props.plugin.call('remixaiassistant', 'chatPipe', message, false, { source: 'editor-tabs', presetId: 'debug-with-ai' })
      }, 500)
    } catch (err) {
      console.error('Failed to open RemixAI:', err)
    }
  }

  if (canRunScenario) {
    btnDisabled = compileState === 'compiling'
  }
  return (
    <>
      <div
        className={`remix-ui-tabs justify-content-between  border-0 header nav-tabs ${
          appContext.appState.connectedToDesktop === desktopConnectionType .disabled ? 'd-flex' : 'd-none'
        }`}
        data-id="tabs-component"
      >
        <div className="d-flex flex-row" style={{ maxWidth: 'fit-content', width: '99%' }}>
          <div className="d-flex flex-row justify-content-center align-items-center m-1 mt-1">
            <div className="d-flex align-items-center m-1">
              {props.isDebugging ? (
                <CustomTooltip
                  placement="bottom"
                  tooltipId="overlay-tooltip-ask-remixai"
                  tooltipText={<span>Ask RemixAI about debugging</span>}
                >
                  <button
                    className="btn btn-ai d-flex align-items-center justify-content-center border-0 px-3 py-1"
                    data-id="ask-remixai-action"
                    style={{
                      fontFamily: "Nunito Sans, sans-serif",
                      fontSize: "11px",
                      fontWeight: 700,
                      lineHeight: "14px",
                      whiteSpace: "nowrap",
                      height: "28px"
                    }}
                    onClick={handleDebugWithRemixAI}
                  >
                    <img src="assets/img/remixAI_small.svg" alt="Remix AI" style={{ width: "16px", height: "16px" }} />
                    <span style={{ lineHeight: "12px", position: "relative", top: "1px" }}>
                      Debug with RemixAI
                    </span>
                  </button>
                </CustomTooltip>
              ) : (
                <>
                  <div className="btn-group" role="group" data-id="compile_group" aria-label="compile group">
                    <CustomTooltip
                      placement="bottom"
                      tooltipId="overlay-tooltip-run-script"
                      tooltipText={
                        <span>
                          {tabsState.currentExt === 'js' || tabsState.currentExt === 'ts' ? (
                            <FormattedMessage id="remixUiTabs.tooltipText1" />
                          ) : tabsState.currentExt === 'sol' || tabsState.currentExt === 'yul' || tabsState.currentExt === 'circom' || tabsState.currentExt === 'vy' ? (
                            <FormattedMessage id="remixUiTabs.tooltipText2" />
                          ) : (
                            <FormattedMessage id="remixUiTabs.tooltipText3" />
                          )}
                        </span>
                      }
                    >
                      <button
                        className="btn btn-primary d-flex align-items-center justify-content-center"
                        data-id="compile-action"
                        style={{
                          padding: "4px 8px",
                          height: "28px",
                          fontFamily: "Nunito Sans, sans-serif",
                          fontSize: "11px",
                          fontWeight: 700,
                          lineHeight: "14px",
                          whiteSpace: "nowrap",
                          borderRadius: "4px 0 0 4px"
                        }}
                        disabled={btnDisabled}
                        onClick={handleCompileClick}
                      >
                        <i className={
                          compileState === 'compiled' ? "fas fa-check"
                            : "fas fa-play"
                        }></i>
                        <span className="ms-2" style={{ lineHeight: "12px", position: "relative", top: "1px" }}>
                          {mainLabel}
                        </span>
                      </button>
                    </CustomTooltip>
                  </div>
                  {dropDown}
                </>
              )}
            </div>

            <div className="d-flex border-start ms-1 align-items-center" style={{ height: "3em" }}>
              <CustomTooltip placement="bottom" tooltipId="overlay-tooltip-zoom-out" tooltipText={<FormattedMessage id="remixUiTabs.zoomOut" />}>
                <span data-id="tabProxyZoomOut" className="btn fas fa-search-minus text-dark ps-2 pe-0 py-0 d-flex" onClick={() => props.onZoomOut()}></span>
              </CustomTooltip>
              <CustomTooltip placement="bottom" tooltipId="overlay-tooltip-run-zoom-in" tooltipText={<FormattedMessage id="remixUiTabs.zoomIn" />}>
                <span data-id="tabProxyZoomIn" className="btn fas fa-search-plus text-dark ps-2 pe-0 py-0 d-flex" onClick={() => props.onZoomIn()}></span>
              </CustomTooltip>
            </div>
          </div>
          <Tabs
            className="tab-scroll"
            selectedIndex={tabsState.selectedIndex}
            domRef={(domEl) => {
              if (tabsElement.current) return
              tabsElement.current = domEl
              tabsElement.current.addEventListener('wheel', transformScroll)
            }}
            onSelect={(index) => {
              props.onSelect(index)
              currentIndexRef.current = index
              const ext = getExt(props.tabs[currentIndexRef.current].name)
              props.plugin.emit('extChanged', ext)
              dispatch({
                type: 'SELECT_INDEX',
                payload: index,
                ext: getExt(props.tabs[currentIndexRef.current].name)
              })
              setCompileState('idle')
            }}
          >
            <TabList className="d-flex flex-row align-items-center">
              {props.tabs.map((tab, i) => (
                <Tab className={tab.show ? '' : 'd-none'} key={tab.name} data-id={tab.id}>
                  {renderTab(tab, i)}
                </Tab>
              ))}
              <div style={{ minWidth: '4rem', height: '1rem' }} id="dummyElForLastXVisibility"></div>
            </TabList>
            {props.tabs.map((tab) => (
              <TabPanel className={tab.show ? '' : 'd-none'} key={tab.name}></TabPanel>
            ))}
          </Tabs>

        </div>
      </div>
      {shouldShowQuickDappBanner && (
        <QuickDappBanner
          onClose={handleQuickDappBannerClose}
          onStartNow={handleQuickDappStartNow}
        />
      )}
    </>
  )
}

export default TabsUI
