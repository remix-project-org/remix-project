import React, { useMemo } from 'react'
import type { Chain } from '../types'
import { AppContext } from '../AppContext'
import { FormattedMessage, useIntl } from 'react-intl'
import { Select, SelectOption } from '@remix-ui/helper'

function getChainDescriptor(chain: Chain): string {
  if (!chain) return ''
  return `${chain.title || chain.name} (${chain.chainId})`
}

interface DropdownProps {
  label: string | any
  id: string
  setSelectedChain: (chain: Chain) => void
  selectedChain: Chain
}

export const SearchableChainDropdown: React.FC<DropdownProps> = ({ label, id, setSelectedChain, selectedChain }) => {
  const { chains } = React.useContext(AppContext)
  const ethereumChainIds = [1, 11155111, 17000]
  const intl = useIntl()

  // Add Ethereum chains to the head of the chains list. Sort the rest alphabetically
  const dropdownChains = useMemo(
    () =>
      chains.sort((a, b) => {
        const isAInEthereum = ethereumChainIds.includes(a.chainId)
        const isBInEthereum = ethereumChainIds.includes(b.chainId)

        if (isAInEthereum && !isBInEthereum) return -1
        if (!isAInEthereum && isBInEthereum) return 1
        if (isAInEthereum && isBInEthereum) return ethereumChainIds.indexOf(a.chainId) - ethereumChainIds.indexOf(b.chainId)

        return (a.title || a.name).localeCompare(b.title || b.name)
      }),
    [chains]
  )

  if (!dropdownChains || dropdownChains.length === 0) {
    return (
      <div className="dropdown">
        <label htmlFor={id}>{label}</label>
        <div><FormattedMessage id="contract-verification.loadingChains" /></div>
      </div>
    )
  }

  const options: SelectOption[] = dropdownChains.map((chain) => ({
    value: String(chain.chainId),
    label: getChainDescriptor(chain),
    searchText: `${chain.title || ''} ${chain.name} ${chain.chainId}`
  }))

  return (
    <div className="mb-3">
      <label htmlFor={id}>{label}</label>
      <Select
        id={id}
        dataId="chainDropdownbox"
        itemDataId={(o) => o.value}
        value={selectedChain ? String(selectedChain.chainId) : ''}
        options={options}
        onChange={(value) => setSelectedChain(dropdownChains.find((chain) => String(chain.chainId) === value))}
        placeholder={intl.formatMessage({ id: 'contract-verification.searchableChainDropdown', defaultMessage: 'Select a chain' })}
        searchable
      />
    </div>
  )
}
