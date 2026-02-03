'use strict'
import * as init from './init'
import { Ethdebugger as EthDebugger } from './Ethdebugger'
import { Debugger as TransactionDebugger } from './debugger/debugger'
import { CmdLine } from './cmdline'
import { StorageViewer } from './storage/storageViewer'
import { StorageResolver } from './storage/storageResolver'
import * as SolidityDecoder from './solidity-decoder'
import { BreakpointManager } from './code/breakpointManager'
import * as sourceMappingDecoder from './source/sourceMappingDecoder'
import * as traceHelper from './trace/traceHelper'
import { LineColumnLocation, RawLocation, Asts, TransactionReceipt, OffsetToLineColumnConverterFn } from './types'
import { ScopesData } from './solidity-decoder/internalCallTree'

const storage = {
  StorageViewer: StorageViewer,
  StorageResolver: StorageResolver
}
/*
  Use of breakPointManager :

  var breakPointManager = new BreakpointManager(this.debugger, (sourceLocation) => {
    return line/column from offset (sourceLocation)
  })
  this.debugger.setBreakpointManager(breakPointManager)
*/
export {
  init,
  traceHelper,
  sourceMappingDecoder,
  EthDebugger,
  TransactionDebugger,
  /**
   * constructor
   *
   * @param {Object} _debugger - type of EthDebugger
   * @return {Function} _locationToRowConverter - function implemented by editor which return a column/line position for a char source location
   */
  BreakpointManager,
  SolidityDecoder,
  storage,
  CmdLine,
  LineColumnLocation,
  RawLocation,
  Asts,
  TransactionReceipt,
  OffsetToLineColumnConverterFn,
  ScopesData
}
