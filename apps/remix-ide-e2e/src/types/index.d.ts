// Merge custom command types with nightwatch types
/* eslint-disable no-use-before-define */
import { NightwatchBrowser } from 'nightwatch' // eslint-disable-line @typescript-eslint/no-unused-vars
export type callbackCheckVerifyCallReturnValue = (values: string[]) => {message: string; pass: boolean}

declare module 'nightwatch' {
  export interface NightwatchCustomCommands {
    clickLaunchIcon(icon: string): NightwatchBrowser
    switchBrowserTab(indexOrTitle: number | string, forceReload?: boolean): NightwatchBrowser
    scrollAndClick(target: string): NightwatchBrowser
    scrollInto(target: string): NightwatchBrowser
    openTemplateExplorer(): NightwatchBrowser
    testContracts(fileName: string, contractCode: NightwatchContractContent, compiledContractNames: string[]): NightwatchBrowser
    setEditorValue(value: string, callback?: () => void): NightwatchBrowser
    addFile(name: string, content: NightwatchContractContent, readMeFile?: string): NightwatchBrowser
    verifyContracts(compiledContractNames: string[], opts?: {wait: number; version?: string; runs?: string}): NightwatchBrowser
    selectAccount(account?: string): NightwatchBrowser
    clickFunction(fnFullName: string, expectedInput?: NightwatchClickFunctionExpectedInput): NightwatchBrowser
    checkClipboard(): NightwatchBrowser
    testFunction(txHash: string, expectedInput: NightwatchTestFunctionExpectedInput): NightwatchBrowser
    goToVMTraceStep(step: number, incr?: number): NightwatchBrowser
    checkVariableDebug(id: string, debugValue: NightwatchCheckVariableDebugValue): NightwatchBrowser
    addAtAddressInstance(address: string, isValidFormat: boolean, isValidChecksum: boolean, isAbi?: boolean): NightwatchBrowser
    modalFooterOKClick(id?: string): NightwatchBrowser
    clickInstance(index: number): NightwatchBrowser
    journalLastChildIncludes(val: string): NightwatchBrowser
    executeScriptInTerminal(script: string): NightwatchBrowser
    clearEditableContent(cssSelector: string): NightwatchBrowser
    journalChildIncludes(val: string, opts = { shouldHaveOnlyOneOccurrence: boolean }): NightwatchBrowser
    debugTransaction(index: number): NightwatchBrowser
    checkElementStyle(cssSelector: string, styleProperty: string, expectedResult: string): NightwatchBrowser
    openFile(name: string): NightwatchBrowser
    refreshPage(): NightwatchBrowser
    verifyLoad(): NightwatchBrowser
    renamePath(path: string, newFileName: string, renamedPath: string): NightwatchBrowser
    rightClickCustom(cssSelector: string): NightwatchBrowser
    scrollToLine(line: number): NightwatchBrowser
    waitForElementContainsText(id: string, value: string, timeout?: number): NightwatchBrowser
    getModalBody(callback: (value: string, cb: VoidFunction) => void): NightwatchBrowser
    modalFooterCancelClick(id?: string): NightwatchBrowser
    selectContract(contractName: string): NightwatchBrowser
    createContract(inputParams: string): NightwatchBrowser
    getAddressAtPosition(index: number, cb: (pos: string) => void): NightwatchBrowser
    testConstantFunction(address: string, fnFullName: string, expectedInput: NightwatchTestConstantFunctionExpectedInput | null, expectedOutput: string): NightwatchBrowser
    getEditorValue(callback: (content: string) => void): NightwatchBrowser
    getInstalledPlugins(cb: (plugins: string[]) => void): NightwatchBrowser
    verifyCallReturnValue(address: string, checks: string[] | callbackCheckVerifyCallReturnValue): NightwatchBrowser
    testEditorValue(testvalue: string): NightwatchBrowser
    removeFile(path: string, workspace: string): NightwatchBrowser
    switchBrowserWindow(url: string, windowName: string, cb: (browser: NightwatchBrowser, window?: NightwatchCallbackResult<Window>) => void): NightwatchBrowser
    setupMetamask(passphrase: string, password: string): NightwatchBrowser
    hideMetaMaskPopup(): NightwatchBrowser
    signMessage(msg: string, callback: (hash: {value: string}, signature: {value: string}) => void): NightwatchBrowser
    setSolidityCompilerVersion(version: string): NightwatchBrowser
    clickElementAtPosition(cssSelector: string, index: number, opt?: {forceSelectIfUnselected: boolean}): NightwatchBrowser
    notContainsText(cssSelector: string, text: string): NightwatchBrowser
    sendLowLevelTx(address: string, value: string, callData: string): NightwatchBrowser
    journalLastChild(val: string): NightwatchBrowser
    checkTerminalFilter(filter: string, test: string, notContain: boolean): NightwatchBrowser
    noWorkerErrorFor(version: string): NightwatchBrowser
    validateValueInput(selector: string, valueToSet: string[], expectedValue: string): NightwatchBrowser
    checkAnnotations(type: string): NightwatchBrowser
    checkAnnotationsNotPresent(type: string): NightwatchBrowser
    getLastTransactionHash(callback: (hash: string) => void)
    currentWorkspaceIs(name: string): NightwatchBrowser
    addLocalPlugin(this: NightwatchBrowser, profile: Profile & LocationProfile & ExternalProfile, focus: boolean): NightwatchBrowser
    acceptAndRemember(this: NightwatchBrowser, remember: boolean, accept: boolean): NightwatchBrowser
    clearConsole(this: NightwatchBrowser): NightwatchBrowser
    clearTransactions(this: NightwatchBrowser): NightwatchBrowser
    getBrowserLogs(this: NightwatchBrowser): NightwatchBrowser
    currentSelectedFileIs(name: string): NightwatchBrowser
    switchWorkspace: (workspaceName: string) => NightwatchBrowser
    switchEnvironment: (provider: string, returnWhenInitialized?: boolean) => NightwatchBrowser
    connectToExternalHttpProvider: (url: string, identifier: string) => NightwatchBrowser
    waitForElementNotContainsText: (id: string, value: string, timeout: number = 10000) => NightwatchBrowser
    hideToolTips: (this: NightwatchBrowser) => NightwatchBrowser
    // hidePopupPanel: (this: NightwatchBrowser) => NightwatchBrowser
    assistantSetProvider: (provider: string) => NightwatchBrowser
    assistantAddContext: (context: string) => NightwatchBrowser
    assistantGenerate: (prompt: string, provider: string) => NightwatchBrowser
    assistantWorkspace: (prompt: string, provider: string) => NightwatchBrowser
    assistantClearChat: () => NightwatchBrowser
    enableClipBoard: () => NightwatchBrowser
    addFileSnekmate: (name: string, content: NightwatchContractContent) => NightwatchBrowser
    selectFiles: (selelectedElements: any[]) => NightwatchBrowser
    waitForCompilerLoaded: () => NightwatchBrowser
    expandAllFolders: (targetDirectory?: string) => NightwatchBrowser
  }

  export interface NightwatchBrowser {
    api: this
    emit: (status: string) => void
    fullscreenWindow: (result?: any) => this
    keys(keysToSend: string, callback?: (this: NightwatchAPI, result: NightwatchCallbackResult<void>) => void): NightwatchBrowser
    sendKeys: (selector: string, inputValue: string | string[], callback?: (this: NightwatchAPI, result: NightwatchCallbackResult<void>) => void) => NightwatchBrowser
  }

  export interface NightwatchAPI {
    keys(keysToSend: string, callback?: (this: NightwatchAPI, result: NightwatchCallbackResult<void>) => void): NightwatchAPI
  }

  export interface NightwatchContractContent {
    content: string
  }

  export interface NightwatchClickFunctionExpectedInput {
    types: string
    values: string
  }

  export interface NightwatchTestFunctionExpectedInput {
    [key: string]: any
  }

  export interface NightwatchTestConstantFunctionExpectedInput {
    types: string
    values: string
  }

  export type NightwatchCheckVariableDebugValue = NightwatchTestFunctionExpectedInput
}
