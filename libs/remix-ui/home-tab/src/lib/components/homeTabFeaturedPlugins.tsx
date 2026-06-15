import React, { useContext, useEffect, useState } from 'react'
import { ToggleSwitch } from '@remix-ui/toggle'
import { FormattedMessage } from 'react-intl'
import { HOME_TAB_PLUGIN_LIST } from './constant'
import axios from 'axios'
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
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  useEffect(() => {
    async function getPluginList() {
      try {
        setIsLoading(true)
        const response = await axios.get(HOME_TAB_PLUGIN_LIST)
        response.data && setPluginList(response.data)

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
        if (pluginName) setActivePlugins(prev => [...prev, pluginName])
      } catch (error) {
        console.error('Error handling plugin activation:', error)
      }
    }

    const onDeactivate = (pluginProfile: any) => {
      try {
        const pluginName = pluginProfile?.name || pluginProfile?.profile?.name
        if (pluginName) setActivePlugins(prev => prev.filter((id) => id !== pluginName))
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
    setLoadingPlugins(prev => [...prev, pluginId])
    if (await plugin.appManager.isActive(pluginId)) {
      trackMatomoEvent({ category: 'hometab', action: 'featuredPluginsToggle', name: `deactivate-${pluginId}`, isClick: true })
      await plugin.appManager.deactivatePlugin(pluginId)
      setActivePlugins(prev => prev.filter((id) => id !== pluginId))
    } else {
      trackMatomoEvent({ category: 'hometab', action: 'featuredPluginsToggle', name: `activate-${pluginId}`, isClick: true })
      await plugin.appManager.activatePlugin([pluginId])
      await plugin.verticalIcons.select(pluginId)
      setActivePlugins(prev => [...prev, pluginId])
    }
    setLoadingPlugins(prev => prev.filter((id) => id !== pluginId))
  }

  const handleFeaturedPluginActionClick = async (pluginInfo: PluginInfo) => {
    trackMatomoEvent({ category: 'hometab', action: 'featuredPluginsActionClick', name: pluginInfo.pluginTitle, isClick: true })
    if (pluginInfo.action.type === 'link') {
      window.open(pluginInfo.action.url, '_blank')
    } else if (pluginInfo.action.type === 'methodCall') {
      if (pluginInfo.action.pluginMethod === 'activatePlugin') {
        await plugin.appManager.activatePlugin([pluginInfo.action.pluginName])
        await plugin.call('menuicons', 'select', pluginInfo.action.pluginName)
      } else {
        plugin.call(pluginInfo.action.pluginName, pluginInfo.action.pluginMethod, pluginInfo.action.pluginArgs)
      }
    }
  }

  function PluginRow(pluginInfo: PluginInfo) {
    return (
      <div key={pluginInfo.pluginId} className="ht-row">
        <span className="ht-row-icon">
          {loadingPlugins.includes(pluginInfo.pluginId)
            ? <i className="fad fa-spinner fa-spin"></i>
            : pluginInfo.iconClass
              ? <i className={pluginInfo.iconClass}></i>
              : <i className="fa-solid fa-puzzle-piece"></i>
          }
        </span>
        <span className="ht-row-text">
          <strong>{pluginInfo.pluginTitle}</strong>
          <small className="d-flex align-items-center justify-content-between gap-2">
            <span className="text-truncate">{pluginInfo.description}</span>
            <button
              className="ht-link-btn flex-shrink-0"
              onClick={async (e) => { e.stopPropagation(); await handleFeaturedPluginActionClick(pluginInfo) }}
            >
              {pluginInfo.action.label} →
            </button>
          </small>
        </span>
        <ToggleSwitch
          id={`toggleSwitch-${pluginInfo.pluginId}`}
          isOn={activePlugins.includes(pluginInfo.pluginId)}
          onClick={() => activateFeaturedPlugin(pluginInfo.pluginId)}
        />
      </div>
    )
  }

  function SkeletonRow({ i }: { i: number }) {
    return (
      <div key={i} className="ht-row">
        <span className="ht-skeleton ht-row-icon"></span>
        <span className="ht-row-text">
          <span className="ht-skeleton" style={{ height: '12px', width: '50%', marginBottom: '5px' }}></span>
          <span className="ht-skeleton" style={{ height: '10px', width: '75%' }}></span>
        </span>
      </div>
    )
  }

  return (
    <div className="ht-section ht-section-divider">
      <div className="ht-section-header">
        <span className="ht-section-title">
          {pluginList.caption || <FormattedMessage id="home.featuredPlugins" defaultMessage="Featured Plugins" />}
        </span>
        <button className="ht-link-btn" onClick={() => plugin.call('menuicons', 'select', 'pluginManager')}>
          <FormattedMessage id="home.exploreAllPlugins" /> →
        </button>
      </div>
      {isLoading
        ? [0, 1, 2, 3].map(i => <SkeletonRow key={i} i={i} />)
        : pluginList.plugins.map(p => PluginRow(p))
      }
    </div>
  )
}

export default HomeTabFeaturedPlugins
