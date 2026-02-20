import { util } from '@remix-project/remix-lib'
import { EventManager } from '../eventManager'
import type { Ethdebugger } from '../Ethdebugger'
import type { TraceManager } from '../trace/traceManager'

/**
 * Manages stepping through transaction execution traces in the debugger.
 * Handles navigation, breakpoints, and maintains the current execution state.
 */
export class DebuggerStepManager {
  event: EventManager
  debugger: Ethdebugger
  traceManager: TraceManager
  currentStepIndex: number
  traceLength: number
  codeTraceLength: number
  revertionPoint
  currentCall

  /**
   * Creates a new DebuggerStepManager instance.
   * Initializes step tracking and sets up event listeners for trace management.
   *
   * @param {Object} _debugger - The debugger instance
   * @param {Object} traceManager - The trace manager instance for accessing execution trace
   */
  constructor (_debugger, traceManager) {
    this.event = new EventManager()
    this.debugger = _debugger
    this.traceManager = traceManager
    this.currentStepIndex = -1
    this.traceLength = 0
    this.codeTraceLength = 0
    this.revertionPoint = null

    this.listenToEvents()
  }

  /**
   * Registers event listeners for debugger and call tree events.
   * Handles trace loading, call tree building, and step index changes.
   * Detects revert conditions and triggers appropriate warnings.
   */
  listenToEvents () {
    this.debugger.event.register('newTraceLoaded', this, () => {
      this.traceManager.getLength((error, newLength) => {
        if (error) {
          return console.log(error)
        }
        if (this.traceLength !== newLength) {
          this.event.trigger('traceLengthChanged', [newLength])
          this.traceLength = newLength
          this.codeTraceLength = this.calculateCodeLength()
        }
      })
    })

    this.debugger.callTree.event.register('callTreeBuildFailed', () => {
      setTimeout(() => {
        this.jumpTo(0)
      }, 500)
    })

    this.debugger.callTree.event.register('callTreeNotReady', () => {
      setTimeout(() => {
        this.jumpTo(0)
      }, 500)
    })

    this.debugger.callTree.event.register('noCallTreeAvailable', () => {
      setTimeout(() => {
        this.jumpTo(0)
      }, 500)
    })

    this.debugger.callTree.event.register('callTreeReady', () => {
      if (this.debugger.callTree.functionCallStack.length) {
        setTimeout(() => {
          this.jumpTo(this.debugger.callTree.functionCallStack[0])
        }, 500)
      } else {
        setTimeout(() => {
          this.jumpTo(0)
        }, 500)
      }
    })

    this.event.register('indexChanged', this, (index) => {
      if (index < 0) return
      if (this.currentStepIndex !== index) return

      this.traceManager.buildCallPath(index).then((callsPath) => {
        this.currentCall = callsPath[callsPath.length - 1]
        if (this.currentCall.reverted) {
          const revertedReason = this.currentCall.outofgas ? 'outofgas' : 'reverted'
          this.revertionPoint = this.currentCall.return
          this.event.trigger('revertWarning', [revertedReason])
          return
        }
        for (let k = callsPath.length - 2; k >= 0; k--) {
          const parent = callsPath[k]
          if (parent.reverted) {
            this.revertionPoint = parent.return
            this.event.trigger('revertWarning', ['parenthasthrown'])
            return
          }
        }
        this.event.trigger('revertWarning', [''])
      }).catch((error) => {
        console.log(error)
        this.event.trigger('revertWarning', [''])
      })
    })
  }

  /**
   * Triggers the stepChanged event with the current step state.
   * Determines if the step is at the initial position, end position, or within valid range.
   *
   * @param {number} step - The step index to trigger the event for
   */
  triggerStepChanged (step) {
    this.traceManager.getLength((error, length) => {
      let stepState = 'valid'

      if (error) {
        stepState = 'invalid'
      } else if (step <= 0) {
        stepState = 'initial'
      } else if (step >= length - 1) {
        stepState = 'end'
      }

      const jumpOutDisabled = (step === this.traceManager.findStepOut(step))
      this.event.trigger('stepChanged', [step, stepState, jumpOutDisabled])
    })
  }

  /**
   * Steps backward into the previous instruction in the trace.
   * In Solidity mode, resolves to the previous source code location.
   *
   * @param {boolean} solidityMode - If true, steps to previous Solidity source location; if false, steps to previous EVM instruction
   */
  stepIntoBack (solidityMode) {
    if (!this.traceManager.isLoaded()) return

    let step
    if (solidityMode) {
      step = this.resolveToReducedTrace(this.currentStepIndex, -1)
    } else
      step = this.currentStepIndex - 1

    this.currentStepIndex = step
    if (!this.traceManager.inRange(step)) {
      return
    }
    this.triggerStepChanged(step)
  }

  /**
   * Steps forward into the next instruction in the trace.
   * In Solidity mode, resolves to the next source code location.
   *
   * @param {boolean} solidityMode - If true, steps to next Solidity source location; if false, steps to next EVM instruction
   */
  stepIntoForward (solidityMode) {
    if (!this.traceManager.isLoaded()) return
    let step
    if (solidityMode) {
      step = this.resolveToReducedTrace(this.currentStepIndex, 1)
    } else
      step = this.currentStepIndex + 1
    this.currentStepIndex = step
    if (!this.traceManager.inRange(step)) {
      return
    }
    this.triggerStepChanged(step)
  }

  /**
   * Steps backward over the current statement, skipping into function calls.
   * Moves to the previous statement at the same or higher scope level.
   *
   * @param {boolean} solidityMode - If true, steps at Solidity source level; if false, steps at EVM instruction level
   */
  stepOverBack (solidityMode) {
    if (!this.traceManager.isLoaded()) return
    const step = this.traceManager.findStepOverBack(this.currentStepIndex)
    if (this.currentStepIndex === step) return
    this.currentStepIndex = step
    this.triggerStepChanged(step)
  }

  /**
   * Steps forward over the current statement, skipping function call details.
   * If at a function call, jumps to the statement after the call returns.
   *
   * @param {boolean} solidityMode - If true, steps at Solidity source level; if false, steps at EVM instruction level
   */
  stepOverForward (solidityMode) {
    if (!this.traceManager.isLoaded()) return
    if (this.currentStepIndex >= this.traceLength - 1) return
    let step = this.currentStepIndex
    const scope = this.debugger.callTree.findScope(step)
    if (scope && scope.firstStep === step) {
      step = scope.lastStep + 1
    } else
      step = step + 1
    if (this.currentStepIndex === step) return
    this.currentStepIndex = step
    this.triggerStepChanged(step)
  }

  /**
   * Jumps out of the current function scope to the calling context.
   * Moves execution to the step immediately after the current function call.
   *
   * @param {boolean} solidityMode - If true, resolves at Solidity source level; if false, at EVM instruction level
   */
  jumpOut (solidityMode) {
    if (!this.traceManager.isLoaded()) return
    const step = this.traceManager.findStepOut(this.currentStepIndex)
    if (this.currentStepIndex === step) return
    this.currentStepIndex = step
    this.triggerStepChanged(step)
  }

  /**
   * Jumps directly to a specific step in the execution trace.
   *
   * @param {number} step - The target step index to jump to
   */
  jumpTo (step) {
    if (!this.traceManager.inRange(step)) return
    if (this.currentStepIndex === step) return
    this.currentStepIndex = step
    this.triggerStepChanged(step)
  }

  /**
   * Jumps to the step where a revert/exception occurred in the transaction.
   * Uses the stored revertionPoint from the last detected revert.
   */
  jumpToException () {
    this.jumpTo(this.revertionPoint)
  }

  /**
   * Jumps forward to the next breakpoint in the trace.
   * If no breakpoint is found ahead, stays at the current position.
   */
  jumpNextBreakpoint () {
    this.debugger.breakpointManager.jumpNextBreakpoint(this.currentStepIndex, true)
  }

  /**
   * Jumps to the previous breakpoint in the trace.
   * If no breakpoint is found ahead, stays at the current position.
   */
  jumpPreviousBreakpoint () {
    this.debugger.breakpointManager.jumpPreviousBreakpoint(this.currentStepIndex, true)
  }

  calculateFirstStep () {
    const step = this.resolveToReducedTrace(0, 1)
    return this.resolveToReducedTrace(step, 1)
  }

  calculateCodeStepList () {
    let step = 0
    let steps = []
    while (step < this.traceLength) {
      const _step = this.resolveToReducedTrace(step, 1)
      if (!_step) break
      steps.push(_step)
      step += 1
    }
    steps = steps.filter((item, pos, self) => { return steps.indexOf(item) === pos })
    return steps
  }

  calculateCodeLength () {
    this.calculateCodeStepList().reverse()
    return this.calculateCodeStepList().reverse()[1] || this.traceLength
  }

  nextStep () {
    return this.resolveToReducedTrace(this.currentStepIndex, 1)
  }

  previousStep () {
    return this.resolveToReducedTrace(this.currentStepIndex, -1)
  }

  resolveToReducedTrace (value, incr) {
    if (!this.debugger.callTree.reducedTrace.length) {
      return value
    }
    let index = this.debugger.callTree.reducedTrace.indexOf(value)
    if (index !== -1) {
      return this.debugger.callTree.reducedTrace[index + incr]
    }
    index = util.findLowerBound(value, this.debugger.callTree.reducedTrace)
    if (index === 0) {
      return this.debugger.callTree.reducedTrace[0]
    } else if (index > this.debugger.callTree.reducedTrace.length) {
      return this.debugger.callTree.reducedTrace[this.debugger.callTree.reducedTrace.length - 1]
    }

    if (incr === -1) return this.debugger.callTree.reducedTrace[index]
    return this.debugger.callTree.reducedTrace[index + 1]
  }
}
