import { EventManager } from '../eventManager'
import { StorageResolver } from '../storage/storageResolver'
import { StorageViewer } from '../storage/storageViewer'
import { helpers } from '@remix-project/remix-lib'
import { DebuggerSolidityState } from './solidityState'
import { DebuggerSolidityLocals } from './solidityLocals'
const { ui } = helpers

export class VmDebuggerLogic {
  event
  debugger
  stepManager
  _traceManager
  _codeManager
  _solidityProxy
  _callTree
  storageResolver
  tx
  debuggerSolidityState
  debuggerSolidityLocals
  address
  traceLength
  addresses

  constructor (_debugger, tx, _stepManager, _traceManager, _codeManager, _solidityProxy, _callTree) {
    this.event = new EventManager()
    this.debugger = _debugger
    this.stepManager = _stepManager
    this._traceManager = _traceManager
    this._codeManager = _codeManager
    this._solidityProxy = _solidityProxy
    this._callTree = _callTree
    this.storageResolver = null
    this.tx = tx

    this.debuggerSolidityState = new DebuggerSolidityState(tx, _stepManager, _traceManager, _codeManager, _solidityProxy)
    this.debuggerSolidityLocals = new DebuggerSolidityLocals(tx, _stepManager, _traceManager, _callTree)
  }

  start () {
    this.listenToEvents()
    this.listenToCodeManagerEvents()
    this.listenToTraceManagerEvents()
    this.listenToFullStorageChanges()
    this.listenToNewChanges()

    this.listenToSolidityStateEvents()
    this.listenToSolidityLocalsEvents()
  }

  listenToEvents () {
    this.debugger.event.register('traceUnloaded', () => {
      this.event.trigger('traceUnloaded')
    })

    this.debugger.event.register('newTraceLoaded', () => {
      this.event.trigger('newTraceLoaded')
    })
  }

  listenToCodeManagerEvents () {
    this._codeManager.event.register('changed', (code, address, index, nextIndexes, returnInstructionIndexes, outOfGasInstructionIndexes) => {
      this.event.trigger('codeManagerChanged', [code, address, index, nextIndexes, returnInstructionIndexes, outOfGasInstructionIndexes])
    })
  }

  listenToTraceManagerEvents () {
    let triggerStorageUpdateStampId
    this.event.register('indexChanged', this, (index) => {
      if (index < 0) return
      if (this.stepManager.currentStepIndex !== index) return

      this.event.trigger('indexUpdate', [index])

      try {
        const calldata = this._traceManager.getCallDataAt(index)
        if (this.stepManager.currentStepIndex === index) {
          this.event.trigger('traceManagerCallDataUpdate', [calldata])
        }
      } catch (error) {
        this.event.trigger('traceManagerCallDataUpdate', [{}])
      }

      try {
        const callstack = this._traceManager.getCallStackAt(index)
        if (this.stepManager.currentStepIndex === index) {
          this.event.trigger('traceManagerCallStackUpdate', [callstack])
        }
      } catch (error) {
        this.event.trigger('traceManagerCallStackUpdate', [{}])
      }

      try {
        const callstack = this._traceManager.getStackAt(index)
        if (this.stepManager.currentStepIndex === index) {
          this.event.trigger('traceManagerStackUpdate', [callstack])
        }
      } catch (error) {
        this.event.trigger('traceManagerStackUpdate', [{}])
      }

      if (triggerStorageUpdateStampId) {
        clearTimeout(triggerStorageUpdateStampId)
        triggerStorageUpdateStampId = null
      }
      triggerStorageUpdateStampId = setTimeout(() => {
        (() => {
          try {
            this.event.trigger('functionsStackUpdate', [this._callTree.retrieveFunctionsStack(index)])
          } catch (e) {
            console.log(e)
          }

          try {
            const memory = this._traceManager.getMemoryAt(index)
            if (this.stepManager.currentStepIndex === index) {
              this.event.trigger('traceManagerMemoryUpdate', [ui.formatMemory(memory, 32)])
            }
          } catch (error) {
            this.event.trigger('traceManagerMemoryUpdate', [{}])
          }
          try {
            const address = this._traceManager.getCurrentCalledAddressAt(index)
            if (!this.storageResolver) return

            const storageViewer = new StorageViewer({ stepIndex: this.stepManager.currentStepIndex, tx: this.tx, address: address }, this.storageResolver, this._traceManager)

            storageViewer.storageRange().then((storage) => {
              if (this.stepManager.currentStepIndex === index) {
                const header = storageViewer.isComplete(address) ? '[Completely Loaded]' : '[Partially Loaded]'
                this.event.trigger('traceManagerStorageUpdate', [storage, header])
              }
            }).catch((_error) => {
              this.event.trigger('traceManagerStorageUpdate', [{}])
            })
          } catch (error) {
            this.event.trigger('traceManagerStorageUpdate', [{}])
          }

          try {
            const returnValue = this._traceManager.getReturnValue(index)
            if (this.stepManager.currentStepIndex === index) {
              this.event.trigger('traceReturnValueUpdate', [[returnValue]])
            }
          } catch (error) {
            this.event.trigger('traceReturnValueUpdate', [[error]])
          }
        })()
      }, 1000)

      try {
        const step = this._traceManager.getCurrentStep(index)
        this.event.trigger('traceCurrentStepUpdate', [null, step])
      } catch (error) {
        this.event.trigger('traceCurrentStepUpdate', [error])
      }

      try {
        const addmem = this._traceManager.getMemExpand(index)
        this.event.trigger('traceMemExpandUpdate', [null, addmem])
      } catch (error) {
        this.event.trigger('traceMemExpandUpdate', [error])
      }

      try {
        const gas = this._traceManager.getStepCost(index)
        this.event.trigger('traceStepCostUpdate', [null, gas])
      } catch (error) {
        this.event.trigger('traceStepCostUpdate', [error])
      }

      try {
        const address = this._traceManager.getCurrentCalledAddressAt(index)
        this.event.trigger('traceCurrentCalledAddressAtUpdate', [null, address])
      } catch (error) {
        this.event.trigger('traceCurrentCalledAddressAtUpdate', [error])
      }

      try {
        const remaining = this._traceManager.getRemainingGas(index)
        this.event.trigger('traceRemainingGasUpdate', [null, remaining])
      } catch (error) {
        this.event.trigger('traceRemainingGasUpdate', [error])
      }
    })
  }

  listenToFullStorageChanges () {
    this.address = []
    this.traceLength = 0

    this.debugger.event.register('newTraceLoaded', (length) => {
      const addresses = this._traceManager.getAddresses()
      this.event.trigger('traceAddressesUpdate', [addresses])
      this.addresses = addresses

      this._traceManager.getLength((error, length) => {
        if (error) return
        this.event.trigger('traceLengthUpdate', [length])
        this.traceLength = length
      })
    })

    this.debugger.event.register('indexChanged', this, async (index) => {
      if (index < 0) return
      if (this.stepManager.currentStepIndex !== index) return
      if (!this.storageResolver) return
      // Clean up storage update
      if (index === this.traceLength - 1) {
        return this.event.trigger('traceStorageUpdate', [{}])
      }
      const storageJSON = {}
      for (const k in this.addresses) {
        const address = this.addresses[k]
        const storageViewer = new StorageViewer({ stepIndex: this.stepManager.currentStepIndex, tx: this.tx, address: address }, this.storageResolver, this._traceManager)
        try {
          storageJSON[address] = await storageViewer.storageRange()
        } catch (e) {
          console.error(e)
        }
      }
      this.event.trigger('traceStorageUpdate', [storageJSON])
    })
  }

  listenToNewChanges () {
    this.debugger.event.register('newTraceLoaded', this, () => {
      this.storageResolver = new StorageResolver({ web3: this.debugger.web3 })
      this.debuggerSolidityState.storageResolver = this.storageResolver
      this.debuggerSolidityLocals.storageResolver = this.storageResolver
      this.event.trigger('newTrace', [])
    })

    this.debugger.callTree.event.register('callTreeReady', (scopes, scopeStarts, internalCallTree) => {
      if (this.debugger.callTree.reducedTrace.length) {
        return this.event.trigger('newCallTree', [internalCallTree])
      }
    })
  }

  listenToSolidityStateEvents () {
    this.event.register('indexChanged', this.debuggerSolidityState.init.bind(this.debuggerSolidityState))
    this.debuggerSolidityState.event.register('solidityState', (state) => {
      this.event.trigger('solidityState', [state])
    })
    this.debuggerSolidityState.event.register('solidityStateMessage', (message) => {
      this.event.trigger('solidityStateMessage', [message])
    })
    this.debuggerSolidityState.event.register('solidityStateUpdating', () => {
      this.event.trigger('solidityStateUpdating', [])
    })
    this.event.register('traceUnloaded', this.debuggerSolidityState.reset.bind(this.debuggerSolidityState))
    this.event.register('newTraceLoaded', this.debuggerSolidityState.reset.bind(this.debuggerSolidityState))
  }

  listenToSolidityLocalsEvents () {
    this.event.register('sourceLocationChanged', this.debuggerSolidityLocals.init.bind(this.debuggerSolidityLocals))
    this.event.register('solidityLocalsLoadMore', this.debuggerSolidityLocals.decodeMore.bind(this.debuggerSolidityLocals))
    this.debuggerSolidityLocals.event.register('solidityLocalsLoadMoreCompleted', (locals) => {
      this.event.trigger('solidityLocalsLoadMoreCompleted', [locals])
    })
    this.debuggerSolidityLocals.event.register('solidityLocals', (state) => {
      this.event.trigger('solidityLocals', [state])
    })
    this.debuggerSolidityLocals.event.register('solidityLocalsMessage', (message) => {
      this.event.trigger('solidityLocalsMessage', [message])
    })
    this.debuggerSolidityLocals.event.register('solidityLocalsUpdating', () => {
      this.event.trigger('solidityLocalsUpdating', [])
    })
    this.debuggerSolidityLocals.event.register('traceReturnValueUpdate', (data, header) => {
      this.event.trigger('traceReturnValueUpdate', [data, header])
    })
  }
}
