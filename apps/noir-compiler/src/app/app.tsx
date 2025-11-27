import { useEffect, useReducer, useState } from "react"
import { NoirPluginClient } from "./services/noirPluginClient"
import { RenderIf } from '@remix-ui/helper'
import { IntlProvider } from 'react-intl'
import { Container } from "./components/container"
import { NoirAppContext } from "./contexts"
import { appInitialState, appReducer } from "./reducers/state"
import { compileNoirCircuit } from "./actions"

const plugin = new NoirPluginClient()

function App() {
  const [appState, dispatch] = useReducer(appReducer, appInitialState)
  const [locale, setLocale] = useState<{code: string; messages: any}>({
    code: 'en',
    messages: null
  })
  const [isContentChanged, setIsContentChanged] = useState<boolean>(false)
  const [isPluginActivated, setIsPluginActivated] = useState<boolean>(false)

  useEffect(() => {
    plugin.internalEvents.on('noir_activated', () => {
      // @ts-ignore
      plugin.on('locale', 'localeChanged', (locale: any) => {
        setLocale(locale)
      })
      plugin.on('fileManager', 'currentFileChanged', (filePath) => {
        if (filePath.endsWith('.nr')) {
          dispatch({ type: 'SET_FILE_PATH', payload: filePath })
          plugin.parse(filePath)
        }
      })
      // @ts-ignore
      plugin.on('editor', 'contentChanged', async (path: string, content: string) => {
        if (path.endsWith('.nr')) {
          setIsContentChanged(true)
          plugin.parse(path, content)
        }
      })
      // noir compiling events
      plugin.internalEvents.on('noir_compiling_start', () => dispatch({ type: 'SET_COMPILER_STATUS', payload: 'compiling' }))
      plugin.internalEvents.on('noir_compiling_done', () => {
        dispatch({ type: 'SET_COMPILER_STATUS', payload: 'succeed' })
        dispatch({ type: 'SET_COMPILER_FEEDBACK', payload: null })
      })
      plugin.internalEvents.on('noir_compiling_errored', noirCompilerErrored)

      plugin.internalEvents.on('noir_proofing_start', () => {
        dispatch({ type: 'SET_PROOFING_STATUS', payload: 'proofing' })
      })
      plugin.internalEvents.on('noir_proofing_done', (inputs) => {
        dispatch({ type: 'SET_PROOFING_STATUS', payload: 'succeed' })
        dispatch({ type: 'SET_VERIFIER_INPUTS', payload: inputs })
      })
      plugin.internalEvents.on('noir_proofing_errored', (error: Error) => {
        dispatch({ type: 'SET_PROOFING_STATUS', payload: 'errored' })
        dispatch({ type: 'SET_COMPILER_FEEDBACK', payload: error.message }) 
      })

      setIsPluginActivated(true)
    })
  }, [])

  useEffect(() => {
    if (isPluginActivated) {
      setCurrentLocale()
    }
  }, [isPluginActivated])

  useEffect(() => {
    if (isContentChanged) {
      (async () => {
        if (appState.autoCompile) await compileNoirCircuit(plugin, appState)
      })()
      setIsContentChanged(false)
    }
  }, [appState.autoCompile, isContentChanged])

  const noirCompilerErrored = (err: ErrorEvent) => {
    dispatch({ type: 'SET_COMPILER_STATUS', payload: 'errored' })
    try {
      const report = JSON.parse(err.message)

      dispatch({ type: 'SET_COMPILER_FEEDBACK', payload: report })
    } catch (e) {
      dispatch({ type: 'SET_COMPILER_FEEDBACK', payload: err.message })
    }
  }

  const setCurrentLocale = async () => {
    // @ts-ignore
    const currentLocale = await plugin.call('locale', 'currentLocale')

    setLocale(currentLocale)
  }

  const value = {
    plugin,
    dispatch,
    appState
  }

  return (
    <div className="noir_compiler_app">
      <RenderIf condition={locale.messages}>
        <IntlProvider locale={locale.code} messages={locale.messages}>
          <NoirAppContext.Provider value={value}>
            <Container />
          </NoirAppContext.Provider>
        </IntlProvider>
      </RenderIf>
    </div>
  )
}

export default App
