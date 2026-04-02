import React, { useContext, useEffect, useState } from 'react'
import { SettingsActions, SettingsSection, SettingsState } from '../types'
import { ToggleSwitch } from '@remix-ui/toggle'
import { FormattedMessage, useIntl } from 'react-intl'
import SelectDropdown from './select-dropdown'
import { ThemeContext } from '@remix-ui/home-tab'
import type { ViewPlugin } from '@remixproject/engine-web'
import { CustomTooltip } from '@remix-ui/helper'
import { IMCPServerManager } from './mcp-server-manager'
import { ProfileSection, CreditsBalance, ConnectedAccounts, BillingSection } from './account-settings'

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
  const theme = useContext(ThemeContext)
  const isDark = theme.name === 'dark'
  const intl = useIntl()

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
      if (name === 'whitespace-normal') plugin.emit('textWrapChoiceUpdated', newValue)
    } else {
      console.error('Setting does not exist: ', name)
    }
  }

  const handleButtonClick = (buttonOptions: ButtonOptions) => {
    if (buttonOptions.action === 'link') {
      window.open(buttonOptions.link, '_blank')
    }
  }

  const handleFormUIData = (optionName: keyof SettingsState, toggleOptionName: keyof SettingsState, value: string) => {
    setFormUIData(formUIData => ({ ...formUIData, [optionName]: { ...formUIData[optionName], [toggleOptionName]: value } }))
  }

  const saveFormUIData = (optionName: keyof SettingsState) => {
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
          <div className="animate-spin inline-block w-4 h-4 border-[3px] border-current border-t-transparent text-blue-600 rounded-full" role="status">
            <span className="sr-only"><FormattedMessage id="settings.loading" /></span>
          </div>
          <span className="ml-2"><FormattedMessage id="settings.loading" /></span>
        </div>
      )}

      {/* Show warning for auth-required sections when not logged in */}
      {section.requiresAuth && !authLoading && !isLoggedIn && (
        <div className="pt-3">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-md" role="alert">
            <i className="fas fa-exclamation-triangle mr-2"></i>
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
            {subSection.description && <p className={`text-gray-500 dark:text-gray-400 mb-3`} style={{ fontSize: '0.85rem' }}><FormattedMessage id={subSection.description} /></p>}
            <div className={`bg-white dark:bg-gray-800 rounded-lg border-0 shadow-sm ${isDark ? 'text-gray-100' : 'text-gray-900'} ${isLastItem ? 'mb-4' : ''}`}>
              <div className={`${section.key === 'account' ? 'pt-1' : 'p-3'}`}>
                {subSection.options.map((option, optionIndex) => {
                  const isFirstOption = optionIndex === 0
                  const isLastOption = optionIndex === subSection.options.length - 1
                  const toggleValue = state[option.name] && typeof state[option.name].value === 'boolean' ? state[option.name].value as boolean : false
                  const selectValue = state[option.name] && typeof state[option.name].value === 'string' ? state[option.name].value as string : ''

                  const isAccountSection = section.key === 'account'
                  const paddingClass = isAccountSection
                    ? (isLastOption ? 'pt-0 pb-0' : isFirstOption ? 'border-b pb-1' : 'border-b py-1')
                    : (isLastOption ? 'pt-2 pb-0' : isFirstOption ? 'border-b pb-2' : 'border-b py-2')

                  return (
                    <div className={`border-0 ${paddingClass}`} key={optionIndex}>
                      {option.label && option.label.length > 0 && (
                        <div className="flex items-center">
                          <h6 data-id={`settingsTab${option.name}Label`} className={`${option.headerClass || (isDark ? 'text-white' : 'text-black')} m-0`} style={{ fontSize: '1rem' }}>
                            <FormattedMessage id={option.label} />
                            {option.labelIconTooltip ?
                              <CustomTooltip tooltipText={<FormattedMessage id={option.labelIconTooltip} />}><i className={option.labelIcon}></i></CustomTooltip> :
                              option.labelIcon && <i className={option.labelIcon}></i>
                            }
                          </h6>
                          <div className="ml-auto">
                            {option.type === 'toggle' && <ToggleSwitch id={option.name} isOn={toggleValue} onClick={() => handleToggle(option.name)} disabled = {option.name === "matomo-analytics" ? true : false}/>}
                            {option.type === 'select' && <div style={{ minWidth: '110px' }}><SelectDropdown value={selectValue} options={option.selectOptions} name={option.name} dispatch={dispatch as any} /></div>}
                            {option.type === 'button' && <button className="px-3 py-1.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors" onClick={() => handleButtonClick(option.buttonOptions)}><FormattedMessage id={option.buttonOptions.label} /></button>}
                            {option.type === 'custom' && option.customComponent === 'mcpServerManager' && <span></span>}
                            {option.type === 'custom' && option.customComponent === 'profileSection' && <span></span>}
                            {option.type === 'custom' && option.customComponent === 'creditsBalance' && <span></span>}
                            {option.type === 'custom' && option.customComponent === 'connectedAccounts' && <span></span>}
                            {option.type === 'custom' && option.customComponent === 'billingSection' && <span></span>}
                          </div>
                        </div>
                      )}
                      {option.description && option.label && option.label.length > 0 && <span className="text-gray-500 dark:text-gray-400 mt-1" style={{ fontSize: '0.9rem' }}>{typeof option.description === 'string' ? <FormattedMessage id={option.description} /> : option.description}</span>}
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
                      {option.type === 'custom' && option.customComponent === 'billingSection' && (
                        <div className="mt-3">
                          <BillingSection plugin={plugin} />
                        </div>
                      )}
                      {
                        option.footnote ? option.footnote.link ?
                          <a href={option.footnote.link} className={`mt-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 ${option.footnote.styleClass}`} target="_blank" rel="noopener noreferrer"><FormattedMessage id={option.footnote.text} /></a>
                          :
                          <span className={`text-gray-500 dark:text-gray-400 mt-1 ${option.footnote.styleClass}`}><FormattedMessage id={option.footnote.text} /></span>
                          : null
                      }
                      {option.toggleUIDescription && toggleValue && <span className="text-gray-500 dark:text-gray-400 mt-1">{option.toggleUIDescription}</span>}
                      {option.toggleUIOptions && toggleValue && option.toggleUIOptions.map((toggleOption, toggleOptionIndex) => {
                        const isLastOption = toggleOptionIndex === option.toggleUIOptions.length - 1
                        const inputValue = state[toggleOption.name] && typeof state[toggleOption.name].value === 'string' ? state[toggleOption.name].value as string : ''

                        return state[toggleOption.name] && (
                          <div key={toggleOptionIndex}>
                            <div className={`${isDark ? 'text-white' : 'text-black'} ${isLastOption ? 'mt-2 mb-0' : 'my-2'}`}>
                              <input
                                name={toggleOption.name}
                                data-id={`settingsTab${toggleOption.name}`}
                                type={toggleOption.type}
                                className="w-full px-3 py-2 border border-theme rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                onChange={(e) => handleFormUIData(option.name, toggleOption.name, e.target.value)}
                                defaultValue={inputValue}
                                placeholder={intl.formatMessage({ id: `settings.${toggleOption.name}` })}
                              />
                            </div>
                            {isLastOption && <div className="flex pt-3">
                              <input
                                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors cursor-pointer"
                                id={`settingsTabSave${option.name}`}
                                data-id={`settingsTabSave${option.name}`}
                                onClick={() => saveFormUIData(option.name)}
                                value={intl.formatMessage({ id: 'settings.save' })}
                                type="button"
                                // disabled={!formUIData[option.name]}
                              ></input>
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