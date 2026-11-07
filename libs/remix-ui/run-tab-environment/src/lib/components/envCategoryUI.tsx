import React, { useContext, useEffect, useState } from 'react'
import { Select } from '@remix-ui/helper'
import { Provider } from '../types'
import { setExecutionContext } from '../actions'
import { EnvAppContext } from '../contexts'
import { TrackingContext } from '@remix-ide/tracking'

// value of the "select" row, which clears the choice of a Dev / Browser Extension provider
const SELECT_OPTION = 'select'

export const EnvCategoryUI: React.FC = () => {
  const { plugin, widgetState, dispatch } = useContext(EnvAppContext)
  const { trackMatomoEvent } = useContext(TrackingContext)
  const [subCategories, setSubCategories] = useState<Provider[]>([])
  const [provider, setProvider] = useState<Provider | null>(null)
  const [enforceSelect, setEnforceSelect] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string>(null)

  const handleCategorySelection = async (provider: Provider) => {
    trackMatomoEvent?.({ category: 'udapp', action: 'categorySelected', name: provider.displayName, isClick: true })
    dispatch({ type: 'CLEAR_ALL_ACCOUNTS', payload: null })
    await setExecutionContext(provider, plugin, dispatch)
    setEnforceSelect(false)
    setSelectedOption(provider.name)
  }

  useEffect(() => {
    const provider = widgetState.providers.providerList.find(provider => provider.name === widgetState.providers.selectedProvider)

    setProvider(provider)
    if (provider && provider.category) {
      setSubCategories(widgetState.providers.providerList.filter(item => item.category === provider.category))
    }
    if (provider?.category === 'Dev' || provider?.category === 'Browser Extension') {
      if (provider?.name !== selectedOption) {
        setEnforceSelect(true)
        dispatch({ type: 'CLEAR_ALL_ACCOUNTS', payload: null })
      }
    } else {
      setEnforceSelect(false)
    }
  }, [widgetState.providers.providerList, widgetState.providers.selectedProvider])

  const canResetSelection = provider?.category === 'Dev' || provider?.category === 'Browser Extension'

  return provider?.category && subCategories.length > 0 ? (
    <Select
      id="settingsSelectEnvCategoryOptions"
      align="end"
      value={enforceSelect ? SELECT_OPTION : provider.name}
      options={[
        // Dev and Browser Extension providers need an explicit choice: "select" goes back to that state
        ...(canResetSelection ? [{ value: SELECT_OPTION, label: 'select' }] : []),
        ...subCategories.map((provider) => ({ value: provider.name, label: provider.displayName }))
      ]}
      itemDataId={(o) => `dropdown-item-${o.value}`}
      renderValue={() => <span data-id="selectedVersion">{enforceSelect ? '<select>' : provider?.displayName}</span>}
      onToggle={(willOpen) => {
        if (willOpen) {
          trackMatomoEvent?.({ category: 'udapp', action: 'categoryDropdownOpen', name: provider?.category || 'category' })
        }
      }}
      onChange={(name) => {
        if (name === SELECT_OPTION) {
          setEnforceSelect(true)
          dispatch({ type: 'CLEAR_ALL_ACCOUNTS', payload: null })
        } else {
          handleCategorySelection(subCategories.find((provider) => provider.name === name))
        }
      }}
    />
  ) : null
}
