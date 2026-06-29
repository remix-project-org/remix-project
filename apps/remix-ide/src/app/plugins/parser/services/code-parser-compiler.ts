'use strict'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import { DependencyResolvingCompiler } from '../../../lib/dependency-resolving-compiler'

import { CompilationResult, CompilationSource } from '@remix-project/remix-solidity'
import { CodeParser } from "../code-parser";
import { fileDecoration, fileDecorationType } from '@remix-ui/file-decorators'
import { sourceMappingDecoder } from '@remix-project/remix-debug'
import { CompilerRetriggerMode, CompilationSourceCode } from '@remix-project/remix-solidity';
import { findLinesInStringWithMatch, SearchResultLine } from '@remix-ui/search'
import { lastCompilationResult } from '@remixproject/plugin-api';
import { monacoTypes } from '@remix-ui/editor';

enum MarkerSeverity {
  Hint = 1,
  Info = 2,
  Warning = 4,
  Error = 8
}

type errorMarker = {
  message: string
  severity: monacoTypes.MarkerSeverity
  position: {
    start: {
      line: number
      column: number
    },
    end: {
      line: number
      column: number
    }
  },
  file: string
}
export default class CodeParserCompiler {
  plugin: CodeParser
  compiler: DependencyResolvingCompiler // used to compile the current file separately from the main compiler
  onAstFinished: (success: any, data: CompilationResult, source: CompilationSourceCode, input: any, version: any) => Promise<void>;
  errorState: boolean;
  gastEstimateTimeOut: any
  constructor(
    plugin: CodeParser
  ) {
    this.plugin = plugin
  }

  init() {

    this.onAstFinished = async (success, data: CompilationResult, source: CompilationSourceCode, input: any, version) => {
      await this.plugin.call('editor', 'clearAnnotations')
      this.errorState = true
      const result = new CompilerAbstract('soljson', data, source, input)
      let allErrors: errorMarker[] = []
      if (data.errors || data.error) {
        const file = await this.plugin.call('fileManager', 'getCurrentFile')
        const currentFileContent = await this.plugin.call('fileManager', 'readFile', file)
        const sources = result.getSourceCode().sources || []
        if (data.error) {
          if (data.error.formattedMessage) {
            // mark this file as error
            const errorMarker = await this.createErrorMarker(data.error, file, { start: { line: 0, column: 0 }, end: { line: 0, column: 100 } })
            allErrors = [...allErrors, errorMarker]
          }
        } else {
          for (const error of data.errors) {
            if (!error.sourceLocation) {
              // mark this file as error
              const errorMarker = await this.createErrorMarker(error, file, { start: { line: 0, column: 0 }, end: { line: 0, column: 100 } })
              allErrors = [...allErrors, errorMarker]
            } else {
              const lineBreaks = sourceMappingDecoder.getLinebreakPositions(sources[error.sourceLocation.file].content)
              const lineColumn = sourceMappingDecoder.convertOffsetToLineColumn({
                start: error.sourceLocation.start,
                length: error.sourceLocation.end - error.sourceLocation.start
              }, lineBreaks)

              const filePath = error.sourceLocation.file
              const fileTarget = await this.plugin.call('fileManager', 'getUrlFromPath', filePath)

              const importFilePositions = await this.getPositionForImportErrors(fileTarget.file, currentFileContent)
              for (const importFilePosition of importFilePositions) {
                for (const line of importFilePosition.lines) {
                  allErrors = [...allErrors, await this.createErrorMarker(error, file, line.position)]
                }
              }

              allErrors = [...allErrors, await this.createErrorMarker(error, filePath, lineColumn)]
            }
          }
        }

        const displayErrors = await this.plugin.call('config', 'getAppParameter', 'display-errors')
        if (displayErrors) await this.plugin.call('editor', 'addErrorMarker', allErrors)
        await this.addDecorators(allErrors, sources)
      } else {
        await this.plugin.call('editor', 'clearErrorMarkers', result.getSourceCode().sources)
        await this.clearDecorators(result.getSourceCode().sources)
      }

      if (!data.sources) return
      if (data.sources && Object.keys(data.sources).length === 0) return
      this.plugin.compilerAbstract = new CompilerAbstract('soljson', data, source, input)
      this.errorState = false

      this.plugin.nodeIndex = {
        declarations: {},
        flatReferences: {},
        nodesPerFile: {},
      }

      this.plugin._buildIndex(data, source)
      // cast from the remix-plugin interface to the solidity one. Should be fixed when remix-plugin move to the remix-project repository
      const extractedFiledNodes = this.plugin._extractFileNodes(this.plugin.currentFile, this.plugin.compilerAbstract as unknown as lastCompilationResult)
      if (extractedFiledNodes) {
        this.plugin.nodeIndex.nodesPerFile[this.plugin.currentFile] = extractedFiledNodes
      }
      await this.plugin.gasService.showGasEstimates()
      this.plugin.emit('astFinished')
    }

    this.compiler = new DependencyResolvingCompiler(
      this.plugin,
      (url, cb) => {
        cb(`${url} not found.`)
      },
      null, // importResolverFactory - not used by DependencyResolvingCompiler
      false // debug - set to false for code-parser to reduce noise
    )
    this.compiler.event.register('compilationFinished', this.onAstFinished)
  }

  // COMPILER

  /**
     *
     * @returns
     */
  async compile() {
    try {
      this.plugin.currentFile = await this.plugin.call('fileManager', 'file')
      if (this.plugin.currentFile && this.plugin.currentFile.endsWith('.sol')) {
        const state = await this.plugin.call('solidity', 'getCompilerState')
        this.compiler.set('optimize', state.optimize)
        this.compiler.set('evmVersion', state.evmVersion)
        this.compiler.set('language', state.language)
        this.compiler.set('runs', state.runs)
        this.compiler.set('useFileConfiguration', state.useFileConfiguration)
        this.compiler.set('compilerRetriggerMode', CompilerRetriggerMode.retrigger)

        const configFileContent =
          state.useFileConfiguration ?
            state.configFileContent :

            {
              "language": "Solidity",
              "settings": {
                "optimizer": {
                  "enabled": state.optimize,
                  "runs": state.runs
                },
                "outputSelection": {
                  "*": {
                    "": ["ast"],
                    "*": ["evm.gasEstimates"]
                  }
                },
                "evmVersion": state.evmVersion && state.evmVersion.toString() || undefined,
              }
            }

        this.compiler.set('configFileContent', state.useFileConfiguration ? configFileContent : JSON.stringify(configFileContent))

        if (await this.plugin.call('fileManager', 'exists', 'remappings.txt')) {
          const remappings = await this.plugin.call('fileManager', 'readFile', 'remappings.txt')
          this.compiler.set('remappings', remappings.split('\n').filter(Boolean))
        } else {
          this.compiler.set('remappings', [])
        }
        const content = await this.plugin.call('fileManager', 'readFile', this.plugin.currentFile)
        const sources = { [this.plugin.currentFile]: { content } }
        this.compiler.compile(sources, this.plugin.currentFile)
      }
    } catch (e) {
      // do nothing
    }
  }

  async addDecorators(allErrors: errorMarker[], sources: any) {
    const displayErrors = await this.plugin.call('config', 'getAppParameter', 'display-errors')
    if (!displayErrors) return
    const errorsPerFiles: { [fileName: string]: errorMarker[] } = {}
    for (const error of allErrors) {
      if (!errorsPerFiles[error.file]) {
        errorsPerFiles[error.file] = []
      }
      errorsPerFiles[error.file].push(error)
    }

    const errorPriority = {
      'error': 0,
      'warning': 1,
    }

    // sort errorPerFiles by error priority
    const sortedErrorsPerFiles: { [fileName: string]: errorMarker[] } = {}
    for (const fileName in errorsPerFiles) {
      const errors = errorsPerFiles[fileName]
      errors.sort((a, b) => {
        return errorPriority[a.severity] - errorPriority[b.severity]
      }
      )
      sortedErrorsPerFiles[fileName] = errors
    }
    const filesWithOutErrors = Object.keys(sources).filter((fileName) => !sortedErrorsPerFiles[fileName])
    // add decorators
    const decorators: fileDecoration[] = []
    for (const fileName in sortedErrorsPerFiles) {
      const errors = sortedErrorsPerFiles[fileName]
      const fileTarget = await this.plugin.call('fileManager', 'getPathFromUrl', fileName)
      const decorator: fileDecoration = {
        path: fileTarget.file,
        isDirectory: false,
        fileStateType: errors[0].severity == MarkerSeverity.Error ? fileDecorationType.Error : fileDecorationType.Warning,
        fileStateLabelClass: errors[0].severity == MarkerSeverity.Error ? 'text-danger' : 'text-warning',
        fileStateIconClass: '',
        fileStateIcon: '',
        text: errors.length.toString(),
        owner: 'code-parser',
        bubble: true,
        comment: errors.map((error) => error.message),
      }
      decorators.push(decorator)
    }
    for (const fileName of filesWithOutErrors) {
      const fileTarget = await this.plugin.call('fileManager', 'getPathFromUrl', fileName)
      await this.plugin.call('fileDecorator', 'clearFileDecorators', fileTarget.file)
    }
    if (decorators.length > 0)
      await this.plugin.call('fileDecorator', 'setFileDecorators', decorators)
    await this.plugin.call('editor', 'clearErrorMarkers', filesWithOutErrors)

  }

  async createErrorMarker(error: any, filePath: string, lineColumn): Promise<errorMarker> {
    return {
      message: error.formattedMessage,
      severity: error.severity === 'error' ? MarkerSeverity.Error : MarkerSeverity.Warning,
      position: {
        start: {
          line: ((lineColumn.start && lineColumn.start.line) || 0) + 1,
          column: ((lineColumn.start && lineColumn.start.column) || 0) + 1
        },
        end: {
          line: ((lineColumn.end && lineColumn.end.line) || 0) + 1,
          column: ((lineColumn.end && lineColumn.end.column) || 0) + 1
        }
      }
      , file: filePath
    }
  }

  async clearDecorators(sources: any) {
    const decorators: fileDecoration[] = []
    if (!sources) return
    for (const fileName of Object.keys(sources)) {
      await this.plugin.call('fileDecorator', 'clearFileDecorators', fileName)
    }
  }

  async getPositionForImportErrors(importedFileName: string, text: string) {
    const re = new RegExp(importedFileName, 'gi')
    const result: SearchResultLine[] = findLinesInStringWithMatch(
      text,
      re
    )
    return result
  }

}
