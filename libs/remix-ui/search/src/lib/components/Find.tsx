import { CustomTooltip } from '@remix-ui/helper'
import React, { useContext, useEffect, useState } from 'react'
import { useIntl } from 'react-intl'
import { SearchContext } from '../context/context'

export const Find = () => {
  const { setFind, cancelSearch, startSearch, state, toggleCaseSensitive, toggleMatchWholeWord, toggleUseRegex } = useContext(SearchContext)

  const intl = useIntl()

  const [inputValue, setInputValue] = useState('')
  const change = async (e) => {
    setInputValue(e.target.value)
    await cancelSearch()
  }

  const handleKeypress = async (e) => {
    if (e.charCode === 13 || e.keyCode === 13) {
      startSearch()
    }
    await setFind(inputValue)
  }

  useEffect(() => {
    setInputValue('')
  }, [state.workspace])

  return (
    <>
      <div className="search_plugin_find-part">
        <div className="search_plugin_search-input">
          <input
            id="search_input"
            placeholder={intl.formatMessage({
              id: 'search.placeholder1'
            })}
            className="form-control"
            value={inputValue}
            onChange={async (e) => await change(e)}
            onKeyUp={handleKeypress}
          ></input>
          <div className="search_plugin_controls">
            <CustomTooltip
              tooltipText={intl.formatMessage({
                id: 'search.matchCase'
              })}
              tooltipClasses="whitespace-nowrap"
              tooltipId="searchCaseSensitiveTooltip"
              placement="top-start"
            >
              <div
                data-id="search_case_sensitive"
                className={`monaco-custom-checkbox codicon codicon-case-sensitive mx-2 ${state.casesensitive ? 'checked' : ''}`}
                role="checkbox"
                aria-checked="false"
                aria-label="Match Case"
                aria-disabled="false"
                onClick={() => {
                  toggleCaseSensitive()
                }}
              ></div>
            </CustomTooltip>
            <CustomTooltip
              tooltipText={intl.formatMessage({
                id: 'search.matchWholeWord'
              })}
              tooltipClasses="whitespace-nowrap"
              tooltipId="searchWholeWordTooltip"
              placement="top-start"
            >
              <div
                data-id="search_whole_word"
                className={`monaco-custom-checkbox codicon codicon-whole-word mr-2 ${state.matchWord ? 'checked' : ''}`}
                role="checkbox"
                aria-checked="false"
                aria-label="Match Whole Word"
                aria-disabled="false"
                onClick={() => {
                  toggleMatchWholeWord()
                }}
              ></div>
            </CustomTooltip>
            <CustomTooltip
              tooltipText={intl.formatMessage({
                id: 'search.useRegularExpression'
              })}
              tooltipClasses="whitespace-nowrap"
              tooltipId="useRegularExpressionTooltip"
              placement="bottom-start"
            >
              <div
                data-id="search_use_regex"
                className={`monaco-custom-checkbox codicon codicon-regex ${state.useRegExp ? 'checked' : ''}`}
                role="checkbox"
                aria-checked="false"
                aria-label="Use Regular Expression"
                aria-disabled="false"
                onClick={() => {
                  toggleUseRegex()
                }}
              ></div>
            </CustomTooltip>
          </div>
        </div>
      </div>
    </>
  )
}
