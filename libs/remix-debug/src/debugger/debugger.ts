'use strict'
import { Ethdebugger } from '../Ethdebugger'
import { EventManager } from '../eventManager'
import { contractCreationToken } from '../trace/traceHelper'
import { BreakpointManager } from '../code/breakpointManager'
import { DebuggerStepManager } from './stepManager'
import { VmDebuggerLogic } from './VmDebugger'

export class Debugger {
  event
  offsetToLineColumnConverter
  compilationResult
  debugger
  breakPointManager
  step_manager // eslint-disable-line camelcase
  vmDebuggerLogic
  currentFile = -1
  currentLine = -1

  constructor (options) {
    this.event = new EventManager()
    this.offsetToLineColumnConverter = options.offsetToLineColumnConverter
    /*
      Returns a compilation result for a given address or the last one available if none are found
    */
    this.compilationResult = options.compilationResult || function (contractAddress) { return null }

    this.debugger = new Ethdebugger({
      web3: options.web3,
      debugWithGeneratedSources: options.debugWithGeneratedSources,
      compilationResult: this.compilationResult,
      offsetToLineColumnConverter: this.offsetToLineColumnConverter
    })

    const { traceManager, callTree, solidityProxy } = this.debugger
    this.breakPointManager = new BreakpointManager({
      traceManager,
      callTree,
      solidityProxy
    })

    this.breakPointManager.event.register('breakpointStep', (step) => {
      this.step_manager.jumpTo(step)
    })

    this.breakPointManager.event.register('noBreakpointHit', (step) => {
      this.event.trigger('noBreakpointHit', [])
    })

    this.breakPointManager.event.register('locatingBreakpoint', () => {
      this.event.trigger('locatingBreakpoint', [])
    })

    this.debugger.setBreakpointManager(this.breakPointManager)

    this.debugger.event.register('newTraceLoaded', this, () => {
      this.event.trigger('debuggerStatus', [true])
    })

    this.debugger.event.register('traceUnloaded', this, () => {
      this.event.trigger('debuggerStatus', [false])
    })
  }

  async registerAndHighlightCodeItem (index) {
    // register selected code item, highlight the corresponding source location
    // this.debugger.traceManager.getCurrentCalledAddressAt(index, async (error, address) => {

    try {
      const address = this.debugger.traceManager.getCurrentCalledAddressAt(index)
      const compilationResultForAddress = await this.compilationResult(address)
      if (!compilationResultForAddress) {
        this.event.trigger('newSourceLocation', [null])
        this.currentFile = -1
        this.currentLine = -1
        this.vmDebuggerLogic.event.trigger('lineGasCostChanged', [null])
        return
      }

      this.debugger.callTree.getValidSourceLocationFromVMTraceIndexFromCache(address, index, compilationResultForAddress.data.contracts).then(async (rawLocationAndOpcode) => {
        if (compilationResultForAddress && compilationResultForAddress.data) {
          const rawLocation = rawLocationAndOpcode.sourceLocation
          const stepDetail = rawLocationAndOpcode.stepDetail
          const generatedSources = this.debugger.callTree.sourceLocationTracker.getGeneratedSourcesFromAddress(address)

          const lineColumnPos = rawLocationAndOpcode.lineColumnPos

          let lineGasCostObj = null
          try {
            lineGasCostObj = await this.debugger.callTree.getGasCostPerLine(rawLocation.file, lineColumnPos.start.line)
          } catch (e) {
            console.log(e)
          }
          this.event.trigger('newSourceLocation', [lineColumnPos, rawLocation, generatedSources, address, stepDetail, (lineGasCostObj && lineGasCostObj.gasCost) || -1])
          this.vmDebuggerLogic.event.trigger('sourceLocationChanged', [rawLocation])
          if (this.currentFile !== rawLocation.file || this.currentLine !== lineColumnPos.start.line) {
            const instructionIndexes = lineGasCostObj.indexes.map((index) => { // translate from vmtrace index to instruction index
              return this.debugger.codeManager.getInstructionIndex(address, index)
            })
            this.vmDebuggerLogic.event.trigger('lineGasCostChanged', [instructionIndexes, lineColumnPos.start.line])
            this.currentFile = rawLocation.file
            this.currentLine = lineColumnPos.start.line
          }
        } else {
          this.event.trigger('newSourceLocation', [null])
          this.currentFile = -1
          this.currentLine = -1
          this.vmDebuggerLogic.event.trigger('lineGasCostChanged', [null])
        }
      }).catch((_error) => {
        this.event.trigger('newSourceLocation', [null])
        this.vmDebuggerLogic.event.trigger('sourceLocationChanged', [null])
        this.currentFile = -1
        this.currentLine = -1
        this.vmDebuggerLogic.event.trigger('lineGasCostChanged', [null])
      })
      // })
    } catch (error) {
      this.event.trigger('newSourceLocation', [null])
      this.vmDebuggerLogic.event.trigger('sourceLocationChanged', [null])
      this.currentFile = -1
      this.currentLine = -1
      this.vmDebuggerLogic.event.trigger('lineGasCostChanged', [null])
      return console.log(error)
    }
  }

  updateWeb3 (web3) {
    this.debugger.web3 = web3
  }

  async debug (blockNumber, txNumber, tx, loadingCb) {
    const web3 = this.debugger.web3

    if (this.debugger.traceManager.isLoading) {
      return
    }

    if (tx) {
      if (!tx.to) {
        tx.to = contractCreationToken('0')
      }
      return await this.debugTx(tx, loadingCb)
    }

    if (txNumber.indexOf('0x') !== -1) {
      tx = await web3.getTransaction(txNumber)
      if (!tx) throw new Error('cannot find transaction ' + txNumber)
    } else {
      tx = await web3.getTransactionFromBlock(blockNumber, txNumber)
      if (!tx) throw new Error('cannot find transaction ' + blockNumber + ' ' + txNumber)
    }
    return await this.debugTx(tx, loadingCb)
  }

  async debugTx (tx, loadingCb) {
    this.step_manager = new DebuggerStepManager(this.debugger, this.debugger.traceManager)

    this.vmDebuggerLogic = new VmDebuggerLogic(this.debugger, tx, this.step_manager, this.debugger.traceManager, this.debugger.codeManager, this.debugger.solidityProxy, this.debugger.callTree)
    this.vmDebuggerLogic.start()

    this.step_manager.event.register('stepChanged', this, (stepIndex) => {
      if (typeof stepIndex !== 'number' || stepIndex >= this.step_manager.traceLength) {
        return this.event.trigger('endDebug')
      }

      this.debugger.codeManager.resolveStep(stepIndex, tx)
      this.step_manager.event.trigger('indexChanged', [stepIndex])
      this.vmDebuggerLogic.event.trigger('indexChanged', [stepIndex])
      this.vmDebuggerLogic.debugger.event.trigger('indexChanged', [stepIndex])
      this.registerAndHighlightCodeItem(stepIndex)
    })

    loadingCb()
    await this.debugger.debug(tx)
  }

  unload () {
    this.debugger.unLoad()
    this.event.trigger('debuggerUnloaded')
  }
}
