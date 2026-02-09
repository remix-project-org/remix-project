
import { LineColumnLocation, OffsetToLineColumnConverterFn, TransactionReceipt } from '@remix-project/remix-debug'
import { CompilerAbstract } from '@remix-project/remix-solidity'
export type onBreakpointClearedListener = (params: string, row: number) => void
export type onBreakpointAddedListener = (params: string, row: number) => void
export type onEditorContentChanged = () => void
export type onDebugRequested = (hash: string, web3?: any) => void
export type onEnvChangedListener = (provider: string) => void

export interface IDebuggerApi {
    offsetToLineColumnConverter: OffsetToLineColumnConverterFn
    onRemoveHighlights: (listener: VoidFunction) => void
    onDebugRequested: (listener: onDebugRequested) => void
    onBreakpointCleared: (listener: onBreakpointClearedListener) => void
    onBreakpointAdded: (listener: onBreakpointAddedListener) => void
    onEditorContentChanged: (listener: onEditorContentChanged) => void
    onEnvChanged: (listener: onEnvChangedListener) => void
    discardHighlight: () => Promise<void>
    highlight: (lineColumnPos: LineColumnLocation, path: string, rawLocation: any, stepDetail: any, highlight: any, source: string, executionStep: any) => Promise<void>
    fetchContractAndCompile: (address: string, currentReceipt: TransactionReceipt) => Promise<CompilerAbstract>
    getFile: (path: string) => Promise<string>
    setFile: (path: string, content: string) => Promise<void>
    getDebugProvider: () => any // returns an instance of web3.js, if applicable (mainnet, goerli, ...) it returns a reference to a node from devops (so we are sure debug endpoint is available)
    web3: () => any // returns an instance of web3.js
    showMessage (title: string, message: string): void
    onStartDebugging (debuggerBackend: any): Promise<void> // called when debug starts
    onStopDebugging (): Promise<void> // called when debug stops
    call?: (plugin: string, method: string, ...args: any[]) => Promise<any> // call method from other plugins
    on?: (plugin: string, event: string, listener: (...args: any[]) => void) => void // listen to events from other plugins
    getCache: (key: string) => Promise<any>
    setCache(key: string, value: any): Promise<void>
}

type globalContextFunction = () => { block, tx, receipt }
type onReadyParams = {
    globalContext: globalContextFunction
}
export interface DebuggerUIProps {
    debuggerAPI: IDebuggerApi,
    onReady?: (functions: onReadyParams) => void
}
