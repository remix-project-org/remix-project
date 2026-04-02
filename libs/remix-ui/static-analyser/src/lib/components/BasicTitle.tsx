import React, { useEffect, useState } from 'react'
import { ErrorRendererOptions } from '../../staticanalyser'

type BasicTitleProps = {
  warningStateEntries: any
  ssaWarnings: any[]
  hideWarnings?: boolean
  showLibsWarnings?: boolean
}

type warningResultOption = {
  hasWarning: boolean
  msg: string
  options: ErrorRendererOptions
}

type WarningResultType = {
  categoryName: string
  opts: warningResultOption[]
}

export function calculateWarningStateEntries(entries: [string, any][]) {
  let warninglength = 0
  entries.forEach((entry) => {
    warninglength += entry[1].length
  })
  let errors = []
  entries.forEach((entry) => {
    errors = entry[1].filter((x) => x.options.type === 'error')
  })
  return { length: warninglength, errors }
}

export function BasicTitle(props: BasicTitleProps) {
  const [filteredTotal, setFilteredTotal] = useState(0)

  useEffect(() => {
    setFilteredTotal(props.ssaWarnings.filter((x) => !x.options.isLibrary && x.hasWarning).length)
  }, [props, props.ssaWarnings.filter((x) => !x.options.isLibrary && x.hasWarning).length])

  return (
    <span id="ssaRemixtab">
      Remix
      {props.ssaWarnings.length > 0 ? (
        !props.hideWarnings ? (
          !props.showLibsWarnings ? (
            <span
              data-id="RemixStaticAnalysisErrorCount"
              className={`badge ${
                props.ssaWarnings.filter((x) => x.hasWarning).length > 0
                  ? 'bg-warning'
                  : props.ssaWarnings.filter((x) => x.options.type === 'errors').length > 0
                    ? 'bg-danger'
                    : 'bg-info'
              } rounded-full mx-1 ml-1 text-center`}
            >
              {filteredTotal}
            </span>
          ) : (
            <span
              data-id="RemixStaticAnalysisErrorCount"
              className={`badge ${
                props.ssaWarnings.filter((x) => x.options.type !== 'warning' && x.options.type !== 'error').length > 0
                  ? 'bg-info'
                  : props.ssaWarnings.filter((x) => x.options.type === 'errors').length > 0
                    ? 'bg-danger'
                    : 'bg-warning'
              } rounded-full mx-1 ml-1 text-center`}
            >
              {props.ssaWarnings.length}
            </span>
          )
        ) : null
      ) : null}
    </span>
  )
}
