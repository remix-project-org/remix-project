import React, { useContext, useEffect } from 'react'
import { FormattedMessage } from 'react-intl'
import { SearchContext } from '../../context/context'
import { StopSearch } from '../StopSearch'
import { ResultItem } from './ResultItem'

export const Results = () => {
  const { state } = useContext(SearchContext)
  return (
    <div data-id="search_results" className="mt-2">
      <div className="search_plugin_search_indicator py-1">
        {state.searching && !state.clipped ? <StopSearch></StopSearch> : null} {state.searching && !state.clipped ? `searching in ${state.searching}` : null}
        <br></br>
      </div>

      {state.find && !state.clipped ? (
        <div className="search_plugin_result_count_number badge rounded-full text-bg-secondary">
          <FormattedMessage id="search.text1" values={{ count: state.count, fileCount: state.fileCount }} />
        </div>
      ) : null}
      {state.find && state.clipped ? (
        <div className="alert alert-warning mt-1">
          <FormattedMessage id="search.text2" values={{ br: <br /> }} />
        </div>
      ) : null}
      {state.searchResults &&
        state.searchResults.map((result, index) => {
          return <ResultItem index={index} key={index} file={result} />
        })}
    </div>
  )
}
