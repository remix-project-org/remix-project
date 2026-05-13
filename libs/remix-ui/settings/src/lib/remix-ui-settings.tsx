import { ViewPlugin } from '@remixproject/engine-web'
import React, { useState, useReducer, useEffect, useContext } from 'react' // eslint-disable-line
import Fuse from 'fuse.js'
import { EtherscanConfigDescription, GitHubCredentialsDescription, SindriCredentialsDescription } from '@remix-ui/helper'
import { AppConfig } from '@remix-api'
import { AppContext } from '@remix-ui/app'

import { initialState, settingReducer } from './settingsReducer'
import { Toaster } from '@remix-ui/toaster' // eslint-disable-line
import { ThemeModule } from '@remix-ui/theme-module'
import { ThemeContext, themes } from '@remix-ui/home-tab'
import { FormattedMessage, useIntl } from 'react-intl'
import { Registry, QueryParams } from '@remix-project/remix-lib'
import { SettingsSectionUI } from './settings-section'
import { SettingsSection } from '../types'
import './remix-ui-settings.css'

/* eslint-disable-next-line */
export interface RemixUiSettingsProps {
  plugin: ViewPlugin
  config: any
  editor: any
  _deps: any
  useMatomoPerfAnalytics: boolean
  useCopilot: boolean
  themeModule: ThemeModule
}

const settingsConfig = Registry.getInstance().get('settingsConfig').api
const settingsSections: SettingsSection[] = [
  {
    key: 'general',
    label: 'settings.generalSettings',
    description: 'settings.generalSettingsDescription',
    subSections: [
      {
        title: 'settings.appearanceSection',
        options: [{
          name: 'theme',
          label: 'settings.theme',
          type: 'select',
          selectOptions: settingsConfig.themes.map((theme) => ({
            label: theme.name + ' (' + theme.quality + ')',
            value: theme.name
          }))
        }]
      },
      {
        title: 'settings.codeEditorSection',
        options: [{
          name: 'generate-contract-metadata',
          label: 'settings.generateContractMetadataText',
          description: 'settings.generateContractMetadataTooltip',
          type: 'toggle'
        }, {
          name: 'auto-completion',
          label: 'settings.useAutoCompleteText',
          type: 'toggle'
        }, {
          name: 'show-gas',
          label: 'settings.useShowGasInEditorText',
          type: 'toggle'
        }, {
          name: 'display-errors',
          label: 'settings.displayErrorsText',
          type: 'toggle'
        }, {
          name: 'text-wrap',
          label: 'settings.wordWrapText',
          type: 'toggle'
        }, {
          name: 'personal-mode',
          label: 'settings.enablePersonalModeText',
          labelIcon: 'ms-1 fa fa-exclamation-triangle text-warning',
          labelIconTooltip: 'settings.enablePersonalModeTooltip',
          type: 'toggle'
        }, {
          name: 'save-evm-state',
          label: 'settings.enableSaveEnvState',
          type: 'toggle'
        }]
      }
    ]
  },
  {
    key: 'account',
    label: 'settings.account',
    description: 'settings.accountDescription',
    requiresAuth: true, // Special flag for auth-required sections
    subSections: [
      {
        title: 'settings.profileSection',
        options: [{
          name: 'profile-section',
          label: '',
          type: 'custom' as const,
          customComponent: 'profileSection'
        }]
      },
      {
        title: 'settings.creditsBalanceSection',
        options: [{
          name: 'credits-balance',
          label: '',
          type: 'custom' as const,
          customComponent: 'creditsBalance'
        }]
      },
      {
        title: 'settings.connectedAccountsSection',
        description: 'settings.connectedAccountsDescription',
        options: [{
          name: 'connected-accounts',
          label: '',
          type: 'custom' as const,
          customComponent: 'connectedAccounts'
        }]
      },
      {
        title: 'settings.billingSubscriptionsSection',
        description: 'settings.billingSubscriptionsDescription',
        options: [{
          name: 'billing-section',
          label: '',
          type: 'custom' as const,
          customComponent: 'billingSection'
        }]
      }
    ]
  },
  {
    key: 'analytics', label: 'settings.analytics', description: 'settings.analyticsDescription', subSections: [
      {
        options: [{
          name: 'matomo-analytics',
          label: 'settings.matomoAnalyticsNoCookies',
          headerClass: 'text-secondary',
          type: 'toggle',
          description: 'settings.matomoAnalyticsNoCookiesDescription',
        }, {
          name: 'matomo-perf-analytics',
          label: 'settings.matomoAnalyticsWithCookies',
          type: 'toggle',
          description: 'settings.matomoAnalyticsWithCookiesDescription',
          footnote: {
            text: 'settings.manageCookiePreferences',
            link: 'https://matomo.org/',
            styleClass: 'text-primary'
          }
        }]
      }
    ]
  },
  {
    key: 'ai', label: 'settings.ai', description: 'settings.aiDescription', subSections: [
      {
        options: [{
          name: 'copilot/suggest/activate',
          label: 'settings.aiCopilot',
          description: 'settings.aiCopilotDescription',
          type: 'toggle',
          footnote: {
            text: 'settings.learnMoreAiCopilot',
            link: 'https://remix-ide.readthedocs.io/en/latest/ai.html',
            styleClass: 'text-primary'
          }
        },
        {
          name: 'ai-privacy-policy',
          label: 'settings.aiPrivacyPolicy',
          description: 'settings.aiPrivacyPolicyDescription',
          type: 'button',
          buttonOptions: {
            label: 'settings.viewPrivacyPolicy',
            action: 'link',
            link: 'https://remix-ide.readthedocs.io/en/latest/ai.html'
          }
        },
        {
          name: 'ollama-config',
          label: 'settings.ollamaConfig',
          description: 'settings.ollamaConfigDescription',
          type: 'toggle',
          toggleUIOptions: [{
            name: 'ollama-endpoint',
            type: 'text'
          }]
        }]
      },
      {
        title: 'settings.mcpServersSection',
        options: [{
          name: 'mcp/servers/enable' as keyof typeof initialState,
          label: 'settings.enableMCPEnhancement',
          description: 'settings.enableMCPEnhancementDescription',
          type: 'toggle' as const,
          footnote: {
            text: 'settings.learnMoreMcp',
            link: 'https://modelcontextprotocol.io/',
            styleClass: 'text-primary'
          }
        },
        {
          name: 'mcp-server-management' as keyof typeof initialState,
          label: 'settings.mcpServerConfiguration',
          description: 'settings.mcpServerConfigurationDescription',
          type: 'custom' as const,
          customComponent: 'mcpServerManager'
        }]
      },
      {
        title: 'settings.deepAgentSection',
        options: [{
          name: 'deepagent-config',
          label: 'settings.deepAgentTitle',
          description: 'settings.deepAgentDescription',
          type: 'toggle',
          toggleUIOptions: [{
            name: 'langchain-api-key',
            type: 'password'
          }, {
            name: 'deepagent-memory-backend',
            type: 'text'
          }],
          footnote: {
            text: 'settings.learnMoreDeepAgent',
            link: 'https://docs.langchain.com/oss/javascript/deepagents/overview',
            styleClass: 'text-primary'
          }
        }]
      }]
  },
  {
    key: 'services', label: 'settings.services', description: 'settings.servicesDescription', subSections: [
      {
        options: [{
          name: 'github-config',
          label: 'settings.gitAccessTokenTitle',
          type: 'toggle',
          toggleUIDescription: <GitHubCredentialsDescription />,
          toggleUIOptions: [{
            name: 'gist-access-token',
            type: 'password'
          }, {
            name: 'github-user-name',
            type: 'text'
          }, {
            name: 'github-email',
            type: 'text'
          }]
        }, {
          name: 'ipfs-config',
          label: 'settings.ipfs',
          type: 'toggle',
          toggleUIOptions: [{
            name: 'ipfs-url',
            type: 'text'
          }, {
            name: 'ipfs-protocol',
            type: 'text'
          }, {
            name: 'ipfs-port',
            type: 'text'
          }, {
            name: 'ipfs-project-id',
            type: 'text'
          }, {
            name: 'ipfs-project-secret',
            type: 'text'
          }]
        }, {
          name: 'swarm-config',
          label: 'settings.swarm',
          type: 'toggle',
          toggleUIOptions: [{
            name: 'swarm-private-bee-address',
            type: 'text'
          }, {
            name: 'swarm-postage-stamp-id',
            type: 'text'
          }]
        }, {
          name: 'sindri-config',
          label: 'settings.sindriAccessTokenTitle',
          type: 'toggle',
          toggleUIDescription: <SindriCredentialsDescription />,
          toggleUIOptions: [{
            name: 'sindri-access-token',
            type: 'password'
          }]
        }, {
          name: 'etherscan-config',
          label: 'settings.etherscanTokenTitle',
          type: 'toggle',
          toggleUIDescription: <EtherscanConfigDescription />,
          toggleUIOptions: [{
            name: 'etherscan-access-token',
            type: 'password'
          }]
        }]
      }]
  }
]

export const RemixUiSettings = (props: RemixUiSettingsProps) => {
  const appContext = useContext(AppContext)
  const appConfig = appContext?.appConfig || {}
  const intl = useIntl()
  const [settingsState, dispatch] = useReducer(settingReducer, initialState)
  const [selected, setSelected] = useState(settingsSections[0].key)
  const [search, setSearch] = useState('')
  const [filteredSections, setFilteredSections] = useState<SettingsSection[]>(settingsSections)
  const [filteredSection, setFilteredSection] = useState<SettingsSection>(settingsSections[0])
  const [state, setState] = useState<{
    themeQuality: { filter: string; name: string }
  }>({
    themeQuality: themes.light
  })
  const [visibleSections, setVisibleSections] = useState<SettingsSection[]>(settingsSections)

  // Derive visible sections based on app config
  const computeVisibleSections = (config: AppConfig): SettingsSection[] => {
    return settingsSections.filter(section => {
      if (section.key === 'account' && config['settings.account_management'] === false) {
        return false
      }
      return true
    })
  }

  // Recompute visible sections when shared app config changes
  useEffect(() => {
    const sections = computeVisibleSections(appConfig)
    setVisibleSections(sections)
    setFilteredSections(sections)
    if (!sections.find(s => s.key === selected)) {
      setSelected(sections[0]?.key)
      setFilteredSection(sections[0])
    }
  }, [appConfig])

  useEffect(() => {
    props.plugin.call('theme', 'currentTheme').then((theme) => {
      setState((prevState) => {
        return {
          ...prevState,
          themeQuality: theme.quality === 'dark' ? themes.dark : themes.light
        }
      })
    })

    props.plugin.on('theme', 'themeChanged', (theme: any) => {
      setState((prevState) => {
        dispatch({ type: 'SET_VALUE', payload: { name: 'theme', value: theme.name } })
        return {
          ...prevState,
          themeQuality: theme.quality === 'dark' ? themes.dark : themes.light
        }
      })

    })

    props.plugin.on('settings', 'copilotChoiceUpdated', (isChecked: any) => {
      dispatch({ type: 'SET_VALUE', payload: { name: 'copilot/suggest/activate', value: isChecked } })
    })

    props.plugin.on('settings', 'matomoPerfAnalyticsChoiceUpdated', (isChecked: any) => {
      dispatch({ type: 'SET_VALUE', payload: { name: 'matomo-perf-analytics', value: isChecked } })
    })

    // Listen for plugin event to open a specific settings section
    const onOpenSection = ({ sectionKey }: { sectionKey: string }) => {
      // Validate section key exists; fallback to 'general'
      const keys = settingsSections.map(s => s.key)
      const target = keys.includes(sectionKey) ? sectionKey : 'general'
      setSelected(target)
      const section = settingsSections.find(s => s.key === target)
      if (section) setFilteredSection(section)
    }

    props.plugin.on('settings', 'openSection', onOpenSection)

    return () => {
      try {
        props.plugin.off('settings', 'openSection')
      } catch (e) {
        console.log(e)
      }
    }

  }, [])

  useEffect(() => {
    if (search.length > 0) {
      const fuseTopLevel = new Fuse(visibleSections, {
        threshold: 0.1,
        keys: ['label', 'description', 'subSections.label', 'subSections.description', 'subSections.options.label', 'subSections.options.description', 'subSections.options.selectOptions.label', 'subSections.options.footnote.text']
      })
      const sectionResults = fuseTopLevel.search(search)
      const resultItems = sectionResults.map((result, index) => {
        if (index === 0) {
          const fuseLowLevel = new Fuse(result.item.subSections, {
            threshold: 0.1,
            keys: ['title', 'options.label', 'options.description', 'options.selectOptions.label', 'options.footnote.text']
          })
          const subSectionResults = fuseLowLevel.search(search)
          const filtSection = Object.assign({}, filteredSection, result.item)

          filtSection.subSections = subSectionResults.map((result) => result.item)
          setFilteredSection(filtSection)
        }
        return result.item
      })
      if (resultItems.length > 0) {
        setFilteredSections(resultItems)
        setSelected(resultItems[0].key)
      } else {
        setFilteredSections([])
        setSelected(null)
        setFilteredSection({} as SettingsSection)
      }
    } else {
      setFilteredSections(visibleSections)
      setFilteredSection(visibleSections[0])
      setSelected(visibleSections[0]?.key)
    }
  }, [search, visibleSections])

  return (
    <ThemeContext.Provider value={state.themeQuality}>
      {settingsState.toaster.value ? <Toaster message={settingsState.toaster.value as string} /> : null}
      <div className="container-fluid bg-light h-100 d-flex flex-column">
        <div className='pt-5'></div>
        <div className='d-flex flex-row pb-4 gap-4'>
          <div data-id="settings-sidebar-header" className="ps-3 remix-settings-sidebar" style={{ flex: '1 1 0', minWidth: '8em', maxWidth: '18em' }}>
            <h3 className={`fw-semibold ${state.themeQuality.name === 'dark' ? 'text-white' : 'text-black'}`} style={{ fontSize: '1.5rem' }}><FormattedMessage id="settings.displayName" /></h3>
          </div>
          <div className='d-flex flex-grow-1 remix-settings-search' style={{ maxWidth: '53.5em', minHeight: '4em' }}>
            <span className="input-group-text rounded-0 border-end-0 pe-0" style={{ backgroundColor: state.themeQuality.name === 'dark' ? 'var(--custom-onsurface-layer-4)' : 'var(--bs-body-bg)' }}><i className="fa fa-search"></i></span>
            <input type="text" className="form-control shadow-none h-100 rounded-0 border-start-0 no-outline w-100" placeholder={intl.formatMessage({ id: 'settings.searchSettings' })} style={{ minWidth: '21.5em' }} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {filteredSections.length === 0 ? <div className="text-info text-center cursor-pointer"><FormattedMessage id="settings.noMatchFound" /></div> :
          <div className="d-flex align-items-stretch flex-fill gap-4" style={{ minHeight: 0, overflow: 'hidden' }}>
            {/* Sidebar */}
            <div
              className="flex-column bg-transparent p-0 px-3 remix-settings-sidebar overflow-auto"
              style={{ flex: '1 1 0', minWidth: '8em', maxWidth: '18em', height: '100%' }}
              data-id="settings-sidebar-nav"
            >
              <ul className="list-unstyled" data-id="settings-sidebar-nav-ul">
                {filteredSections.map((section, index) => (
                  <li
                    className={`nav-item ${index !== filteredSections.length - 1 ? 'border-bottom' : ''} px-0 py-3 ${selected === section.key ? state.themeQuality.name === 'dark' ? 'active text-white' : 'active text-black' : 'text-secondary'}`}
                    key={index}
                    style={{ cursor: 'pointer' }}
                    data-id={`settings-sidebar-${section.key}-li`}
                  >
                    <a
                      data-id={`settings-sidebar-${section.key}`}
                      className="nav-link p-0 cursor-pointer"
                      onClick={() => {
                        setSelected(section.key)
                        setFilteredSection(section)
                      }}
                    >
                      <h5 className={`fw-semibold mb-2 ${selected === section.key ? state.themeQuality.name === 'dark' ? 'active text-white' : 'active text-black' : 'text-secondary'}`} style={{ fontSize: '1rem' }} data-id={`settings-sidebar-${section.key}-h5`}><FormattedMessage id={section.label} /></h5>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            {/* Main Content */}
            <div
              className="flex-column p-0"
              style={{ flex: '3 1 0', minWidth: 0, height: '100%' }}
            >
              <div className="remix-settings-main h-100 overflow-auto" style={{ maxWidth: '53.5em' }}>
                <SettingsSectionUI plugin={props.plugin} section={filteredSection} state={settingsState} dispatch={dispatch} />
              </div>
            </div>
          </div>}
      </div>
    </ThemeContext.Provider>
  )
}
