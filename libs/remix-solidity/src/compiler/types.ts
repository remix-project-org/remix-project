export interface CompilerSettings {
  // optimize?: string,
  // Optional: viaIR
  viaIR?: boolean
  // Optional: Sorted list of remappings
  remappings?: string[],
  // Optional: Optimizer settings
  optimizer?: {
    // disabled by default
    enabled: boolean,
    // Optimize for how many times you intend to run the code.
    // Lower values will optimize more for initial deployment cost, higher
    // values will optimize more for high-frequency usage.
    runs: number,
    // Switch optimizer components on or off in detail.
    // The "enabled" switch above provides two defaults which can be
    // tweaked here. If "details" is given, "enabled" can be omitted.
    details?: {
      // The peephole optimizer is always on if no details are given,
      // use details to switch it off.
      peephole?: boolean,
      // The unused jumpdest remover is always on if no details are given,
      // use details to switch it off.
      jumpdestRemover?: boolean,
      // Sometimes re-orders literals in commutative operations.
      orderLiterals?: boolean,
      // Removes duplicate code blocks
      deduplicate?: boolean,
      // Common subexpression elimination, this is the most complicated step but
      // can also provide the largest gain.
      cse?: boolean,
      // Optimize representation of literal numbers and strings in code.
      constantOptimizer?: boolean,
      // The new Yul optimizer. Mostly operates on the code of ABIEncoderV2.
      // It can only be activated through the details here.
      yul?: boolean,
      // Tuning options for the Yul optimizer.
      yulDetails?: {
        // Improve allocation of stack slots for variables, can free up stack slots early.
        // Activated by default if the Yul optimizer is activated.
        stackAllocation: boolean
      }
    }
  },
  // Version of the EVM to compile for.
  // Affects type checking and code generation.
  evmVersion?: EVMVersion,
  // Optional: Debugging settings
  debug?: {
    // How to treat revert (and require) reason strings. Settings are
    // "default", "strip", "debug" and "verboseDebug".
    // "default" does not inject compiler-generated revert strings and keeps user-supplied ones.
    // "strip" removes all revert strings (if possible, i.e. if literals are used) keeping side-effects
    // "debug" injects strings for compiler-generated internal reverts (not yet implemented)
    // "verboseDebug" even appends further information to user-supplied revert strings (not yet implemented)
    revertStrings: 'default' | 'strip' | 'debug' | 'verboseDebug'
  }
  // Metadata settings (optional)
  metadata?: {
    // Use only literal content and not URLs (false by default)
    useLiteralContent: boolean,
    // Use the given hash method for the metadata hash that is appended to the bytecode.
    // The metadata hash can be removed from the bytecode via option "none".
    // The other options are "ipfs" and "bzzr1".
    // If the option is omitted, "ipfs" is used by default.
    bytecodeHash: 'ipfs' | 'bzzr1' | 'none'
  },
  // Addresses of the libraries. If not all libraries are given here,
  // it can result in unlinked objects whose output data is different.
  libraries?: {
    // The top level key is the name of the source file where the library is used.
    // If remappings are used, this source file should match the global path
    // after remappings were applied.
    // If this key is an empty string, that refers to a global level.
    [fileName: string]: Record<string, string>
  }
  // The following can be used to select desired outputs based
  // on file and contract names.
  // If this field is omitted, then the compiler loads and does type checking,
  // but will not generate any outputs apart from errors.
  // The first level key is the file name and the second level key is the contract name.
  // An empty contract name is used for outputs that are not tied to a contract
  // but to the whole source file like the AST.
  // A star as contract name refers to all contracts in the file.
  // Similarly, a star as a file name matches all files.
  // To select all outputs the compiler can possibly generate, use
  // "outputSelection: { "*": { "*": [ "*" ], "": [ "*" ] } }"
  // but note that this might slow down the compilation process needlessly.
  //
  // The available output types are as follows:
  //
  // File level (needs empty string as contract name):
  //   ast - AST of all source files
  //   legacyAST - legacy AST of all source files
  //
  // Contract level (needs the contract name or "*"):
  //   abi - ABI
  //   devdoc - Developer documentation (natspec)
  //   userdoc - User documentation (natspec)
  //   metadata - Metadata
  //   ir - Yul intermediate representation of the code before optimization
  //   irOptimized - Intermediate representation after optimization
  //   storageLayout - Slots, offsets and types of the contract's state variables.
  //   evm.assembly - New assembly format
  //   evm.legacyAssembly - Old-style assembly format in JSON
  //   evm.bytecode.object - Bytecode object
  //   evm.bytecode.opcodes - Opcodes list
  //   evm.bytecode.sourceMap - Source mapping (useful for debugging)
  //   evm.bytecode.linkReferences - Link references (if unlinked object)
  //   evm.deployedBytecode* - Deployed bytecode (has the same options as evm.bytecode)
  //   evm.methodIdentifiers - The list of function hashes
  //   evm.gasEstimates - Function gas estimates
  //   ewasm.wast - eWASM S-expressions format (not supported at the moment)
  //   ewasm.wasm - eWASM binary format (not supported at the moment)
  //
  // Note that using a using `evm`, `evm.bytecode`, `ewasm`, etc. will select every
  // target part of that output. Additionally, `*` can be used as a wildcard to request everything.
  //
  outputSelection?: {
      '*': {
        '': [ 'ast' ],
        '*': [ 'abi', 'metadata', 'devdoc', 'userdoc', 'storageLayout', 'evm.legacyAssembly', 'evm.bytecode', 'evm.deployedBytecode', 'evm.methodIdentifiers', 'evm.gasEstimates', 'evm.assembly' ]
      }
  }
}

export interface CompilerInput {
    // Required: Source code language. Currently supported are "Solidity" and "Yul".
  language: Language,
  // Required
  sources: Source,
  // Optional
  settings: CompilerSettings
}

export interface Source {
    [fileName: string]:
        {
        // Optional: keccak256 hash of the source file
        keccak256?: string,
        // Required (unless "urls" is used): literal contents of the source file
        content: string,
        urls?: string[]
        }
}

export interface CompilerInputOptions {
    version?: string
    optimize: boolean,
    runs: number,
    libraries?: {
        [fileName: string]: Record<string, string>
    },
    evmVersion?: EVMVersion,
    language?: Language,
    remappings?: string[],
    viaIR?: boolean
}

export type EVMVersion = 'homestead' | 'tangerineWhistle' | 'spuriousDragon' | 'byzantium' | 'constantinople' | 'petersburg' | 'istanbul' | 'berlin' | 'london' | 'paris' | 'shanghai' | 'cancun' | 'prague' | null

export type Language = 'Solidity' | 'Yul'

export enum CompilerRetriggerMode {
  'none' ,
  'retrigger'
}

export interface CompilerState {
    compileJSON: ((input: SourceWithTarget, timeStamp?: number) => void) | null,
    worker: any,
    currentVersion: string| null| undefined,
    compilerLicense: string| null
    optimize: boolean,
    runs: number
    evmVersion: EVMVersion| null,
    viaIR: boolean,
    language: Language,
    remappings: string[]
    compilationStartTime: number| null,
    target: string | null,
    useFileConfiguration: boolean,
    configFileContent: Record<string, any>,
    compilerRetriggerMode: CompilerRetriggerMode,
    lastCompilationResult: {
      data: CompilationResult | null,
      source: SourceWithTarget | null | undefined
    } | null
}

export interface SourceWithTarget {
    sources?: Source,
    target?: string | null | undefined
}

export interface MessageToWorker {
  cmd: string,
  job?: number,
  input?: CompilerInput,
  data?: string
  timestamp?: number
}

export interface MessageFromWorker {
  cmd: string,
  license?: string,
  job?: number,
  missingInputs?: string[],
  input?: any,
  data?: string
  timestamp?: number
}

export interface visitContractsCallbackParam {
  name: string,
  object: CompiledContract,
  file: string
}

export interface visitContractsCallbackInterface {
    (param: visitContractsCallbackParam): boolean | void
}

export interface gatherImportsCallbackInterface {
  (err?: Error | null, result?: SourceWithTarget) : any
}

export interface CompilationResult {
    error?: CompilationError,
    /** not present if no errors/warnings were encountered */
    errors?: CompilationError[]
    /** This contains the file-level outputs. In can be limited/filtered by the outputSelection settings */
    sources?: {
      [contractName: string]: CompilationSource
    }
    /** This contains the contract-level outputs. It can be limited/filtered by the outputSelection settings */
    contracts?: {
      /** If the language used has no contract names, this field should equal to an empty string. */
      [fileName: string]: {
        [contract: string]: CompiledContract
      }
    }
  }

/// ////////
// ERROR //
/// ////////

export interface CompilationError {
    /** Location within the source file */
    sourceLocation?: {
      file: string
      start: number
      end: number
    }
    /** Error type */
    type?: CompilationErrorType
    /** Component where the error originated, such as "general", "ewasm", etc. */
    component?: 'general' | 'ewasm' | string
    severity?: 'error' | 'warning'
    message?: string
    mode?: 'panic'
    /** the message formatted with source location */
    formattedMessage?: string
  }

  type CompilationErrorType =
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

/// //////////
// SOURCE CODE //
/// //////////
export interface SourcesCode {
  [fileName: string] : {content: string}
}

export type CompilationSourceCode = {
  sources: SourcesCode;
  target: string;
}

/// //////////
// SOURCE AST //
/// //////////
export interface CompilationSource {
    /** Identifier of the source (used in source maps) */
    id: number
    /** The AST object */
    ast: AstNode
  }

/// //////
// AST //
/// //////
export interface AstNode {
    absolutePath?: string
    exportedSymbols?: Record<string, unknown>
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

export interface AstNodeAtt {
    operator?: string
    string?: null
    type?: string
    value?: string
    constant?: boolean
    name?: string
    public?: boolean
    exportedSymbols?: Record<string, unknown>
    argumentTypes?: null
    absolutePath?: string
    [x: string]: any
  }

/// ///////////
// CONTRACT //
/// ///////////
export interface CompiledContract {
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
      legacyAssembly: Record<string, unknown>
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

/// //////
// ABI //
/// //////
export type ABIDescription = FunctionDescription | EventDescription

export const isFunctionDescription = (item: ABIDescription): item is FunctionDescription =>
  (item as FunctionDescription).stateMutability !== undefined

export const isEventDescription = (item: ABIDescription): item is EventDescription =>
  (item as EventDescription).type === 'event'

export interface FunctionDescription {
    /** Type of the method. default is 'function' */
    type?: 'function' | 'constructor' | 'fallback' | 'receive'
    /** The name of the function. Constructor and fallback function never have name */
    name?: string
    /** List of parameters of the method. Fallback function doesn’t have inputs. */
    inputs?: ABIParameter[]
    /** List of the outputs parameters for the method, if any */
    outputs?: ABIParameter[]
    /** State mutability of the method */
    stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable'
    /** true if function accepts Ether, false otherwise. Default is false */
    payable?: boolean
    /** true if function is either pure or view, false otherwise. Default is false  */
    constant?: boolean
  }

export interface EventDescription {
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

export interface ABIParameter {
    /** The name of the parameter */
    name: string
    /** The canonical type of the parameter */
    type: ABITypeParameter
    /** Used for tuple types */
    components?: ABIParameter[]
  }

export type ABITypeParameter =
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
    | string // Fallback

/// ////////////////////////
// NATURAL SPECIFICATION //
/// ////////////////////////

// Userdoc
export interface UserDocumentation {
    methods: UserMethodList
    notice: string
  }

export type UserMethodList = {
    [functionIdentifier: string]: UserMethodDoc
  } & {
    'constructor'?: string
  }
export interface UserMethodDoc {
    notice: string
  }

// Devdoc
export interface DeveloperDocumentation {
    author: string
    title: string
    details: string
    methods: DevMethodList
  }

export interface DevMethodList {
    [functionIdentifier: string]: DevMethodDoc
  }

export interface DevMethodDoc {
    author: string
    details: string
    return: string
    params: {
      [param: string]: string
    }
  }

/// ///////////
// BYTECODE //
/// ///////////
export interface BytecodeObject {
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

export interface EsWebWorkerHandlerInterface {
    getWorker(): Worker
  }
