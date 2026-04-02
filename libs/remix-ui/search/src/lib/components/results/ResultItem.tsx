import { useDialogDispatchers } from '@remix-ui/app'
import React, { useContext, useEffect, useRef, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { SearchContext } from '../../context/context'
import { SearchResult, SearchResultLine } from '../../types'
import { ResultFileName } from './ResultFileName'
import { ResultSummary } from './ResultSummary'

interface ResultItemProps {
  file: SearchResult
  index: number
}

export const ResultItem = (props: ResultItemProps) => {
  const intl = useIntl()
  const { state, findText, disableForceReload, updateCount, replaceAllInFile } = useContext(SearchContext)
  const [loading, setLoading] = useState<boolean>(false)
  const [lines, setLines] = useState<SearchResultLine[]>([])
  const [toggleExpander, setToggleExpander] = useState<boolean>(false)
  const reloadTimeOut = useRef(null)
  const loadTimeout = useRef(null)
  const subscribed = useRef(true)
  const { modal } = useDialogDispatchers()

  useEffect(() => {
    reload()
  }, [props.file.timeStamp])

  useEffect(() => {
    if (props.file.forceReload) {
      clearTimeout(reloadTimeOut.current)
      clearTimeout(loadTimeout.current)
      subscribed.current = true
      reloadTimeOut.current = setTimeout(() => reload(0), 1000)
    }
  }, [props.file.forceReload])

  const toggleClass = () => {
    setToggleExpander(!toggleExpander)
  }

  useEffect(() => {
    subscribed.current = true
    return () => {
      clearTimeout(reloadTimeOut.current)
      clearTimeout(loadTimeout.current)
      subscribed.current = false
    }
  }, [])

  useEffect((): any => {
    if (!state.run) {
      clearTimeout(reloadTimeOut.current)
      clearTimeout(loadTimeout.current)
      subscribed.current = false
    } else {
      subscribed.current = true
    }
  }, [state.run])

  const confirmReplace = async () => {
    setLoading(true)
    try {
      await replaceAllInFile(props.file)
    } catch (e) {}
    setLoading(false)
  }

  const replace = async () => {
    if (state.replaceWithOutConfirmation) {
      confirmReplace()
    } else {
      modal({
        id: 'confirmreplace',
        title: intl.formatMessage({ id: 'search.replace' }),
        message: intl.formatMessage(
          { id: 'search.confirmreplaceMsg' },
          {
            find: state.find,
            replace: state.replace,
            filename: props.file.filename
          }
        ),
        okLabel: intl.formatMessage({ id: 'search.yes' }),
        okFn: confirmReplace,
        cancelLabel: intl.formatMessage({ id: 'search.no' }),
        cancelFn: () => {},
        data: null
      })
    }
  }

  const doLoad = () => {
    if (!subscribed.current) return
    findText(props.file.filename)
      .then((res) => {
        if (subscribed.current) {
          setLines(res)
          if (res) {
            let count = 0
            res.forEach((line) => {
              count += line.lines.length
            })
            updateCount(count, props.file.filename)
          }
          setLoading(false)
          disableForceReload(props.file.filename)
        }
      })
      .catch((e) => {
        console.error(e)
      })
  }

  const reload = (time?: number) => {
    loadTimeout.current = setTimeout(doLoad, 150 * (time | props.index))
  }

  return (
    <>
      {lines && lines.length ? (
        <>
          <div onClick={toggleClass} className="search_plugin_search_result_item_title">
            <button className="btn">
              <i className={`fas ${toggleExpander ? 'fa-angle-right' : 'fa-angle-down'}`} aria-hidden="true"></i>
            </button>{' '}
            <ResultFileName file={props.file} />
            <div className="search_plugin_result_count">
              <div className="search_plugin_result_count_number badge rounded-full text-bg-secondary">{props.file.count}</div>
            </div>
          </div>
          {loading ? (
            <div className="loading">
              <FormattedMessage id="search.loading" />
              ...
            </div>
          ) : null}
          {!toggleExpander && !loading ? (
            <div className="search_plugin_wrap_summary">
              {state.replaceEnabled ? (
                <div className="search_plugin_wrap_summary_replace">
                  <div data-id={`replace-all-${props.file.filename}`} onClick={async () => replace()} className="inline-flex items-center px-4 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90 transition-colors mb-2 btn-sm">
                    <FormattedMessage id="search.replaceAll" />
                  </div>
                </div>
              ) : null}
              {lines.map((line, index) => (
                <ResultSummary setLoading={setLoading} key={index} searchResult={props.file} line={line} />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <></>
      )}
    </>
  )
}
