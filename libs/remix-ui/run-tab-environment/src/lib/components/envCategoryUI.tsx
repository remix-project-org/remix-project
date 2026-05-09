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

export const getUnpinnedContractCount = (
  deployedContractsCount: number,
  pinnedContractsCount: number
): number => {
  return Math.max(deployedContractsCount - pinnedContractsCount, 0)
}

const runUnpinnedContractDebugChecks = () => {
  console.assert(getUnpinnedContractCount(1, 0) === 1, 'Expected 1 unpinned contract')
  console.assert(getUnpinnedContractCount(2, 1) === 1, 'Expected 1 unpinned contract')
  console.assert(getUnpinnedContractCount(1, 1) === 0, 'Expected 0 unpinned contracts')
  console.assert(getUnpinnedContractCount(0, 0) === 0, 'Expected 0 unpinned contracts')
  console.assert(getUnpinnedContractCount(1, 2) === 0, 'Expected count to never go below 0')
  console.log('Unpinned contract debug checks finished for envCategoryUI.tsx')
}

if (process.env.NODE_ENV === 'development') {
  runUnpinnedContractDebugChecks()
}


export const EnvCategoryUI: React.FC<EnvCategoryUIProps> = ({ isOpen, onToggle }) => {
  const { plugin, widgetState, dispatch, themeQuality } = useContext(EnvAppContext)
  const { trackMatomoEvent } = useContext(TrackingContext)
  const [subCategories, setSubCategories] = useState<Provider[]>([])
  const [provider, setProvider] = useState<Provider | null>(null)
  const [enforceSelect, setEnforceSelect] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string>(null)
  const [deployedContracts, setDeployedContracts] = useState(0)

  const handleCategorySelection = async (provider: Provider) => {
    trackMatomoEvent?.({ category: 'udapp', action: 'categorySelected', name: provider.displayName, isClick: true })
    if(provider.name && selectedOption === provider.name) return
    const deployCount = widgetState.deployedContractsCount
    var confirmEnv
    if(deployCount > deployedContracts){
      const count = deployCount - deployedContracts
      confirmEnv = window.confirm(`You have ${count} unpinned contract(s) that may be lost on environment change. Continue?`)
    }
    else{
      confirmEnv = true
    }

    if(confirmEnv) {
      dispatch({ type: 'CLEAR_ALL_ACCOUNTS', payload: null })
      await setExecutionContext(provider, plugin, dispatch)
      setEnforceSelect(false)
      setSelectedOption(provider.name)
    } else {
      return
    }
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
        plugin.call('udappDeployedContracts', 'getDeployedContracts').then(val => {
              setDeployedContracts(val.filter((c) => c.isPinned).length);
              })
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
      <Dropdown.Toggle as={CustomToggle} data-id="settingsSelectEnvCategoryOptions" className="btn btn-secondary w-100 d-inline-block pe-0 border-0" icon="fas fa-caret-down text-secondary ms-2" useDefaultIcon={false} style={{ backgroundColor: 'var(--custom-onsurface-layer-3)' }}>
        <div style={{ flexGrow: 1, overflow: 'hidden', display:'flex', justifyContent:'left' }}>
          <div className="text-truncate text-secondary">
            {<span data-id="selectedVersion">{enforceSelect ? '<select>' : provider?.displayName}</span>}
          </div>
        </div>
      </Dropdown.Toggle>

      <Dropdown.Menu as={CustomMenu} className="custom-dropdown-items overflow-hidden" style={{ backgroundColor: 'var(--custom-onsurface-layer-3)', zIndex: 1000, '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black', padding: 0, minWidth: 'max-content', width: 'auto' } as React.CSSProperties}>
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