import React, { useContext, useEffect, useState } from 'react'
import { Dropdown } from 'react-bootstrap'
import { CustomToggle } from '@remix-ui/helper'
import { CustomMenu } from '@remix-ui/helper'
import { Provider } from '../types'
import { setExecutionContext } from '../actions'
import { EnvAppContext } from '../contexts'
import { TrackingContext } from '@remix-ide/tracking'

export interface EnvCategoryUIProps {
  isOpen: boolean
  onToggle: (isOpen: boolean) => void
}

export const EnvCategoryUI: React.FC<EnvCategoryUIProps> = ({ isOpen, onToggle }) => {
  const { plugin, widgetState, dispatch, themeQuality } = useContext(EnvAppContext)
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

  return provider?.category && subCategories.length > 0 ? (
    <Dropdown
      show={isOpen}
      onToggle={(willOpen) => {
        if (willOpen) {
          trackMatomoEvent?.({ category: 'udapp', action: 'categoryDropdownOpen', name: provider?.category || 'category' })
        }
        onToggle(willOpen)
      }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <Dropdown.Toggle as={CustomToggle} data-id="settingsSelectEnvCategoryOptions" className="btn btn-secondary w-100 d-inline-block pe-0" icon="fas fa-caret-down text-secondary ms-2" useDefaultIcon={false} style={{ backgroundColor: 'var(--custom-onsurface-layer-3)', border: '1px solid var(--bs-border-color)' }}>
        <div style={{ flexGrow: 1, overflow: 'hidden', display:'flex', justifyContent:'left' }}>
          <div className="text-truncate text-secondary">
            {<span data-id="selectedVersion">{enforceSelect ? '<select>' : provider?.displayName}</span>}
          </div>
        </div>
      </Dropdown.Toggle>

      <Dropdown.Menu as={CustomMenu} className="custom-dropdown-items overflow-hidden" style={{ backgroundColor: 'var(--custom-onsurface-layer-3)', border: '1px solid var(--bs-border-color)', zIndex: 1000, '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black', padding: 0, minWidth: 'max-content', width: 'auto' } as React.CSSProperties}>
        { (provider?.category === 'Dev' || provider?.category === 'Browser Extension') && <Dropdown.Item onClick={() => {
          setEnforceSelect(true)
          dispatch({ type: 'CLEAR_ALL_ACCOUNTS', payload: null })
        }}>select</Dropdown.Item> }
        {subCategories.map((provider) => {
          return (
            <Dropdown.Item key={provider.name} onClick={() => handleCategorySelection(provider)} data-id={`dropdown-item-${provider.name}`} className="category-item-hover px-2">
              {provider.displayName}
            </Dropdown.Item>
          )
        })}
      </Dropdown.Menu>
    </Dropdown>
  ) : null
}