import React, { useState, useRef } from 'react' // eslint-disable-line
import { useIntl, FormattedMessage } from 'react-intl'
import { CustomTooltip, isValidHash } from '@remix-ui/helper'
import './search-bar.css'

interface SearchBarProps {
  onSearch: (txHash: string) => void
  debugging: boolean
  currentTxHash?: string
}

export const SearchBar = ({ onSearch, debugging, currentTxHash = '' }: SearchBarProps) => {
  const [txHash, setTxHash] = useState(currentTxHash)
  const [isValid, setIsValid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const intl = useIntl()

  const handleInputChange = (value: string) => {
    setTxHash(value)
    setIsValid(isValidHash(value))
  }

  const handleSearch = () => {
    if (isValid && txHash) {
      onSearch(txHash)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="debugger-search-bar">
      <div className="input-group">
        <span className="input-group-text">
          <i className="fas fa-search"></i>
        </span>
        <input
          ref={inputRef}
          type="text"
          className="form-control"
          placeholder={intl.formatMessage({ id: 'debugger.searchPlaceholder', defaultMessage: 'Search transaction hash...' })}
          value={txHash}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={debugging}
          aria-label="Transaction hash search"
        />
        <CustomTooltip
          placement="bottom"
          tooltipText={<FormattedMessage id={`debugger.${!isValid ? 'provideValidTxHash' : 'searchTransaction'}`} defaultMessage={!isValid ? 'Provide valid transaction hash' : 'Search transaction'} />}
          tooltipId="searchButtonTooltip"
          tooltipClasses="text-nowrap"
        >
          <button
            className={`btn btn-primary ${!isValid ? 'disabled' : ''}`}
            onClick={handleSearch}
            disabled={!isValid || debugging}
            aria-label="Search"
          >
            <FormattedMessage id="debugger.search" defaultMessage="Search" />
          </button>
        </CustomTooltip>
      </div>
    </div>
  )
}

export default SearchBar
