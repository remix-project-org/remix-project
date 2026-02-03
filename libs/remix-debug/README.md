## Remix Debug
[![npm version](https://badge.fury.io/js/%40remix-project%2Fremix-debug.svg)](https://www.npmjs.com/package/@remix-project/remix-debug)
[![npm](https://img.shields.io/npm/dt/@remix-project/remix-debug.svg?label=Total%20Downloads)](https://www.npmjs.com/package/@remix-project/remix-debug)
[![npm](https://img.shields.io/npm/dw/@remix-project/remix-debug.svg)](https://www.npmjs.com/package/@remix-project/remix-debug)
[![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/ethereum/remix-project/tree/master/libs/remix-debug)
[![contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](https://github.com/ethereum/remix-project/issues)

`@remix-project/remix-debug` is a tool to debug Ethereum transactions on different Remix environments (VM, testnet etc.). It works underneath Remix IDE "DEBUGGER" plugin which is used to analyse step-to-step execution of a transaction to debug it.

### Installation
`@remix-project/remix-debug` is an NPM package and can be installed using NPM as:

`yarn add @remix-project/remix-debug`

### How to use

`@remix-project/remix-debug` can be used as:

```ts

var Debugger = require('remix-debug').EthDebugger
var BreakpointManager = require('remix-debug').BreakpointManager

var debugger = new Debugger({
  compilationResult: () => {
    return compilationResult // that helps resolving source location
  }
})

debugger.addProvider(web3, 'web3')
debugger.switchProvider('web3')

var breakPointManager = new remixCore.code.BreakpointManager(this.debugger, (sourceLocation) => {
    // return offsetToLineColumn
})
debugger.setBreakpointManager(breakPointManager)
breakPointManager.add({fileName, row})
breakPointManager.add({fileName, row})

debugger.debug(<tx_hash>)

// this.traceManager.getCurrentCalledAddressAt

debugger.event.register('newTraceLoaded', () => {
  // start doing basic stuff like retrieving step details
  debugger.traceManager.getCallStackAt(34, (error, callstack) => {})
})

debugger.callTree.register('callTreeReady', () => {
  // start doing more complex stuff like resolving local variables
  breakPointManager.jumpNextBreakpoint(true)
  
  var storageView = debugger.storageViewAt(38, <contract address>, 
  storageView.storageSlot(0, (error, storage) => {})
  storageView.storageRange(error, storage) => {}) // retrieve 0 => 1000 slots

  debugger.extractStateAt(23, (error, state) => {
    debugger.decodeStateAt(23, state, (error, decodedState) => {})
  })
  
  debugger.sourceLocationFromVMTraceIndex(<contract address>, 23, (error, location) => {
    debugger.decodeLocalsAt(23, location, (error, decodedlocals) => {})
  })
  
  debugger.extractLocalsAt(23, (null, locals) => {})
  
})
```

It exports:

```javascript
{
  init,
  traceHelper,
  sourceMappingDecoder,
  EthDebugger,
  TransactionDebugger,
  BreakpointManager,
  SolidityDecoder,
  storage: {
    StorageViewer: StorageViewer,
    StorageResolver: StorageResolver
  },
  CmdLine
}
```

Some of the class details are as:

- - - -

**BreakpointManager**

`constructor({ traceManager, callTree, solidityProxy, locationToRowConverter })` : create a new instance

`jumpNextBreakpoint(defaultToLimit)` : start looking for the next breakpoint

`jumpPreviousBreakpoint(defaultToLimit)` : start looking for the previous breakpoint

`jump(direction, defaultToLimit)` : start looking for the previous or next breakpoint

`hasBreakpointAtLine((fileIndex, line)` : check the given pair fileIndex/line against registered breakpoints

`hasBreakpoint()` : return true if current manager has breakpoint

`add(sourceLocation)` : add a new breakpoint to the manager

`remove(sourceLocation)` : remove a breakpoint from the manager

- - - -

**StorageViewer**

`constructor (_context, _storageResolver, _traceManager)` : create a new instance

`storageRange(defaultToLimit)` : return the storage for the current context (address and vm trace index)

`storageSlot(defaultToLimit)` : return a slot value for the current context (address and vm trace index)

`isComplete(direction, defaultToLimit)` : return True if the storage at @arg address is complete

`initialMappingsLocation((fileIndex, line)` : return all the possible mappings locations for the current context (cached) do not return state changes during the current transaction

`mappingsLocation()` : return all the possible mappings locations for the current context (cached) and current mapping slot. returns state changes during the current transaction

`extractMappingsLocationChanges(sourceLocation)` : retrieve mapping location changes from the storage changes.

- - - -

**StorageResolver**

`constructor (options)` : create a new instance

`storageRange(tx, stepIndex, address, callback)` : return the storage for the current context (address and vm trace index)

`initialPreimagesMappings(tx, stepIndex, address, callback)` : return a slot value for the current context (address and vm trace index)

`storageSlot(slot, tx, stepIndex, address, callback)` : return True if the storage at @arg address is complete

`isComplete(address)` : return all the possible mappings locations for the current context (cached) do not return state changes during the current transaction

### Contribute

Please feel free to open an issue or a pull request. 

In case you want to add some code, do have a look at our contribution guidelines [here](https://github.com/ethereum/remix-project/blob/master/CONTRIBUTING.md). Reach us on [Gitter](https://gitter.im/ethereum/remix) in case of any queries.

### License
MIT © 2018-21 Remix Team

