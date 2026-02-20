import React, { useContext, useEffect, useState } from 'react'
import { Dropdown } from 'react-bootstrap'
import { CustomToggle } from '@remix-ui/helper'
import { CustomMenu } from '@remix-ui/helper'
import { Provider } from '../types'
import { setExecutionContext } from '../actions'
import { EnvAppContext } from '../contexts'

export function EnvCategoryUI () {
  const { plugin, widgetState, dispatch, themeQuality } = useContext(EnvAppContext)
  const [subCategories, setSubCategories] = useState<Provider[]>([])
  const [provider, setProvider] = useState<Provider | null>(null)

  const handleCategorySelection = async (provider: Provider) => {
    await setExecutionContext(provider, plugin, widgetState, dispatch)
  }

  useEffect(() => {
    const provider = widgetState.providers.providerList.find(provider => provider.name === widgetState.providers.selectedProvider)

    setProvider(provider)
    if (provider && provider.category) {
      setSubCategories(widgetState.providers.providerList.filter(item => item.category === provider.category))
    }
  }, [widgetState.providers.providerList, widgetState.providers.selectedProvider])

  return provider?.category && subCategories.length > 0 ? (
    <Dropdown onClick={(e) => {
      e.preventDefault()
      e.stopPropagation()
    }}>
      <Dropdown.Toggle as={CustomToggle} data-id="settingsSelectEnvCategoryOptions" className="btn btn-secondary w-100 d-inline-block pe-0 border-0" icon="fas fa-caret-down text-secondary ms-2" useDefaultIcon={false} style={{ backgroundColor: 'var(--custom-onsurface-layer-3)' }}>
        <div style={{ flexGrow: 1, overflow: 'hidden', display:'flex', justifyContent:'left' }}>
          <div className="text-truncate text-secondary">
            {<span data-id="selectedVersion">{provider?.displayName}</span>}
          </div>
        </div>
      </Dropdown.Toggle>

      <Dropdown.Menu as={CustomMenu} className="w-100 custom-dropdown-items overflow-hidden" style={{ backgroundColor: 'var(--custom-onsurface-layer-3)', zIndex: 1000, '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black' } as React.CSSProperties}>
        {subCategories.map((provider) => {
          return (
            <Dropdown.Item key={provider.name} onClick={() => handleCategorySelection(provider)} data-id={`dropdown-item-${provider.name}`} className="category-item-hover" style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>
              {provider.displayName}
            </Dropdown.Item>
          )
        })}
      </Dropdown.Menu>
    </Dropdown>
  ) : null
}