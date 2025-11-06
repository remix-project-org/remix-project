import { PluginClient } from "@remixproject/plugin";
import { createClient } from "@remixproject/plugin-webview";
import { IDebuggerApi, LineColumnLocation,
  onBreakpointClearedListener, onBreakpointAddedListener, onEditorContentChanged, onEnvChangedListener, TransactionReceipt } from '@remix-ui/debugger-ui'
import { DebuggerApiMixin } from '@remix-ui/debugger-ui'
import { CompilerAbstract } from '@remix-project/remix-solidity'

export class DebuggerClientApi extends DebuggerApiMixin(PluginClient) {
  constructor () {
    super()
    createClient(this as any)
    this.initDebuggerApi()
  }

  offsetToLineColumnConverter: IDebuggerApi['offsetToLineColumnConverter']
  removeHighlights: boolean
  onBreakpointCleared: (listener: onBreakpointClearedListener) => void
  onBreakpointAdded: (listener: onBreakpointAddedListener) => void
  onEditorContentChanged: (listener: onEditorContentChanged) => void
  onEnvChanged: (listener: onEnvChangedListener) => void
  discardHighlight: () => Promise<void>
  highlight: (lineColumnPos: LineColumnLocation, path: string) => Promise<void>
  fetchContractAndCompile: (address: string, currentReceipt: TransactionReceipt) => Promise<CompilerAbstract>
  getFile: (path: string) => Promise<string>
  setFile: (path: string, content: string) => Promise<void>
  getDebugProvider: () => any // returns an instance of web3.js, if applicable (mainnet, ...) it returns a reference to a node from devops (so we are sure debug endpoint is available)
  web3: () => any // returns an instance of web3.js
  onStartDebugging: (debuggerBackend: any) => void // called when debug starts
  onStopDebugging: () => void // called when debug stops
}