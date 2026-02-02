import React, { useState, useRef, useEffect } from 'react' // eslint-disable-line
import { useIntl, FormattedMessage } from 'react-intl'
import { CustomTooltip, isValidHash } from '@remix-ui/helper'
import './search-bar.css'

interface SearchBarProps {
  onSearch: (txHash: string) => void
  debugging: boolean
  currentTxHash?: string
  onStopDebugging?: () => void
}

export const SearchBar = ({ onSearch, debugging, currentTxHash = '', onStopDebugging }: SearchBarProps) => {
  const [txHash, setTxHash] = useState(currentTxHash)
  const [isValid, setIsValid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const intl = useIntl()

  // Sync local state with currentTxHash prop
  useEffect(() => {
    if (currentTxHash) {
      setTxHash(currentTxHash)
      setIsValid(isValidHash(currentTxHash))
    }
  }, [currentTxHash])

  const handleInputChange = (value: string) => {
    setTxHash(value)
    setIsValid(isValidHash(value))
  }

  const handleSearch = () => {
    if (isValid && txHash) {
      onSearch(txHash)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="debugger-search-bar">
      <div className="search-input-wrapper">
        <i className="fas fa-search search-icon"></i>
        <input
          ref={inputRef}
          type="text"
          className="form-control search-input"
          placeholder={intl.formatMessage({ id: 'debugger.searchPlaceholder', defaultMessage: 'Search transaction hash...' })}
          value={txHash}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={debugging}
          aria-label="Transaction hash search"
        />
        {debugging && onStopDebugging && (
          <button
            className="btn btn-sm btn-danger stop-debugging-btn"
            onClick={onStopDebugging}
            aria-label="Stop debugging"
          >
            <i className="fas fa-stop"></i> <FormattedMessage id="debugger.stopDebugging" defaultMessage="Stop Debugging" />
          </button>
        )}
      </div>
    </div>
  )
}

export default SearchBar
