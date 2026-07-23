import React, { useContext, useEffect, useState } from 'react'
import { SettingsActions, SettingsSection, SettingsState } from '../types'
import { ToggleSwitch } from '@remix-ui/toggle'
import { FormattedMessage, useIntl } from 'react-intl'
import SelectDropdown from './select-dropdown'
import { ThemeContext } from '@remix-ui/home-tab'
import type { ViewPlugin } from '@remixproject/engine-web'
import { CustomTooltip } from '@remix-ui/helper'
import { IMCPServerManager } from './mcp-server-manager'
import { ProfileSection, CreditsBalance, ConnectedAccounts } from './account-settings'
import { validateApiKeyFormat, testApiKey, getProviderFromSettingKey, type ModelProvider } from '@remix/remix-ai-core'

type SettingsSectionUIProps = {
  plugin: ViewPlugin,
  section: SettingsSection,
  state: SettingsState,
  dispatch: React.Dispatch<SettingsActions>
}

type ButtonOptions = SettingsSection['subSections'][0]['options'][0]['buttonOptions']

export const SettingsSectionUI: React.FC<SettingsSectionUIProps> = ({ plugin, section, state, dispatch }) => {
  const [formUIData, setFormUIData] = useState<{ [key in keyof SettingsState]: Record<keyof SettingsState, string> }>({} as any)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(true) // Default to true for non-auth sections
  const [authLoading, setAuthLoading] = useState<boolean>(false)
  // API key validation state
  const [apiKeyErrors, setApiKeyErrors] = useState<Record<string, string>>({})
  const [apiKeyTestStatus, setApiKeyTestStatus] = useState<Record<string, 'idle' | 'testing' | 'valid' | 'invalid'>>({})
  const theme = useContext(ThemeContext)
  const isDark = theme.name === 'dark'
  const intl = useIntl()

  const isApiKeySetting = (name: string): boolean => {
    return name.includes('deepagent-') && name.includes('-api-key')
  }

  const validateApiKey = (name: string, value: string): string | null => {
    if (!isApiKeySetting(name) || !value) return null
    const provider = getProviderFromSettingKey(name)
    if (!provider) return null

    const result = validateApiKeyFormat(provider, value)
    return result.isValid ? null : (result.error || 'Invalid API key format')
  }

  const handleTestApiKey = async (optionName: string, toggleOptionName: string) => {
    // Look up value from form data (keyed by optionName -> toggleOptionName) or from state
    const value = formUIData[optionName as keyof SettingsState]?.[toggleOptionName as keyof SettingsState] ||
                  (state[toggleOptionName as keyof SettingsState]?.value as string) || ''
    if (!value) {
      console.log('[Settings] No value found for API key test:', { optionName, toggleOptionName })
      return
    }

    const provider = getProviderFromSettingKey(toggleOptionName)
    if (!provider) {
      console.log('[Settings] Could not determine provider from:', toggleOptionName)
      return
    }

    console.log('[Settings] Testing API key for provider:', provider)
    setApiKeyTestStatus(prev => ({ ...prev, [toggleOptionName]: 'testing' }))

    try {
      const result = await testApiKey(provider, value)
      console.log('[Settings] API key test result:', result)
      setApiKeyTestStatus(prev => ({ ...prev, [toggleOptionName]: result.isValid ? 'valid' : 'invalid' }))
      if (!result.isValid && result.error) {
        setApiKeyErrors(prev => ({ ...prev, [toggleOptionName]: result.error || '' }))
      } else {
        setApiKeyErrors(prev => ({ ...prev, [toggleOptionName]: '' }))
      }
    } catch (error: any) {
      console.error('[Settings] API key test error:', error)
      setApiKeyTestStatus(prev => ({ ...prev, [toggleOptionName]: 'invalid' }))
      setApiKeyErrors(prev => ({ ...prev, [toggleOptionName]: error?.message || 'Test failed' }))
    }

    // Reset status after 5 seconds
    setTimeout(() => {
      setApiKeyTestStatus(prev => ({ ...prev, [toggleOptionName]: 'idle' }))
    }, 5000)
  }

  // Test all API keys that have values
  const handleTestAllApiKeys = async (optionName: string, toggleOptions: { name: keyof SettingsState; type: 'text' | 'password' | 'number' }[]) => {
    const apiKeyOptions = toggleOptions.filter(opt => isApiKeySetting(opt.name as string))
    let testedCount = 0
    let validCount = 0

    for (const opt of apiKeyOptions) {
      const value = formUIData[optionName as keyof SettingsState]?.[opt.name] ||
                    (state[opt.name]?.value as string) || ''
      if (value) {
        testedCount++
        await handleTestApiKey(optionName, opt.name as string)
        // Check if the test was valid
        if (apiKeyTestStatus[opt.name as string] === 'valid') {
          validCount++
        }
      }
    }

    if (testedCount === 0) {
      dispatch({ type: 'SET_TOAST_MESSAGE', payload: { value: 'No API keys to test' } })
    } else {
      dispatch({ type: 'SET_TOAST_MESSAGE', payload: { value: `Tested ${testedCount} API key(s)` } })
    }
  }

  useEffect(() => {
    if (section) {
      (section.subSections || []).forEach((subSection) => {
        (subSection.options || []).forEach((option) => {
          if (option.type === 'toggle' && option.toggleUIOptions) {
            option.toggleUIOptions.forEach((toggleOption) => {
              handleFormUIData(option.name, toggleOption.name, state[toggleOption.name].value as string)
            })
          }
        })
      })
    }
  }, [section])

  // Check authentication for sections that require it
  useEffect(() => {
    if (section?.requiresAuth) {
      const checkAuth = async () => {
        try {
          setAuthLoading(true)
          const user = await plugin.call('auth', 'getUser')
          setIsLoggedIn(!!user)
        } catch (err) {
          setIsLoggedIn(false)
        } finally {
          setAuthLoading(false)
        }
      }

      checkAuth()

      const onAuthStateChanged = async () => {
        await checkAuth()
      }

      try {
        plugin.on('auth', 'authStateChanged', onAuthStateChanged)
      } catch (e) {
        // noop
      }

      return () => {
        try {
          plugin.off('auth', 'authStateChanged')
        } catch (e) {
          // ignore
        }
      }
    }
  }, [section, plugin])

  const handleToggle = (name: string) => {
    if (state[name]) {
      const newValue = !state[name].value
      dispatch({ type: 'SET_LOADING', payload: { name: name } })
      dispatch({ type: 'SET_VALUE', payload: { name: name, value: newValue } })
      if (!newValue && formUIData[name]) {
        Object.keys(formUIData[name]).forEach((key) => {
          dispatch({ type: 'SET_VALUE', payload: { name: key, value: '' } })
        })
        dispatch({ type: 'SET_TOAST_MESSAGE', payload: { value: intl.formatMessage({ id: 'settings.credentialsRemoved' }) } })
      }
      if (name === 'copilot/suggest/activate') plugin.emit('copilotChoiceUpdated', newValue)
      if (name === 'matomo-perf-analytics') plugin.call('settings', 'updateMatomoPerfAnalyticsChoice', newValue)
      if (name === 'text-wrap') plugin.emit('textWrapChoiceUpdated', newValue)
      if (name === 'editor/code-analysis-popover') plugin.emit('codeAnalysisPopoverChoiceUpdated', newValue)
      if (name === 'mcp/servers/enable') plugin.call('remixAI', newValue ? 'enableMCPEnhancement' : 'disableMCPEnhancement')
    } else {
      console.error('Setting does not exist: ', name)
    }
  }

  const handleButtonClick = (buttonOptions: ButtonOptions) => {
    if (buttonOptions && buttonOptions.action === 'link') {
      window.open(buttonOptions.link, '_blank')
    }
  }

  const handleFormUIData = (optionName: keyof SettingsState, toggleOptionName: keyof SettingsState, value: string) => {
    setFormUIData(formUIData => ({ ...formUIData, [optionName]: { ...formUIData[optionName], [toggleOptionName]: value } }))

    // Validate API key format on change
    const error = validateApiKey(toggleOptionName as string, value)
    if (error) {
      setApiKeyErrors(prev => ({ ...prev, [toggleOptionName]: error }))
    } else {
      setApiKeyErrors(prev => ({ ...prev, [toggleOptionName]: '' }))
    }
    // Reset test status on change
    setApiKeyTestStatus(prev => ({ ...prev, [toggleOptionName]: 'idle' }))
  }

  const saveFormUIData = (optionName: keyof SettingsState) => {
    // Check for API key validation errors before saving
    const keys = Object.keys(formUIData[optionName] || {})
    for (const key of keys) {
      if (isApiKeySetting(key) && formUIData[optionName][key]) {
        const error = validateApiKey(key, formUIData[optionName][key])
        if (error) {
          setApiKeyErrors(prev => ({ ...prev, [key]: error }))
          dispatch({ type: 'SET_TOAST_MESSAGE', payload: { value: intl.formatMessage({ id: 'settings.apiKeyFormatError' }) + ': ' + error } })
          return // Don't save if there are validation errors
        }
      }
    }

    Object.keys(formUIData[optionName]).forEach((key) => {
      dispatch({ type: 'SET_VALUE', payload: { name: key, value: formUIData[optionName][key] } })
    })
    dispatch({ type: 'SET_TOAST_MESSAGE', payload: { value: intl.formatMessage({ id: 'settings.credentialsUpdated' }) } })
  }

  return (
    <>
      <h4 className={`${isDark ? 'text-white' : 'text-black'} py-3`} style={{ fontSize: '1.5rem' }}>{<FormattedMessage id={section.label} />}</h4>
      <span className={`${isDark ? 'text-white' : 'text-black'}`} style={{ fontSize: '0.95rem' }}>{<FormattedMessage id={section.description} />}</span>

      {/* Show loading state for auth-required sections */}
      {section.requiresAuth && authLoading && (
        <div className="pt-3">
          <div className="spinner-border spinner-border-sm" role="status">
            <span className="sr-only"><FormattedMessage id="settings.loading" /></span>
          </div>
          <span className="ms-2"><FormattedMessage id="settings.loading" /></span>
        </div>
      )}

      {/* Show warning for auth-required sections when not logged in */}
      {section.requiresAuth && !authLoading && !isLoggedIn && (
        <div className="pt-3">
          <div className="alert alert-warning" role="alert">
            <i className="fas fa-exclamation-triangle me-2"></i>
            <FormattedMessage id="settings.notLoggedIn" />
          </div>
        </div>
      )}

      {/* Show subsections only if auth is not required OR user is logged in */}
      {(!section.requiresAuth || (section.requiresAuth && isLoggedIn && !authLoading)) && (section.subSections || []).map((subSection, subSectionIndex) => {
        const isLastItem = subSectionIndex === section.subSections.length - 1

        return (
          <div key={subSectionIndex} className='pt-3'>
            {subSection.title && <h5 className={`${isDark ? 'text-white' : 'text-black'}`} style={{ fontSize: '1.2rem' }}><FormattedMessage id={subSection.title} /></h5>}
            {subSection.description && <p className={`text-muted mb-3`} style={{ fontSize: '0.85rem' }}><FormattedMessage id={subSection.description} /></p>}
            <div className={`card ${isDark ? 'text-light' : 'text-dark'} border-0 ${isLastItem ? 'mb-4' : ''}`}>
              <div className={`card-body ${section.key === 'account' ? 'pt-1' : ''}`} style={section.key === 'account' ? {} : { padding: '0.75rem' }}>
                {subSection.options.map((option, optionIndex) => {
                  const isFirstOption = optionIndex === 0
                  const isLastOption = optionIndex === subSection.options.length - 1
                  const toggleValue = state[option.name] && typeof state[option.name].value === 'boolean' ? state[option.name].value as boolean : false
                  const selectValue = state[option.name] && typeof state[option.name].value === 'string' ? state[option.name].value as string : ''

                  const isAccountSection = section.key === 'account'
                  const paddingClass = isAccountSection
                    ? (isLastOption ? 'pt-0 pb-0' : isFirstOption ? 'border-bottom pb-1' : 'border-bottom py-1')
                    : (isLastOption ? 'pt-2 pb-0' : isFirstOption ? 'border-bottom pb-2' : 'border-bottom py-2')

                  return (
                    <div className={`card border-0 rounded-0 ${paddingClass}`} key={optionIndex}>
                      {option.label && option.label.length > 0 && (
                        <div className="d-flex align-items-center">
                          <h6 data-id={`settingsTab${option.name}Label`} className={`${option.headerClass || (isDark ? 'text-white' : 'text-black')} m-0`} style={{ fontSize: '1rem' }}>
                            <FormattedMessage id={option.label} />
                            {option.labelIconTooltip ?
                              <CustomTooltip tooltipText={<FormattedMessage id={option.labelIconTooltip} />}><i className={option.labelIcon}></i></CustomTooltip> :
                              option.labelIcon && <i className={option.labelIcon}></i>
                            }
                          </h6>
                          <div className="ms-auto">
                            {option.type === 'toggle' && <ToggleSwitch id={option.name} isOn={toggleValue} onClick={() => handleToggle(option.name)} disabled = {option.name === "matomo-analytics" ? true : false}/>}
                            {option.type === 'select' && <div style={{ minWidth: '110px' }}><SelectDropdown value={selectValue} options={option.selectOptions} name={option.name} dispatch={dispatch as any} /></div>}
                            {option.type === 'button' && <button className="btn btn-secondary btn-sm" onClick={() => handleButtonClick(option.buttonOptions)}><FormattedMessage id={option.buttonOptions?.label} /></button>}
                            {option.type === 'custom' && option.customComponent === 'mcpServerManager' && <span></span>}
                            {option.type === 'custom' && option.customComponent === 'profileSection' && <span></span>}
                            {option.type === 'custom' && option.customComponent === 'creditsBalance' && <span></span>}
                            {option.type === 'custom' && option.customComponent === 'connectedAccounts' && <span></span>}
                          </div>
                        </div>
                      )}
                      {option.description && option.label && option.label.length > 0 && <span className="text-secondary mt-1" style={{ fontSize: '0.9rem' }}>{typeof option.description === 'string' ? <FormattedMessage id={option.description} /> : option.description}</span>}
                      {option.type === 'custom' && option.customComponent === 'mcpServerManager' && (
                        <div className="mt-3">
                          <IMCPServerManager plugin={plugin} />
                        </div>
                      )}
                      {option.type === 'custom' && option.customComponent === 'profileSection' && (
                        <div className="mt-3">
                          <ProfileSection plugin={plugin} />
                        </div>
                      )}
                      {option.type === 'custom' && option.customComponent === 'creditsBalance' && (
                        <div className="mt-3">
                          <CreditsBalance plugin={plugin} />
                        </div>
                      )}
                      {option.type === 'custom' && option.customComponent === 'connectedAccounts' && (
                        <div className="mt-3">
                          <ConnectedAccounts plugin={plugin} />
                        </div>
                      )}
                      {
                        option.footnote ? option.footnote.link ?
                          <a href={option.footnote.link} className={`mt-1 ${option.footnote.styleClass}`} target="_blank" rel="noopener noreferrer"><FormattedMessage id={option.footnote.text} /></a>
                          :
                          <span className={`text-secondary mt-1 ${option.footnote.styleClass}`}><FormattedMessage id={option.footnote.text} /></span>
                          : null
                      }
                      {option.toggleUIDescription && toggleValue && <span className="text-secondary mt-1">{option.toggleUIDescription}</span>}
                      {option.toggleUIOptions && toggleValue && option.toggleUIOptions.map((toggleOption, toggleOptionIndex) => {
                        const isLastOption = toggleOptionIndex === (option.toggleUIOptions as any).length - 1
                        const inputValue = state[toggleOption.name] && typeof state[toggleOption.name].value === 'string' ? state[toggleOption.name].value as string : ''

                        return state[toggleOption.name] && (
                          <div key={toggleOptionIndex}>
                            <div className={`${isDark ? 'text-white' : 'text-black'} ${isLastOption ? 'mt-2 mb-0' : 'my-2'}`}>
                              <input
                                name={toggleOption.name}
                                data-id={`settingsTab${toggleOption.name}`}
                                type={toggleOption.type}
                                className="form-control"
                                onChange={(e) => handleFormUIData(option.name, toggleOption.name, e.target.value)}
                                defaultValue={inputValue}
                                placeholder={intl.formatMessage({ id: `settings.${toggleOption.name}` })}
                              />
                            </div>
                            {/* Show validation error for API keys */}
                            {isApiKeySetting(toggleOption.name as string) && apiKeyErrors[toggleOption.name as string] && (
                              <div className="text-danger small mt-1">
                                <i className="fas fa-exclamation-circle me-1"></i>
                                {apiKeyErrors[toggleOption.name as string]}
                              </div>
                            )}
                            {/* Show test status indicator for API keys */}
                            {isApiKeySetting(toggleOption.name as string) && apiKeyTestStatus[toggleOption.name as string] === 'valid' && (
                              <div className="text-success small mt-1">
                                <i className="fas fa-check-circle me-1"></i>
                                <FormattedMessage id="settings.apiKeyValid" />
                              </div>
                            )}
                            {isLastOption && <div className="d-flex pt-3 gap-2">
                              <input
                                className="btn btn-sm btn-primary"
                                id={`settingsTabSave${option.name}`}
                                data-id={`settingsTabSave${option.name}`}
                                onClick={() => saveFormUIData(option.name)}
                                value={intl.formatMessage({ id: 'settings.save' })}
                                type="button"
                              ></input>
                              {/* Test button for API key settings */}
                              {option.toggleUIOptions?.some(opt => isApiKeySetting(opt.name as string)) && (
                                <button
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => handleTestAllApiKeys(option.name as string, option.toggleUIOptions || [])}
                                  disabled={option.toggleUIOptions?.some(opt =>
                                    isApiKeySetting(opt.name as string) && apiKeyTestStatus[opt.name as string] === 'testing'
                                  )}
                                >
                                  {option.toggleUIOptions?.some(opt =>
                                    isApiKeySetting(opt.name as string) && apiKeyTestStatus[opt.name as string] === 'testing'
                                  ) ? (
                                      <>
                                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                        <FormattedMessage id="settings.testing" />
                                      </>
                                    ) : (
                                      <FormattedMessage id="settings.testApiKey" />
                                    )}
                                </button>
                              )}
                            </div>
                            }
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )})}
    </>
  )
}
