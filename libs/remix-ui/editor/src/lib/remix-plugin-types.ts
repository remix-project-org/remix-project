export const remixTypes = `
/// <reference types="node" />

import { EventEmitter } from 'events';

declare type ABIDescription = FunctionDescription | EventDescription

declare interface ABIParameter {
    /** The name of the parameter */
    name: string
    /** The canonical type of the parameter */
    type: ABITypeParameter
    /** Used for tuple types */
    components?: ABIParameter[]
}

declare type ABITypeParameter =
| 'uint'
| 'uint[]' // TODO : add <M>
| 'int'
| 'int[]' // TODO : add <M>
| 'address'
| 'address[]'
| 'bool'
| 'bool[]'
| 'fixed'
| 'fixed[]' // TODO : add <M>
| 'ufixed'
| 'ufixed[]' // TODO : add <M>
| 'bytes'
| 'bytes[]' // TODO : add <M>
| 'function'
| 'function[]'
| 'tuple'
| 'tuple[]'
| string

declare interface Annotation {
    row: number;
    column: number;
    text: string;
    type: "error" | "warning" | "info";
}

declare interface Api {
    events: {
        [key: string]: (...args: any[]) => void
    } & StatusEvents
    methods: {
        [key: string]: (...args: any[]) => void
    }
}

/** A map of Api used to describe all the plugin's api in the project */
declare type ApiMap = Readonly<Record<string, Api>>

declare interface AstNode {
    absolutePath?: string
    exportedSymbols?: Object
    id: number
    nodeType: string
    nodes?: Array<AstNode>
    src: string
    literals?: Array<string>
    file?: string
    scope?: number
    sourceUnit?: number
    symbolAliases?: Array<string>
    [x: string]: any
}

declare interface AstNodeAtt {
    operator?: string
    string?: null
    type?: string
    value?: string
    constant?: boolean
    name?: string
    public?: boolean
    exportedSymbols?: Object
    argumentTypes?: null
    absolutePath?: string
    [x: string]: any
}

declare interface AstNodeLegacy {
    id: number
    name: string
    src: string
    children?: Array<AstNodeLegacy>
    attributes?: AstNodeAtt
}

declare interface BytecodeObject {
    /** The bytecode as a hex string. */
    object: string
    /** Opcodes list */
    opcodes: string
    /** The source mapping as a string. See the source mapping definition. */
    sourceMap: string
    /** If given, this is an unlinked object. */
    linkReferences?: {
        [contractName: string]: {
            /** Byte offsets into the bytecode. */
            [library: string]: { start: number; length: number }[]
        }
    }
}

declare interface CompilationError {
    /** Location within the source file */
    sourceLocation?: {
        file: string
        start: number
        end: number
    }
    /** Error type */
    type: CompilationErrorType
    /** Component where the error originated, such as "general", "ewasm", etc. */
    component: 'general' | 'ewasm' | string
    severity: 'error' | 'warning'
    message: string
    /** the message formatted with source location */
    formattedMessage?: string
}

declare type CompilationErrorType =
| 'JSONError'
| 'IOError'
| 'ParserError'
| 'DocstringParsingError'
| 'SyntaxError'
| 'DeclarationError'
| 'TypeError'
| 'UnimplementedFeatureError'
| 'InternalCompilerError'
| 'Exception'
| 'CompilerError'
| 'FatalError'
| 'Warning'

declare interface CompilationFileSources {
    [fileName: string]:
        {
        // Optional: keccak256 hash of the source file
        keccak256?: string,
        // Required (unless "urls" is used): literal contents of the source file
        content: string,
        urls?: string[]
    }
}

declare interface CompilationResult {
    /** not present if no errors/warnings were encountered */
    errors?: CompilationError[]
    /** This contains the file-level outputs. In can be limited/filtered by the outputSelection settings */
    sources: {
        [contractName: string]: CompilationSource
    }
    /** This contains the contract-level outputs. It can be limited/filtered by the outputSelection settings */
    contracts: {
        /** If the language used has no contract names, this field should equal to an empty string. */
        [fileName: string]: {
            [contract: string]: CompiledContract
        }
    }
}

declare interface CompilationSource {
    /** Identifier of the source (used in source maps) */
    id: number
    /** The AST object */
    ast: AstNode
    /** The legacy AST object */
    legacyAST: AstNodeLegacy
}

declare interface CompiledContract {
    /** The Ethereum Contract ABI. If empty, it is represented as an empty array. */
    abi: ABIDescription[]
    // See the Metadata Output documentation (serialised JSON string)
    metadata: string
    /** User documentation (natural specification) */
    userdoc: UserDocumentation
    /** Developer documentation (natural specification) */
    devdoc: DeveloperDocumentation
    /** Intermediate representation (string) */
    ir: string
    /** EVM-related outputs */
    evm: {
        assembly: string
        legacyAssembly: {}
        /** Bytecode and related details. */
        bytecode: BytecodeObject
        deployedBytecode: BytecodeObject
        /** The list of function hashes */
        methodIdentifiers: {
            [functionIdentifier: string]: string
        }
        // Function gas estimates
        gasEstimates: {
            creation: {
                codeDepositCost: string
                executionCost: 'infinite' | string
                totalCost: 'infinite' | string
            }
            external: {
                [functionIdentifier: string]: string
            }
            internal: {
                [functionIdentifier: string]: 'infinite' | string
            }
        }
    }
    /** eWASM related outputs */
    ewasm: {
        /** S-expressions format */
        wast: string
        /** Binary format (hex string) */
        wasm: string
    }
}

declare interface CondensedCompilationInput {
    language: 'Solidity' | 'Vyper' | 'lll' | 'assembly' | 'yul'
    optimize: boolean
    /** e.g: 0.6.8+commit.0bbfe453 */
    version: string
    evmVersion?: 'cancun' | 'shanghai' | 'paris' | 'berlin' | 'istanbul' | 'petersburg' | 'constantinople' | 'byzantium' | 'spuriousDragon' | 'tangerineWhistle' | 'homestead'
}

declare interface ContentImport {
    content: any
    cleanUrl: string
    type: 'github' | 'http' | 'https' | 'swarm' | 'ipfs'
    url: string
}

declare interface customAction {
    id: string,
    name: string,
    type: customActionType[],
    path: string[],
    extension: string[],
    pattern: string[],
    sticky?: boolean,
    label?: string
}

declare type customActionType = 'file' | 'folder'

/** @deprecated: current version in Remix IDE. To improve to match standard JSON RPC methods */
declare interface CustomNetwork {
    id?: string
    name: string
    url: string
}

export declare const defaultOptions: Partial<PluginOptions<any>>;

declare interface DeveloperDocumentation {
    author: string
    title: string
    details: string
    methods: DevMethodList
}

declare interface DevMethodDoc {
    author: string
    details: string
    return: string
    returns: {
        [param: string]: string
    }
    params: {
        [param: string]: string
    }
}

declare interface DevMethodList {
    [functionIdentifier: string]: DevMethodDoc
}

declare type EventCallback<T extends Api, K extends EventKey<T>> = T extends Api
? T['events'][K]
: (...payload: any[]) => void

declare interface EventDescription {
    type: 'event'
    name: string
    inputs: ABIParameter &
        {
        /** true if the field is part of the log’s topics, false if it one of the log’s data segment. */
        indexed: boolean
    }[]
    /** true if the event was declared as anonymous. */
    anonymous: boolean
}

declare type EventKey<T extends Api> = Extract<keyof T['events'], string>

declare type EventParams<T extends Api, K extends EventKey<T>> = T extends Api
? Parameters<T['events'][K]>
: any[]

declare interface Folder {
    [path: string]: {
        isDirectory: boolean
    }
}

declare interface FunctionDescription {
    /** Type of the method. default is 'function' */
    type?: 'function' | 'constructor' | 'fallback'
    /** The name of the function. Constructor and fallback functions never have a name */
    name?: string
    /** List of parameters of the method. Fallback functions don’t have inputs. */
    inputs?: ABIParameter[]
    /** List of the output parameters for the method, if any */
    outputs?: ABIParameter[]
    /** State mutability of the method */
    stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable'
    /** true if function accepts Ether, false otherwise. Default is false */
    payable?: boolean
    /** true if function is either pure or view, false otherwise. Default is false  */
    constant?: boolean
}

declare type GetPluginService<S extends Record<string, any>> = S extends IPluginService<infer I> ? S : IPluginService<S>

/** Throw an error if client try to send a message before connection */
export declare function handleConnectionError(devMode?: Partial<PluginDevMode>): void;

declare interface HighLightOptions {
    focus: boolean
}

declare interface HighlightPosition {
    start: {
        line: number
        column: number
    }
    end: {
        line: number
        column: number
    }
}

declare interface ICompiler extends Api {
    events: {
        compilationFinished: (
        fileName: string,
        source: CompilationFileSources,
        languageVersion: string,
        data: CompilationResult
        ) => void
    } & StatusEvents
    methods: {
        getCompilationResult(): lastCompilationResult
        compile(fileName: string): void
        setCompilerConfig(settings: CondensedCompilationInput): void
        compileWithParameters(targets: SourcesInput, settings: CondensedCompilationInput): lastCompilationResult
    }
}

declare interface IContentImport {
    events: {} & StatusEvents
    methods: {
        resolve(path: string): ContentImport
        resolveAndSave (url:string, targetPath: string): string
    }
}

declare interface IDgitSystem {
    events: StatusEvents
    methods: {
        init(): void;
        add(cmd: any): string;
        commit(cmd: any): string;
        status(cmd: any): any[];
        rm(cmd: any): string;
        log(cmd: any): any[];
        readblob(cmd: any): { oid: string, blob: Uint8Array }
        resolveref(cmd: any): string
        branch(cmd: any): void
        checkout(cmd: any): void
        branches(): string[]
        currentbranch(): string
        push(cmd: any): string
        pull(cmd: any): void
        setIpfsConfig(config:any): boolean
        zip():void
        setItem(name:string, content:string):void
        getItem(name: string): string
        import(cmd: any): void
        export(cmd: any): void
        remotes(): any[]
        addremote(cmd: any): void
        delremote(cmd: any): void
        clone(cmd: any): void
        localStorageUsed(): any
    };
}

declare interface IEditor {
    events: StatusEvents
    methods: {
        highlight(
        position: HighlightPosition,
        filePath: string,
        hexColor: string,
        opt?: HighLightOptions
        ): void
        discardHighlight(): void
        discardHighlightAt(line: number, filePath: string): void
        addAnnotation(annotation: Annotation): void
        clearAnnotations(): void
        gotoLine(line:number, col:number): void
    }

}

declare interface IFilePanel {
    events: {
        setWorkspace: (workspace:any) => void
        workspaceRenamed: (workspace:any) => void
        workspaceDeleted: (workspace:any) => void
        workspaceCreated: (workspace:any) => void
        customAction: (cmd: customAction) => void
    } & StatusEvents
    methods: {
        getCurrentWorkspace(): { name: string, isLocalhost: boolean, absolutePath: string }
        getWorkspaces(): string[]
        deleteWorkspace(name:string): void
        createWorkspace(name:string, isEmpty:boolean): void
        renameWorkspace(oldName:string, newName:string): void
        registerContextMenuItem(cmd: customAction): void
    }
}

declare interface IFileSystem {
    events: {
        currentFileChanged: (file: string) => void
        fileSaved: (file: string) => void
        fileAdded: (file: string) => void
        folderAdded: (file: string) => void
        fileRemoved: (file: string) => void
        fileClosed: (file: string) => void
        noFileSelected: ()=> void
        fileRenamed: (oldName: string, newName:string, isFolder: boolean) => void
    } & StatusEvents
    methods: {
        /** Open the content of the file in the context (eg: Editor) */
        open(path: string): void
        /** Set the content of a specific file */
        writeFile(path: string, data: string): void
        /** Return the content of a specific file */
        readFile(path: string): string
        /** Change the path of a file */
        rename(oldPath: string, newPath: string): void
        /** Upsert a file with the content of the source file */
        copyFile(src: string, dest: string): void
        /** Create a directory */
        mkdir(path: string): void
        /** Get the list of files in the directory */
        readdir(path: string): string[]
        /** Removes a file or directory recursively */
        remove(path: string): void
        /** Get the name of the file currently focused if any */
        getCurrentFile(): string
        /** close all files */
        closeAllFiles(): void
        /** close a file */
        closeFile(): void
        // Old API
        /** @deprecated Use readdir */
        getFolder(path: string): Folder
        /** @deprecated Use readFile */
        getFile(path: string): string
        /** @deprecated Use writeFile */
        setFile(path: string, content: string): void
        /** @deprecated Use open */
        switchFile(path: string): void
    }
}

/** @deprecated: current version in Remix IDE. To improve to match standard JSON RPC methods */
declare interface INetwork {
    events: {
        providerChanged: (provider: NetworkProvider) => void
    } & StatusEvents
    methods: {
        getNetworkProvider(): NetworkProvider
        detectNetwork(): Network | Partial<CustomNetwork>
        getEndpoint(): string
        addNetwork(network: CustomNetwork): void
        removeNetwork(name: string): void
    }
}

declare interface IPluginManager {
    events: {
        profileUpdated(profile: Profile): void
        profileAdded(profile: Profile): void
        pluginDeactivated(profile: Profile): void
        pluginActivated(profile: Profile): void
    } & StatusEvents
    methods: {
        getProfile(name: string): Promise<Profile>
        updateProfile(profile: Partial<Profile>): any
        activatePlugin(name: string): any
        deactivatePlugin(name: string): any
        isActive(name: string): boolean
        canCall(from: string, to: string, method: string, message?: string): any
    }
}

declare type IPluginService<T extends Record<string, any> = any> = {
    methods: string[]
    readonly path: string
} & T

declare interface IRemixApi {
    manager: IPluginManager,
    solidity: ICompiler
    fileManager: IFileSystem
    filePanel: IFilePanel
    dGitProvider: IDgitSystem
    solidityUnitTesting: IUnitTesting
    editor: IEditor
    network: INetwork
    udapp: IUdapp
    contentImport: IContentImport
    settings: ISettings
    theme: ITheme
    vscodeExtAPI: IVScodeExtAPI
    terminal: ITerminal
}

declare interface ISettings {
    events: {} & StatusEvents
    methods: {
        getGithubAccessToken(): string
    }
}

declare interface ITerminal {
    events: {
    } & StatusEvents
    methods: {
        log(message: TerminalMessage): void
    }
}

declare interface ITheme {
    events: {
        themeChanged: (theme: Theme) => void
    } & StatusEvents
    methods: {
        currentTheme(): Theme
    }
}

declare interface IUdapp {
    events: {
        newTransaction: (transaction: RemixTxEvent) => void
    } & StatusEvents
    methods: {
        sendTransaction(tx: RemixTx): RemixTxReceipt
        getAccounts(): string[]
        createVMAccount(vmAccount: VMAccount): string
        getSettings(): UdappSettings
        setEnvironmentMode(env: 'vm' | 'injected' | 'web3'): void
    }
}

declare interface IUnitTesting {
    events: {} & StatusEvents
    methods: {
        testFromPath(path: string): UnitTestResult
        testFromSource(sourceCode: string): UnitTestResult
    }
}

declare interface IVScodeExtAPI {
    events: {
    } & StatusEvents
    methods: {
        executeCommand(extension: string, command: string, payload?: any[]): any
    }
}

declare interface lastCompilationResult {
    data: CompilationResult | null
    source: SourceWithTarget | null | undefined
}

declare type MethodKey<T extends Api> = Extract<keyof T['methods'], string>

declare type MethodParams<T extends Api, K extends MethodKey<T>> = T extends Api
? Parameters<T['methods'][K]>
: any[]

declare type Network =
| { id: '1', name: 'Main' }
| { id: '2', name: 'Morden (deprecated)' }
| { id: '3', name: 'Ropsten (deprecated)' }
| { id: '4', name: 'Rinkeby (deprecated)' }
| { id: '5', name: 'Goerli (deprecated)' }
| { id: '42', name: 'Kovan (deprecated)' }
| { id: '11155111', name: 'Sepolia' }

/** @deprecated: current version in Remix IDE. To improve to match standard JSON RPC methods */
declare type NetworkProvider = 'vm' | 'injected' | 'web3'

declare interface PluginBase<T extends Api = any, App extends ApiMap = any> {
    methods: string[],
    activateService: Record<string, () => Promise<IPluginService>>
    /** Listen on an event from another plugin */
    on<Name extends Extract<keyof App, string>, Key extends EventKey<App[Name]>>(
    name: Name,
    key: Key,
    cb: EventCallback<App[Name], Key>,
    ): void

    /** Listen one time on an event from another plugin, then remove event listener */
    once<Name extends Extract<keyof App, string>, Key extends EventKey<App[Name]>>(
    name: Name,
    key: Key,
    cb: EventCallback<App[Name], Key>,
    ): void

    /** Stop listening on an event from another plugin */
    off<Name extends Extract<keyof App, string>, Key extends EventKey<App[Name]>>(
    name: Name,
    key: Key,
    ): void

    /** Call a method of another plugin */
    call<Name extends Extract<keyof App, string>, Key extends MethodKey<App[Name]>>(
    name: Name,
    key: Key,
    ...payload: MethodParams<App[Name], Key>
    ): Promise<any>

    /** Clear calls in queue of a plugin called by plugin */
    cancel<Name extends Extract<keyof App, string>, Key extends MethodKey<App[Name]>>(
    name: Name,
    key: Key,
    ): void

    /** Emit an event */
    emit<Key extends EventKey<T>>(key: Key, ...payload: EventParams<T, Key>): void
}

export declare class PluginClient<T extends Api = any, App extends ApiMap = RemixApi> implements PluginBase<T, App> {
    private id;
    isLoaded: boolean;
    events: EventEmitter;
    currentRequest: PluginRequest;
    options: PluginOptions<App>;
    name: string;
    methods: string[];
    activateService: Record<string, () => Promise<any>>;
    onActivation?(): void;
    constructor(options?: Partial<PluginOptions<App>>);
    onload(cb?: () => void): Promise<void>;
    /**
     * Ask the plugin manager if current request can call a specific method
     * @param method The method to call
     * @param message An optional message to show to the user
     */
    askUserPermission(method: MethodKey<T>, message?: string): Promise<boolean>;
    /**
     * Called before deactivating the plugin
     * @param from profile of plugin asking to deactivate
     * @note PluginManager will always be able to deactivate
     */
    checkCanDeactivate(from: Profile): boolean;
    /** Make a call to another plugin */
    call<Name extends Extract<keyof App, string>, Key extends MethodKey<App[Name]>>(name: Name, key: Key, ...payload: MethodParams<App[Name], Key>): Promise<ReturnType<App[Name]['methods'][Key]>>;
    /** Listen on event from another plugin */
    on<Name extends Extract<keyof App, string>, Key extends EventKey<App[Name]>>(name: Name, key: Key, cb: EventCallback<App[Name], Key>): void;
    /** Listen once on event from another plugin */
    once<Name extends Extract<keyof App, string>, Key extends EventKey<App[Name]>>(name: Name, key: Key, cb: EventCallback<App[Name], Key>): void;
    /** Remove all listeners on an event from an external plugin */
    off<Name extends Extract<keyof App, string>, Key extends EventKey<App[Name]>>(name: Name, key: Key): void;
    /** Expose an event for the IDE */
    emit<Key extends EventKey<T>>(key: Key, ...payload: EventParams<T, Key>): void;
    /**
     * Create a service under the client node
     * @param name The name of the service
     * @param service The service
     */
    createService<S extends Record<string, any>, Service extends IPluginService<S>>(name: string, service: Service): Promise<GetPluginService<Service>>;
    /**
     * Prepare a service to be lazy loaded
     * @param name The name of the subservice inside this service
     * @param factory A function to create the service on demand
     */
    prepareService<S extends Record<string, any>>(name: string, factory: () => S): () => Promise<IPluginService<S>>;
}

export declare interface PluginDevMode {
    /** Port for localhost */
    port: number | string;
    origins: string | string[];
}

/** Options of the plugin client */
export declare interface PluginOptions<T extends ApiMap> {
    customTheme: boolean;
    /** define a set of custom apis to implements on the client  */
    customApi: ProfileMap<T>;
    /**
     * Allow a set of origins
     * You can either a list of origin or a url with a link of origins
     */
    allowOrigins: string | string[];
    /**
     * options only available for dev mode
     * @deprecated use allowOrigins instead if you want to limit the parent origin
     */
    devMode: Partial<PluginDevMode>;
}

declare interface PluginRequest {
    /** The name of the plugin making the request */
    from: string,
    /** @deprecated Will be remove in the next version */
    isFromNative?: boolean,
    /**
     * The path to access the request inside the plugin
     * @example 'remixd.cmd.git'
     */
    path?: string
}

/** Describe a plugin */
declare interface Profile<T extends Api = any> {
    name: string
    displayName?: string
    methods?: MethodKey<T>[]
    events?: EventKey<T>[]
    permission?: boolean
    hash?: string
    description?: string
    documentation?: string
    version?: string
    kind?: string,
    canActivate?: string[],
    icon?: string
}

/** A map of profile */
declare type ProfileMap<T extends ApiMap> = Partial<{
    [name in keyof T]: Profile<T[name]>
}>

declare type RemixApi = Readonly<IRemixApi>

declare interface RemixTx {
    data: string
    from: string
    to?: string
    timestamp?: string
    gasLimit: string
    value: string
    useCall: boolean
}

declare type RemixTxEvent = {
    contractAddress: string
    data: string
    envMode: 'vm'
    executionCost: string
    from: string
    gas: string
    hash: string
    input: string
    logs: any[]
    returnValue: Uint8Array
    status: '0x01' | '0x00'
    transactionCost: string
    transactionHash: string
    value: string
} | {
    blockHash: string
    blockNumber: number
    envMod: 'injected' | 'web3'
    from: string
    gas: number
    gasPrice: { c: number[], e: number, s: number }
    hash: string
    input: string
    none: number
    r: string
    s: string
    v: string
    status: '0x01' | '0x00'
    to: string
    transactionCost: string
    transactionIndex: number
    value: { c: number[], e: number, s: number }
}

declare interface RemixTxReceipt {
    transactionHash: string
    status: 0 | 1
    gasUsed: string
    error: string
    return: string
    createdAddress?: string
}

declare interface SourceInputContent {
    /** Hash of the source file. */
    keccak256?: string
    /** Literal contents of the source file */
    content: string
}

declare interface SourceInputUrls {
    /** Hash of the source file. It is used to verify the retrieved content imported via URLs */
    keccak256?: string
    /**
     * URL(s) to the source file.
     * URL(s) should be imported in this order and the result checked against the
     * keccak256 hash (if available). If the hash doesn't match or none of the
     * URL(s) result in success, an error should be raised.
     */
    urls: string[]
}

declare interface SourcesInput {
    [contractName: string]: SourceInputContent | SourceInputUrls
}

declare interface SourceWithTarget {
    sources?: CompilationFileSources,
    target?: string | null | undefined
}

declare interface Status {
    /** Display an icon or number */
    key: number | 'edited' | 'succeed' | 'loading' | 'failed' | 'none'
    /** Bootstrap css color */
    type?: 'success' | 'info' | 'warning' | 'error'
    /** Describe the status on mouseover */
    title?: string
}

declare type StatusEvents = {
    statusChanged: (status: Status) => void
}

declare type TerminalMessage = {
    value: any,
    type: 'html' | 'log' | 'info' | 'warn' | 'error'
}

declare interface Theme {
    url?: string
    /** @deprecated Use brightness instead */
    quality?: 'dark' | 'light'
    brightness: 'dark' | 'light'
    colors: {
        surface: string
        background: string
        foreground: string
        primary: string
        primaryContrast: string
        secondary?: string
        secondaryContrast?: string
        success?: string
        successContrast?: string
        warn: string
        warnContrast: string
        error: string
        errorContrast: string
        disabled: string
    }
    breakpoints: {
        xs: number
        sm: number
        md: number
        lg: number
        xl: number
    }
    fontFamily: string
    /** A unit to multiply for margin & padding */
    space: number
}

declare interface UdappSettings {
    selectedAccount:string
    selectedEnvMode: 'vm' | 'injected' | 'web3'
    networkEnvironment: string
}

declare interface UnitTestError {
    context: string
    value: string
    message: string
}

declare interface UnitTestResult {
    totalFailing: number
    totalPassing: number
    totalTime: number
    errors: UnitTestError[]
}

declare interface UserDocumentation {
    methods: UserMethodList
    notice: string
}

declare interface UserMethodDoc {
    notice: string
}

declare type UserMethodList = {
    [functionIdentifier: string]: UserMethodDoc
} & {
    'constructor'?: string
}

declare interface VMAccount {
    privateKey: string
    balance: string
}

export { }
`
