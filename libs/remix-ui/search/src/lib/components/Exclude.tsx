import React, { useContext, useEffect, useRef, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { SearchContext } from '../context/context'

export const Exclude = (props) => {
  const { setExclude, cancelSearch, startSearch } = useContext(SearchContext)
  const [excludeInput, setExcludeInput] = useState<string>('.*/**/*')

  const intl = useIntl()

  const change = async (e) => {
    setExcludeInput(e.target.value)
    await cancelSearch()
  }

  const handleKeypress = async (e) => {
    await setExclude(excludeInput)
    if (e.charCode === 13 || e.keyCode === 13) {
      startSearch()
    }
  }

  useEffect(() => {
    setExclude(excludeInput)
  }, [])

  return (
    <>
      <div className="search_plugin_find-part pl-3">
        <label className="mt-2">
          <FormattedMessage id="search.filesToExclude" />
        </label>
        <input
          id="search_exclude"
          placeholder={intl.formatMessage({ id: 'search.placeholder3' })}
          className="form-control"
          onKeyUp={handleKeypress}
          onChange={async (e) => change(e)}
          value={excludeInput}
        ></input>
      </div>
    </>
  )
}
