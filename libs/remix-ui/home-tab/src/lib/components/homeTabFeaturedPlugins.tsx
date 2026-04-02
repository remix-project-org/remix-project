/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useContext, useEffect, useState } from 'react'
import { ThemeContext } from '../themeContext'
import { ToggleSwitch } from '@remix-ui/toggle'
import { RenderIf, RenderIfNot } from '@remix-ui/helper'
import { FormattedMessage } from 'react-intl'
import { HOME_TAB_PLUGIN_LIST } from './constant'
import axios from 'axios'
import { LoadingCard } from './LoaderPlaceholder'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'

interface HomeTabFeaturedPluginsProps {
  plugin: any
}

interface PluginInfo {
  pluginId: string
  pluginTitle: string
  action: {
    type: string
    label: string
    url?: string
    pluginName?: string
    pluginMethod?: string
    pluginArgs?: (string | number | boolean | object | null)[]
  }
  iconClass: string
  maintainedBy: string
  description: string
}

function HomeTabFeaturedPlugins({ plugin }: HomeTabFeaturedPluginsProps) {
  const [activePlugins, setActivePlugins] = useState<string[]>([])
  const [loadingPlugins, setLoadingPlugins] = useState<string[]>([])
  const [pluginList, setPluginList] = useState<{ caption: string, plugins: PluginInfo[] }>({ caption: '', plugins: []})
  const [isLoading, setIsLoading] = useState(true)
  const theme = useContext(ThemeContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const isDark = theme.name === 'dark'

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  useEffect(() => {
    async function getPluginList() {
      try {
        setIsLoading(true)
        const response = await axios.get(HOME_TAB_PLUGIN_LIST)

        response.data && setPluginList(response.data)

        // Initialize active plugins state based on current plugin status
        if (response.data && response.data.plugins) {
          const currentlyActive = []
          for (const pluginInfo of response.data.plugins) {
            if (await plugin.appManager.isActive(pluginInfo.pluginId)) {
              currentlyActive.push(pluginInfo.pluginId)
            }
          }
          setActivePlugins(currentlyActive)
        }

        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching plugin list:', error)
      }
    }
    getPluginList()

    const onActivate = (pluginProfile: any) => {
      try {
        const pluginName = pluginProfile?.name || pluginProfile?.profile?.name
        if (pluginName) {
          setActivePlugins(activePlugins => [...activePlugins, pluginName])
        }
      } catch (error) {
        console.error('Error handling plugin activation:', error)
      }
    }

    const onDeactivate = (pluginProfile: any) => {
      try {
        const pluginName = pluginProfile?.name || pluginProfile?.profile?.name
        if (pluginName) {
          setActivePlugins(activePlugins => activePlugins.filter((id) => id !== pluginName))
        }
      } catch (error) {
        console.error('Error handling plugin deactivation:', error)
      }
    }

    plugin.appManager.event.on('activate', onActivate)
    plugin.appManager.event.on('deactivate', onDeactivate)

    return () => {
      plugin.appManager.event.off('activate', onActivate)
      plugin.appManager.event.off('deactivate', onDeactivate)
    }
  }, [])

  const activateFeaturedPlugin = async (pluginId: string) => {
    setLoadingPlugins([...loadingPlugins, pluginId])
    if (await plugin.appManager.isActive(pluginId)) {
      trackMatomoEvent({
        category: 'hometab',
        action: 'featuredPluginsToggle',
        name: `deactivate-${pluginId}`,
        isClick: true
      })
      await plugin.appManager.deactivatePlugin(pluginId)
      setActivePlugins(activePlugins.filter((id) => id !== pluginId))
    } else {
      trackMatomoEvent({
        category: 'hometab',
        action: 'featuredPluginsToggle',
        name: `activate-${pluginId}`,
        isClick: true
      })
      await plugin.appManager.activatePlugin([pluginId])
      await plugin.verticalIcons.select(pluginId)
      setActivePlugins([...activePlugins, pluginId])
    }
    setLoadingPlugins(loadingPlugins.filter((id) => id !== pluginId))
  }

  const handleFeaturedPluginActionClick = async (pluginInfo: PluginInfo) => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'featuredPluginsActionClick',
      name: pluginInfo.pluginTitle,
      isClick: true
    })
    if (pluginInfo.action.type === 'link') {
      window.open(pluginInfo.action.url, '_blank')
    } else if (pluginInfo.action.type === 'methodCall') {
      if (pluginInfo.action.pluginMethod === 'activatePlugin') {
        await plugin.appManager.activatePlugin([pluginInfo.action.pluginName])
        await plugin.call('menuicons', 'select', pluginInfo.action.pluginName)
      } else plugin.call(pluginInfo.action.pluginName, pluginInfo.action.pluginMethod, pluginInfo.action.pluginArgs)
    }
  }

  function PluginCard(pluginInfo: PluginInfo) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-theme rounded-lg flex flex-col">
        <div className="flex items-center py-3 px-4 justify-between border-b border-theme">
          <div className='flex items-center gap-2'>
            <RenderIf condition={loadingPlugins.includes(pluginInfo.pluginId)}>
              <i className="fad fa-spinner fa-spin"></i>
            </RenderIf>
            <RenderIfNot condition={loadingPlugins.includes(pluginInfo.pluginId)}>
              { pluginInfo.iconClass ? <i className={pluginInfo.iconClass}></i> : <i className="fa-solid fa-file-book"></i> }
            </RenderIfNot>
            <span className="font-bold text-gray-900 dark:text-white text-base">{pluginInfo.pluginTitle}</span>
          </div>
          <ToggleSwitch id={`toggleSwitch-${pluginInfo.pluginId}`} isOn={activePlugins.includes(pluginInfo.pluginId)} onClick={() => activateFeaturedPlugin(pluginInfo.pluginId)} />
        </div>
        <div className="flex flex-col flex-1 p-4">
          <div className="flex-1">
            <div className={`${(pluginInfo.maintainedBy || '').toLowerCase() === 'remix' ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'} mb-2 text-sm flex items-center`}>
              <i className="fa-solid fa-shield-halved mr-2"></i>
              <FormattedMessage id="home.maintainedBy"/> {pluginInfo.maintainedBy || 'Community'}
            </div>
            <div className="text-sm text-gray-900 dark:text-gray-100 mb-4">{pluginInfo.description}</div>
          </div>
          <button className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm w-full border border-theme rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium" onClick={async () => await handleFeaturedPluginActionClick(pluginInfo)}>
            <i className="fa-solid fa-book mr-2"></i>{pluginInfo.action.label}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 w-full items-end remixui_featuredplugins_container" id="hTFeaturedPlugins">
      <div className="flex justify-between items-center mb-4">
        <h6 className="text-gray-900 dark:text-white font-semibold text-base mb-0">{pluginList.caption}</h6>
        <button className="px-4 py-2 bg-gray-600 dark:bg-gray-500 text-white rounded-md hover:bg-gray-700 dark:hover:bg-gray-400 transition-colors text-sm" onClick={() => plugin.call('menuicons', 'select', 'pluginManager')} ><FormattedMessage id="home.exploreAllPlugins"/></button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {
          isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={`loading-${index}`} className="overflow-y-auto">
                <LoadingCard />
              </div>
            ))
          ) : (
            pluginList.plugins.map((pluginInfo: PluginInfo) => (
              <div key={pluginInfo.pluginId}>{ PluginCard(pluginInfo) }</div>
            ))
          )
        }
      </div>
    </div>
  )
}

export default HomeTabFeaturedPlugins
