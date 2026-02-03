'use strict'

import { EventManager } from '../eventManager'
import { isJumpDestInstruction } from '../trace/traceHelper'
import type { InternalCallTree } from '../solidity-decoder/internalCallTree'

/**
  * allow to manage breakpoint
  *
  * Trigger events: breakpointHit, breakpointAdded, breakpointRemoved
  */
export class BreakpointManager {
  event
  traceManager
  callTree: InternalCallTree
  solidityProxy
  breakpoints

  /**
    * constructor
    *
    * @param {Object} _debugger - type of EthDebugger
    * @return {Function} _locationToRowConverter - function implemented by editor which return a column/line position for a char source location
    */
  constructor ({ traceManager, callTree, solidityProxy }) {
    this.event = new EventManager()
    this.traceManager = traceManager
    this.callTree = callTree
    this.solidityProxy = solidityProxy
    this.breakpoints = {}
  }

  setManagers ({ traceManager, callTree, solidityProxy }) {
    this.traceManager = traceManager
    this.callTree = callTree
    this.solidityProxy = solidityProxy
  }

  /**
    * start looking for the next breakpoint
    * @param {Bool} defaultToLimit - if true jump to the end of the trace if no more breakpoint found
    *
    */
  async jumpNextBreakpoint (fromStep, defaultToLimit) {
    if (!this.callTree.locationAndOpcodePerVMTraceIndex[fromStep]) {
      return console.log('row converter not provided')
    }
    this.jump(fromStep || 0, 1, defaultToLimit, this.traceManager.trace)
  }

  /**
    * start looking for the previous breakpoint
    * @param {Bool} defaultToLimit - if true jump to the start of the trace if no more breakpoint found
    *
    */
  async jumpPreviousBreakpoint (fromStep, defaultToLimit) {
    if (!this.callTree.locationAndOpcodePerVMTraceIndex[fromStep]) {
      return console.log('row converter not provided')
    }
    this.jump(fromStep || 0, -1, defaultToLimit, this.traceManager.trace)
  }

  depthChange (step, trace) {
    return trace[step].depth !== trace[step - 1].depth
  }

  hitLine (currentStep, sourceLocation, previousSourceLocation, trace) {
    // isJumpDestInstruction -> returning from an internal function call
    // depthChange -> returning from an external call
    // sourceLocation.start <= previousSourceLocation.start && ... -> previous src is contained in the current one
    if ((isJumpDestInstruction(trace[currentStep]) && previousSourceLocation.jump === 'o') ||
      this.depthChange(currentStep, trace) ||
      (sourceLocation.start <= previousSourceLocation.start &&
        sourceLocation.start + sourceLocation.length >= previousSourceLocation.start + previousSourceLocation.length)) {
      return false
    }
    this.event.trigger('breakpointStep', [currentStep])
    this.event.trigger('breakpointHit', [sourceLocation, currentStep])
    return true
  }

  /**
    * start looking for the previous or next breakpoint
    * @param {Int} direction - 1 or -1 direction of the search
    * @param {Bool} defaultToLimit - if true jump to the limit (end if direction is 1, beginning if direction is -1) of the trace if no more breakpoint found
    *
    */
  async jump (fromStep, direction, defaultToLimit, trace) {
    this.event.trigger('locatingBreakpoint', [])
    let sourceLocation
    let lineColumn
    let contractAddress
    let previousSourceLocation
    let currentStep = fromStep + direction
    let lineHadBreakpoint = false
    let initialLine
    while (currentStep > 0 && currentStep < trace.length) {
      try {
        previousSourceLocation = sourceLocation
        const stepInfo = this.callTree.locationAndOpcodePerVMTraceIndex[currentStep]
        sourceLocation = stepInfo.sourceLocation
        lineColumn = stepInfo.lineColumnPos
        contractAddress = stepInfo.contractAddress
      } catch (e) {
        console.log('cannot jump to breakpoint ' + e)
        currentStep += direction
        continue
      }
      if (!initialLine) initialLine = lineColumn

      if (initialLine.start.line !== lineColumn.start.line) {
        if (direction === -1 && lineHadBreakpoint) { // TODO : improve this when we will build the correct structure before hand
          lineHadBreakpoint = false
          if (this.hitLine(currentStep + 1, previousSourceLocation, sourceLocation, trace)) {
            return
          }
        }
        if (await this.hasBreakpointAtLine(sourceLocation.file, lineColumn.start.line, contractAddress)) {
          lineHadBreakpoint = true
          if (this.hitLine(currentStep, sourceLocation, previousSourceLocation, trace)) {
            return
          }
        }
      }
      currentStep += direction
    }
    this.event.trigger('noBreakpointHit', [])
    if (!defaultToLimit) {
      return
    }
    if (direction === -1) {
      this.event.trigger('breakpointStep', [0])
    } else if (direction === 1) {
      this.event.trigger('breakpointStep', [trace.length - 1])
    }
  }

  /**
    * check the given pair fileIndex/line against registered breakpoints
    *
    * @param {Int} fileIndex - index of the file content (from the compilation result)
    * @param {Int} line - line number where looking for breakpoint
    * @param {String} contractAddress - address of the contract being executed
    * @return {Bool} return true if the given @arg fileIndex @arg line refers to a breakpoint
    */
  async hasBreakpointAtLine (fileIndex, line, contractAddress) {
    const compResult = await this.solidityProxy.compilationResult(contractAddress)
    const filename = Object.keys(compResult.data.contracts)[fileIndex]
    if (!(filename && this.breakpoints[filename])) {
      return false
    }
    const sources = this.breakpoints[filename]
    for (const k in sources) {
      const source = sources[k]
      if (line === source.row) {
        return true
      }
    }
  }

  /**
    * return true if current manager has breakpoint
    *
    * @return {Bool} true if breakpoint registered
    */
  hasBreakpoint () {
    for (const k in this.breakpoints) {
      if (this.breakpoints[k].length) {
        return true
      }
    }
    return false
  }

  /**
    * add a new breakpoint to the manager
    *
    * @param {Object} sourceLocation - position of the breakpoint { file: '<file index>', row: '<line number' }
    */
  add (sourceLocation) {
    sourceLocation.row -= 1
    if (!this.breakpoints[sourceLocation.fileName]) {
      this.breakpoints[sourceLocation.fileName] = []
    }
    this.breakpoints[sourceLocation.fileName].push(sourceLocation)
    this.event.trigger('breakpointAdded', [sourceLocation])
  }

  /**
    * remove a breakpoint from the manager
    *
    * @param {Object} sourceLocation - position of the breakpoint { file: '<file index>', row: '<line number' }
    */
  remove (sourceLocation) {
    sourceLocation.row -= 1
    const sources = this.breakpoints[sourceLocation.fileName]
    if (!sources) {
      return
    }
    for (const k in sources) {
      const source = sources[k]
      if (sourceLocation.row === source.row) {
        sources.splice(k, 1)
        this.event.trigger('breakpointRemoved', [sourceLocation])
        break
      }
    }
  }
}
