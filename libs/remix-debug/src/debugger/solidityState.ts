import { timeStamp } from 'console'
import { EventManager } from '../eventManager'
import { decodeState } from '../solidity-decoder/stateDecoder'
import { StorageViewer } from '../storage/storageViewer'

export class DebuggerSolidityState {
  event
  storageResolver
  stepManager
  traceManager
  codeManager
  solidityProxy
  stateVariablesByAddresses
  tx
  decodeTimeout

  constructor (tx, _stepManager, _traceManager, _codeManager, _solidityProxy) {
    this.event = new EventManager()
    this.storageResolver = null
    this.stepManager = _stepManager
    this.traceManager = _traceManager
    this.codeManager = _codeManager
    this.solidityProxy = _solidityProxy
    this.stateVariablesByAddresses = {}
    this.tx = tx
    this.decodeTimeout = null
  }

  init (index) {
    if (index < 0) {
      return this.event.trigger('solidityStateMessage', ['invalid step index'])
    }

    if (this.stepManager.currentStepIndex !== index) return

    if (!this.storageResolver) {
      return
    }
    if (this.decodeTimeout) {
      window.clearTimeout(this.decodeTimeout)
    }
    this.event.trigger('solidityStateUpdating')
    this.decodeTimeout = setTimeout(() => {
      // necessary due to some states that can crash the debugger
      try {
        this.decode(index)
      } catch (err) {
        console.dir(err)
      }
    }, 1000)
  }

  reset () {
    this.stateVariablesByAddresses = {}
  }

  decode (index) {
    try {
      const address = this.traceManager.getCurrentCalledAddressAt(this.stepManager.currentStepIndex)
      if (this.stateVariablesByAddresses[address]) {
        return this.extractStateVariables(this.stateVariablesByAddresses[address], address)
      }
      this.solidityProxy.extractStateVariablesAt(index).then((stateVars) => {
        this.stateVariablesByAddresses[address] = stateVars
        this.extractStateVariables(stateVars, address)
      }).catch((_error) => {
        this.event.trigger('solidityState', [{}])
      })
    } catch (error) {
      return this.event.trigger('solidityState', [{}])
    }
  }

  extractStateVariables (stateVars, address) {
    address = this.traceManager.getCurrentStorageAddressAt(this.stepManager.currentStepIndex)
    const storageViewer = new StorageViewer({ stepIndex: this.stepManager.currentStepIndex, tx: this.tx, address: address }, this.storageResolver, this.traceManager)
    decodeState(stateVars, storageViewer).then((result) => {
      this.event.trigger('solidityStateMessage', [''])
      if (result['error']) {
        return this.event.trigger('solidityStateMessage', [result['error']])
      }
      this.event.trigger('solidityState', [result])
    })
  }
}
