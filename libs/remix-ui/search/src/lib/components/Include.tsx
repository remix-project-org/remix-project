import React, { useContext, useEffect, useRef, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { SearchContext } from '../context/context'

export const Include = (props) => {
  const { setInclude, cancelSearch, startSearch } = useContext(SearchContext)
  const [includeInput, setIncludeInput] = useState<string>('*.sol, *.js')

  const intl = useIntl()

  const change = async (e) => {
    setIncludeInput(e.target.value)
    await cancelSearch()
  }
  const handleKeypress = async (e) => {
    await setInclude(includeInput)
    if (e.charCode === 13 || e.keyCode === 13) {
      startSearch()
    }
  }

  useEffect(() => {
    setInclude(includeInput)
  }, [])

  return (
    <>
      <div className="search_plugin_find-part pl-3">
        <label className="mt-2">
          <FormattedMessage id="search.filesToInclude" />
        </label>
        <input
          id="search_include"
          placeholder={intl.formatMessage({ id: 'search.placeholder2' })}
          className="form-control"
          onChange={async (e) => change(e)}
          onKeyUp={handleKeypress}
          value={includeInput}
        ></input>
      </div>
    </>
  )
}
