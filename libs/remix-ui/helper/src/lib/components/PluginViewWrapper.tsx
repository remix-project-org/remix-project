import { AppContext } from '@remix-ui/app'
import React, { useContext, useEffect, useState } from 'react'

interface IPluginViewWrapperProps {
  plugin: any
  useAppContext?: boolean // Optional flag to decide whether to use AppContext
}

export const PluginViewWrapper = ({ plugin, useAppContext = false }: IPluginViewWrapperProps) => {
  const [state, setState] = useState<any>(() =>
    plugin.getInitialState ? plugin.getInitialState() : null
  )
  const appContext = useAppContext ? useContext(AppContext) : null

  useEffect(() => {
    if (plugin.setDispatch) {
      plugin.setDispatch(setState)
    }
    if (useAppContext && appContext.appStateDispatch && plugin.setAppStateDispatch) {
      plugin.setAppStateDispatch(appContext.appStateDispatch)
    }
  }, [plugin])

  if (useAppContext && appContext && appContext.appState) {
    return (
      <>
        {state ? <>{plugin.updateComponent(state, appContext.appState)}</> : <></>}
      </>
    )
  }

  return (
    <>
      {state ? <>{plugin.updateComponent(state)}</> : <></>}
    </>
  )
}
