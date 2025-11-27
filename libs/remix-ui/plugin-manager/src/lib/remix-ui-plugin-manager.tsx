/* eslint-disable @typescript-eslint/no-unused-vars */
import { Profile } from '@remixproject/plugin-utils'
import React, { useState, useRef, useEffect, useContext } from 'react' // eslint-disable-line no-use-before-define
import { ThemeContext, themes } from './themeContext'
import { RemixUiPluginManagerProps } from '../types'
import PluginCard from './components/PluginCard'
import RootView from './components/rootView'
import './remix-ui-plugin-manager.css'

export const categoryMap: Record<number, string> = {
  1: 'Core Tools',
  2: 'Deployment & Verification',
  3: 'Security & Analysis',
  4: 'Layer 2 & Scaling',
  5: 'ZK (Zero-Knowledge)',
  6: 'Alternative Languages',
  7: 'Learning & Utilities'
}

const pluginCategories: Record<string, number[]> = {
  // --- Layer 2 & Scaling ---
  'arbitrum-stylus': [2, 4],
  'nahmii-compiler': [1, 4, 6],
  'Starknet': [1, 4, 6],
  'ZKsync': [2, 4, 5],

  // --- ZK (Zero-Knowledge) ---
  'circuit-compiler': [1, 5, 6],
  'noir-compiler': [1, 5, 6],
  'ZoKrates': [1, 5],

  // --- Security & Analysis ---
  'contract-verification': [2, 3],
  'defender-deploy': [2, 3],
  'solidityStaticAnalysis': [1, 3],
  'solidityscan': [3],

  // --- Deployment & Verification ---
  'buildbear': [2, 3], // Note: I assumed 'Testing & Security' maps to 'Security & Analysis'
  'wds-code-remix': [2, 6],
  'contract_deployer': [2],
  'coti-remix-plugin': [2],
  'bif-udapp-js': [2, 6],
  'bif-udapp': [2],
  'klaytn-remix-plugin': [2],
  'tenderly': [2, 3, 7],

  // --- Core Tools & Alternative Languages ---
  'debugger': [1, 3],
  'solidityUnitTesting': [1, 3],
  'vyper': [1, 6],
  'bif-solidity': [1],
  'remixd': [1, 7],

  // --- Learning & Utilities ---
  'cookbookdev': [7],
  'desktopClient': [7],
  'doc-gen': [7],
  'LearnEth': [7],
  'quick-dapp': [7, 2],
  'quick-dapp-v2': [7, 2],
  'remixGuide': [7],
  'UIScriptRunner': [7],
  'sentio-remix-plugin': [7],
}

export const RemixUiPluginManager = ({ pluginComponent }: RemixUiPluginManagerProps) => {
  const [activeTab, setActiveTab] = useState('all')
  const [filterByRemix, setFilterByRemix] = useState<boolean>(false)
  const tabsRef = useRef<HTMLDivElement>(null)
  const [selectedCategories, setSelectedCategories] = useState<number[]>([])
  const [loadingPlugins, setLoadingPlugins] = useState<string[]>([])

  const [state, setState] = useState<{
    themeQuality: { filter: string; name: string }
  }>({
    themeQuality: themes.light
  })

  useEffect(() => {
    pluginComponent.call('theme', 'currentTheme').then((theme) => {
      // update theme quality. To be used for for images
      setState((prevState) => {
        return {
          ...prevState,
          themeQuality: theme.quality === 'dark' ? themes.dark : themes.light
        }
      })
    })
    pluginComponent.on('theme', 'themeChanged', (theme) => {
      // update theme quality. To be used for for images
      setState((prevState) => {
        return {
          ...prevState,
          themeQuality: theme.quality === 'dark' ? themes.dark : themes.light
        }
      })
    })
  }, [])

  useEffect(() => {
    const onActivation = (profile: Profile) => {
      setLoadingPlugins(prev => prev.filter(p => p !== profile.name))
    }

    const client = pluginComponent as any

    client.on('manager', 'activate', onActivation)
    client.on('manager', 'deactivate', onActivation)

    return () => {
      client.off('manager', 'activate', onActivation)
      client.off('manager', 'deactivate', onActivation)
    }
  }, [pluginComponent])

  const togglePlugin = async (pluginName: string) => {
    setLoadingPlugins(prev => [...prev, pluginName])

    const timerId = setTimeout(() => {
      setLoadingPlugins(prev => prev.filter(p => p !== pluginName))
    }, 3000)

    try {
      const isActive = pluginComponent.activePlugins.some(p => p.name === pluginName)
      if (isActive) {
        await pluginComponent.deactivateP(pluginName)
      } else {
        await pluginComponent.activateP(pluginName)
      }
    } catch (e) {
      console.error(e)
      setLoadingPlugins(prev => prev.filter(p => p !== pluginName))
    } finally {
      clearTimeout(timerId)
    }
  }

  useEffect(() => {
    const tabsNode = tabsRef.current
    if (!tabsNode) return

    const updateIndicator = () => {
      const activeLink = tabsNode.querySelector('.nav-link.active') as HTMLElement
      if (activeLink) {
        tabsNode.style.setProperty('--indicator-left', `${activeLink.offsetLeft}px`)
        tabsNode.style.setProperty('--indicator-width', `${activeLink.offsetWidth}px`)
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      updateIndicator()
    })
    resizeObserver.observe(tabsNode)
    updateIndicator()

    return () => {
      resizeObserver.disconnect()
    }
  }, [activeTab])

  const getFilteredPlugins = () => {
    let plugins = [...pluginComponent.activePlugins, ...pluginComponent.inactivePlugins]

    const HIDDEN_PLUGINS = ['ai-dapp-generator']
    plugins = plugins.filter(profile => !HIDDEN_PLUGINS.includes(profile.name))

    if (filterByRemix) {
      plugins = plugins.filter(profile => profile.maintainedBy?.toLowerCase() === 'remix')
    }

    if (selectedCategories.length > 0) {
      plugins = plugins.filter(profile => {
        const categoriesOfPlugin = pluginCategories[profile.name] || []
        return categoriesOfPlugin.some(cat => selectedCategories.includes(cat))
      })
    }
    return plugins
  }

  const filteredPlugins = getFilteredPlugins()
  const activeCount = filteredPlugins.filter(p => pluginComponent.activePlugins.some(ap => ap.name === p.name)).length
  const inactiveCount = filteredPlugins.filter(p => pluginComponent.inactivePlugins.some(ip => ip.name === p.name)).length
  const allCount = filteredPlugins.length

  const renderPluginList = () => {
    let pluginsToRender: Profile[] = []
    switch (activeTab) {
    case 'active':
      pluginsToRender = filteredPlugins.filter(p => pluginComponent.activePlugins.some(ap => ap.name === p.name))
      break
    case 'inactive':
      pluginsToRender = filteredPlugins.filter(p => pluginComponent.inactivePlugins.some(ip => ip.name === p.name))
      break
    case 'all':
    default:
      pluginsToRender = filteredPlugins
      break
    }

    return pluginsToRender.map((profile, idx) => {
      const isActive = pluginComponent.activePlugins.some(p => p.name === profile.name)
      const isLoading = loadingPlugins.includes(profile.name)
      return <PluginCard profile={profile} isActive={isActive} togglePlugin={togglePlugin} key={profile.name || idx} isLoading={isLoading} />
    })
  }

  return (
    <ThemeContext.Provider value={state.themeQuality}>
      <RootView
        pluginComponent={pluginComponent}
        filterByRemix={filterByRemix}
        setFilterByRemix={setFilterByRemix}
        categoryMap={categoryMap}
        selectedCategories={selectedCategories}
        setSelectedCategories={setSelectedCategories}
      >
        <section data-id="pluginManagerComponentPluginManagerSection" className="px-3">
          <nav ref={tabsRef} className="plugin-manager-tabs mt-2 d-flex flex-row">
            <a
              data-id="pluginManagerAllTab"
              className={`nav-link ${activeTab === 'all' ? 'active' : ''}`}
              href="#"
              onClick={(e) => { e.preventDefault(); setActiveTab('all') }}
            >
              All plugins{' '}
              <span
                className={`badge rounded-pill ${activeTab === 'all' ? 'bg-primary' : 'bg-secondary'}`}
                data-id="pluginManagerAllCount"
                style={{ color: state.themeQuality.name === 'dark' ? 'white' : 'black' }}
              >
                {allCount}
              </span>
            </a>
            <a
              data-id="pluginManagerActiveTab"
              className={`nav-link ${activeTab === 'active' ? 'active' : ''}`}
              href="#"
              onClick={(e) => { e.preventDefault(); setActiveTab('active') }}
            >
              Active{' '}
              <span
                className={`badge rounded-pill ${activeTab === 'active' ? 'bg-primary' : 'bg-secondary'}`}
                style={{ color: state.themeQuality.name === 'dark' ? 'white' : 'black' }}
                data-id="pluginManagerComponentActiveTilesCount"
              >
                {activeCount}
              </span>
            </a>
            <a
              data-id="pluginManagerInactiveTab"
              className={`nav-link ${activeTab === 'inactive' ? 'active' : ''}`}
              href="#"
              onClick={(e) => { e.preventDefault(); setActiveTab('inactive') }}
            >
              Inactive{' '}
              <span
                className={`badge rounded-pill ${activeTab === 'inactive' ? 'bg-primary' : 'bg-secondary'}`}
                data-id="pluginManagerComponentInactiveTilesCount"
                style={{ color: state.themeQuality.name === 'dark' ? 'white' : 'black' }}
              >
                {inactiveCount}
              </span>
            </a>
          </nav>
          <div className="g-3 mt-3">{renderPluginList()}</div>
        </section>
      </RootView>
    </ThemeContext.Provider>
  )
}