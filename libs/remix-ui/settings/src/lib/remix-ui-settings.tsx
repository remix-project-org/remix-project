import { ViewPlugin } from '@remixproject/engine-web'
import React, {useState, useReducer, useEffect} from 'react' // eslint-disable-line
import Fuse from 'fuse.js'
import { EtherscanConfigDescription, GitHubCredentialsDescription, SindriCredentialsDescription } from '@remix-ui/helper'

import { initialState, settingReducer } from './settingsReducer'
import {Toaster} from '@remix-ui/toaster' // eslint-disable-line
import { ThemeModule } from '@remix-ui/theme-module'
import { ThemeContext, themes } from '@remix-ui/home-tab'
import { FormattedMessage } from 'react-intl'
import { Registry } from '@remix-project/remix-lib'
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
        title: 'Code editor',
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
        },{
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
      },
      {
        title: 'Appearance',
        options: [{
          name: 'theme',
          label: 'settings.theme',
          type: 'select',
          selectOptions: settingsConfig.themes.map((theme) => ({
            label: theme.name + ' (' + theme.quality + ')',
            value: theme.name
          }))
        }]
      }
    ]
  },
  { key: 'analytics', label: 'settings.analytics', description: 'settings.analyticsDescription', subSections: [
    { options: [{
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
        text: 'Manage Cookie Preferences',
        link: 'https://matomo.org/',
        styleClass: 'text-primary'
      }
    }]
    }
  ]},
  { key: 'ai', label: 'settings.ai', description: 'settings.aiDescription', subSections: [
    {
      options: [{
        name: 'copilot/suggest/activate',
        label: 'settings.aiCopilot',
        description: 'settings.aiCopilotDescription',
        type: 'toggle',
        footnote: {
          text: 'Learn more about AI Copilot',
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
      }]
    }
  ]},
  { key: 'services', label: 'settings.services', description: 'settings.servicesDescription', subSections: [
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
      },{
        name: 'etherscan-config',
        label: 'settings.etherscanTokenTitle',
        type: 'toggle',
        toggleUIDescription: <EtherscanConfigDescription />,
        toggleUIOptions: [{
          name: 'etherscan-access-token',
          type: 'password'
        }]
      }]
    }]}
]

export const RemixUiSettings = (props: RemixUiSettingsProps) => {
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

  useEffect(() => {
    props.plugin.call('theme', 'currentTheme').then((theme) => {
      setState((prevState) => {
        return {
          ...prevState,
          themeQuality: theme.quality === 'dark' ? themes.dark : themes.light
        }
      })
    })

    props.plugin.on('theme', 'themeChanged', (theme) => {
      setState((prevState) => {
        dispatch({ type: 'SET_VALUE', payload: { name: 'theme', value: theme.name } })
        return {
          ...prevState,
          themeQuality: theme.quality === 'dark' ? themes.dark : themes.light
        }
      })
    })

    props.plugin.on('settings', 'copilotChoiceUpdated', (isChecked) => {
      dispatch({ type: 'SET_VALUE', payload: { name: 'copilot/suggest/activate', value: isChecked } })
    })

    props.plugin.on('settings', 'matomoPerfAnalyticsChoiceUpdated', (isChecked) => {
      dispatch({ type: 'SET_VALUE', payload: { name: 'matomo-perf-analytics', value: isChecked } })
    })

  }, [])

  useEffect(() => {
    if (search.length > 0) {
      const fuseTopLevel = new Fuse(settingsSections, {
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
      setFilteredSections(settingsSections)
      setFilteredSection(settingsSections[0])
      setSelected(settingsSections[0].key)
    }
  }, [search])

  return (
    <ThemeContext.Provider value={state.themeQuality}>
      {settingsState.toaster.value ? <Toaster message={settingsState.toaster.value as string} /> : null}
      <div className="container-fluid bg-light">
        <div className='pt-5'></div>
        <div className='d-flex flex-row pb-4'>
          <div data-id="settings-sidebar-header" className="input-group ps-5 remix-settings-sidebar">
            <h2 className={`d-inline-block pe-5 ${state.themeQuality.name === 'dark' ? 'text-white' : 'text-black'}`} style={{ width: '7.8em' }}><FormattedMessage id="settings.displayName" /></h2>
            <div className='d-flex flex-grow-1 remix-settings-search' style={{ maxWidth: '53.5em', minHeight: '4em' }}>
              <span className="input-group-text rounded-0 border-end-0 pe-0" style={{ backgroundColor: state.themeQuality.name === 'dark' ? 'var(--custom-onsurface-layer-4)' : 'var(--bs-body-bg)' }}><i className="fa fa-search"></i></span>
              <input type="text" className="form-control shadow-none h-100 rounded-0 border-start-0 no-outline" placeholder="Search settings" style={{ minWidth: '21.5em', width: '100%' }} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        {filteredSections.length === 0 ? <div className="text-info text-center" style={{ cursor: 'pointer' }}>No match found</div> :
          <div className="d-flex flex-wrap align-items-stretch">
            {/* Sidebar */}
            <div
              className="flex-column bg-transparent p-0 px-5 remix-settings-sidebar"
              style={{ width: '28.2em' }}
            >
              <ul className="list-unstyled">
                {filteredSections.map((section, index) => (
                  <li
                    className={`nav-item ${index !== filteredSections.length - 1 ? 'border-bottom' : ''} px-0 py-3 ${selected === section.key ? state.themeQuality.name === 'dark' ? 'active text-white' : 'active text-black' : 'text-secondary'}`}
                    key={index}
                  >
                    <a
                      data-id={`settings-sidebar-${section.key}`}
                      className="nav-link p-0"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelected(section.key)
                        setFilteredSection(section)
                      }}
                    >
                      <h4 className={`${selected === section.key ? state.themeQuality.name === 'dark' ? 'active text-white' : 'active text-black' : 'text-secondary'}`}><FormattedMessage id={section.label} /></h4>
                      {selected !== section.key && <span><FormattedMessage id={section.description} /></span>}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            {/* Main Content */}
            <div
              className="flex-column p-0 flex-grow-1"
              style={{ minWidth: 0, flexBasis: '27.3em', flexGrow: 1, flexShrink: 1, maxWidth: '50%' }}
            >
              <div className="remix-settings-main" style={{ maxWidth: '53.5em', overflowY: 'auto', maxHeight: '58vh' }}>
                <SettingsSectionUI plugin={props.plugin} section={filteredSection} state={settingsState} dispatch={dispatch} />
              </div>
            </div>
          </div> }
      </div>
    </ThemeContext.Provider>
  )
}
