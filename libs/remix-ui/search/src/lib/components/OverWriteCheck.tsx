import React, { useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { SearchContext } from '../context/context'

export const OverWriteCheck = (props) => {
  const { setReplaceWithoutConfirmation, state } = useContext(SearchContext)

  const change = (e) => {
    setReplaceWithoutConfirmation(e.target.checked)
  }

  return (
    <>
      {state.replaceEnabled ? (
        <div className="search_plugin_find-part">
          <div className="mb-2 flex flex-row form-check">
            <input className="mr-2 form-check-input" id="confirm_replace" type="checkbox" onChange={change} />
            <label htmlFor="confirm_replace" data-id="confirm_replace_label" className="form-check-label">
              <FormattedMessage id="search.replaceWithoutConfirmation" />
            </label>
          </div>
        </div>
      ) : null}
    </>
  )
}
