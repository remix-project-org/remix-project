/* eslint-disable @typescript-eslint/no-explicit-any */
import { CompilationResult, SourceWithTarget } from '@remixproject/plugin-api'
import React from 'react' //eslint-disable-line
import { AnalysisTab, RemixUiStaticAnalyserReducerActionType, RemixUiStaticAnalyserState, SolHintReport, SlitherAnalysisResults } from '../../staticanalyser'
import { RemixUiStaticAnalyserProps } from '@remix-ui/static-analyser'

/**
 *
 * @param analysisModule { AnalysisTab } AnalysisTab ViewPlugin
 * @param dispatch { React.Dispatch<any> } analysisReducer function's dispatch method
 */
export const compilation = (analysisModule: AnalysisTab,
  dispatch: React.Dispatch<RemixUiStaticAnalyserReducerActionType>) => {
  if (analysisModule) {
    analysisModule.on(
      'solidity',
      'compilationFinished',
      (file: string, source: SourceWithTarget, languageVersion: string, data: CompilationResult, input: string, version: string) => {
        if (languageVersion.indexOf('soljson') !== 0) return
        dispatch({ type: 'compilationFinished', payload: { file, source, languageVersion, data, input, version } })
      }
    )
  }
}

/**
 * Run the analysis on the currently compiled contract
 * @param lastCompilationResult
 * @param lastCompilationSource
 * @param currentFile {string} current file path
 * @param state { RemixUiStaticAnalyserState}
 * @param props {RemixUiStaticAnalyserProps}
 * @param isSupportedVersion {boolean}
 * @param slitherEnabled {boolean}
 * @param categoryIndex {number[]}
 * @param groupedModules {any}
 * @param runner {any}
 * @param track {function} tracking function from AppContext
 * @param message {any}
 * @param showWarnings {boolean}
 * @param allWarnings {React.RefObject<object>}
 * @param warningContainer {React.RefObject<object>}
 * @returns {Promise<void>}
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function run (lastCompilationResult, lastCompilationSource, currentFile: string, state: RemixUiStaticAnalyserState, props: RemixUiStaticAnalyserProps, isSupportedVersion, showSlither, categoryIndex: number[], groupedModules, runner, trackMatomoEvent, message, showWarnings, allWarnings: React.RefObject<any>, warningContainer: React.RefObject<any>, calculateWarningStateEntries: (e:[string, any][]) => {length: number, errors: any[] }, warningState, setHints: React.Dispatch<React.SetStateAction<SolHintReport[]>>, hints: SolHintReport[], setSlitherWarnings: React.Dispatch<React.SetStateAction<any[]>>, setSsaWarnings: React.Dispatch<React.SetStateAction<any[]>>,
  slitherEnabled: boolean, setStartAnalysis: React.Dispatch<React.SetStateAction<boolean>>, solhintEnabled: boolean, basicEnabled: boolean) {
  setStartAnalysis(true)
  setHints([])
  setSsaWarnings([])
  setSlitherWarnings([])
  if (!isSupportedVersion) return
  if (state.data !== null) {
    if (lastCompilationResult && (solhintEnabled || basicEnabled || showSlither)) {
      const warningMessage = []
      const warningErrors = []
      props.analysisModule.hints = []
      // Run solhint
      if (solhintEnabled) {
        trackMatomoEvent?.({ category: 'solidityStaticAnalyzer', action: 'analyze', name: 'solHint', isClick: true })
        const hintsResult = await props.analysisModule.call('solhint', 'lint', state.file)
        props.analysisModule.hints = hintsResult
        setHints(hintsResult)
      } else {
        props.analysisModule.hints = []
        setHints([])
      }
      // Remix Analysis
      if (basicEnabled) {
        trackMatomoEvent?.({ category: 'solidityStaticAnalyzer', action: 'analyze', name: 'remixAnalyzer', isClick: true })
        const results = runner.run(lastCompilationResult, categoryIndex)
        for (const result of results) {
          let moduleName
          Object.keys(groupedModules).map(key => {
            groupedModules[key].forEach(el => {
              if (el.name === result.name) {
                moduleName = groupedModules[key][0].categoryDisplayName
              }
            })
          })
          // iterate over the warnings and create an object
          for (const item of result.report) {
            let location: any = {}
            let locationString = 'not available'
            let column = 0
            let row = 0
            let fileName = currentFile
            let isLibrary = false

            if (item.location) {
              const split = item.location.split(':')
              const file = split[2]
              location = {
                start: parseInt(split[0]),
                length: parseInt(split[1])
              }
              location = props.analysisModule._deps.offsetToLineColumnConverter.offsetToLineColumn(
                location,
                parseInt(file),
                lastCompilationSource.sources,
                lastCompilationResult.sources
              )
              row = location.start.line
              column = location.start.column
              locationString = row + 1 + ':' + column + ':'
              fileName = Object.keys(lastCompilationResult.sources)[file]
            }
            if (fileName !== currentFile) {
              const { file, provider } = await props.analysisModule.call('fileManager', 'getPathFromUrl', fileName)
              if (file.startsWith('.deps') || (provider.type === 'localhost' && file.startsWith('localhost/node_modules'))) isLibrary = true
            }
            const msg = message(result.name, item.warning, item.more, state.file, locationString)
            const options = {
              type: 'warning',
              useSpan: true,
              errFile: state.file,
              fileName,
              isLibrary,
              errLine: row,
              errCol: column,
              item: item,
              name: result.name,
              locationString,
              more: item.more,
              location: location
            }
            warningErrors.push(options)
            warningMessage.push({ msg, options, hasWarning: true, warningModuleName: moduleName })
            setSsaWarnings(warningMessage)
          }
        }
      } else {
        setSsaWarnings([])
      }
      // Slither Analysis
      if (showSlither && slitherEnabled) {
        setSlitherWarnings([])
        try {
          const compilerState = await props.analysisModule.call('solidity', 'getCompilerState')
          const { currentVersion, optimize, evmVersion } = compilerState
          await props.analysisModule.call('terminal', 'log', { type: 'log', value: '[Slither Analysis]: Running...' })
          trackMatomoEvent?.({ category: 'solidityStaticAnalyzer', action: 'analyze', name: 'slitherAnalyzer', isClick: true })
          const result: SlitherAnalysisResults = await props.analysisModule.call('slither', 'analyse', state.file, { currentVersion, optimize, evmVersion })
          if (result.status) {
            props.analysisModule.call('terminal', 'log', { type: 'log', value: `[Slither Analysis]: Analysis Completed!! ${result.count} warnings found.` })
            const report = result.data
            for (const item of report) {
              let location: any = {}
              let locationString = 'not available'
              let column = 0
              let row = 0
              let fileName = currentFile
              let isLibrary = false

              if (item.sourceMap && item.sourceMap.length) {
                const path = item.sourceMap[0].source_mapping.filename_relative
                let fileIndex = Object.keys(lastCompilationResult.sources).indexOf(path)
                if (fileIndex === -1) {
                  const getpath = await props.analysisModule.call('fileManager', 'getUrlFromPath', path)
                  fileIndex = Object.keys(lastCompilationResult.sources).indexOf(getpath.file)
                }
                if (fileIndex >= 0) {
                  location = {
                    start: item.sourceMap[0].source_mapping.start,
                    length: item.sourceMap[0].source_mapping.length
                  }
                  location = props.analysisModule._deps.offsetToLineColumnConverter.offsetToLineColumn(
                    location,
                    fileIndex,
                    lastCompilationSource.sources,
                    lastCompilationResult.sources
                  )
                  row = location.start.line
                  column = location.start.column
                  locationString = row + 1 + ':' + column + ':'
                  fileName = Object.keys(lastCompilationResult.sources)[fileIndex]
                }
              }
              if (fileName !== currentFile) {
                const { file, provider } = await props.analysisModule.call('fileManager', 'getPathFromUrl', fileName)
                if (file.startsWith('.deps') || (file.includes('.deps')) || (provider.type === 'localhost' && file.startsWith('localhost/node_modules'))) isLibrary = true
              }
              const msg = message(item.title, item.description, item.more ?? '', fileName, locationString)
              const options = {
                type: item.sourceMap && item.sourceMap.length > 0 ? item.sourceMap[0].type : '',
                useSpan: true,
                errFile: fileName,
                fileName,
                isLibrary,
                errLine: row,
                errCol: column,
                item: { warning: item.description },
                name: item.title,
                locationString,
                more: item.more ?? '',
                location: location
              }

              setSlitherWarnings((prev) => {
                prev.push({ msg, options, hasWarning: true, warningModuleName: 'Slither Analysis' })
                return prev
              })
            }
            showWarnings(warningMessage, 'warningModuleName')
          }
        } catch (error) {
          props.analysisModule.call('terminal', 'log', { type: 'error', value: '[Slither Analysis]: Error occurred! See remixd console for details.' })
          showWarnings(warningMessage, 'warningModuleName')
        }
      } else setStartAnalysis(false)
    } else {
      if (categoryIndex.length) {
        warningContainer.current.innerText = 'No compiled AST available'
      }

      props.event.trigger('staticAnaysisWarning', [-1])
    }
  }
}

