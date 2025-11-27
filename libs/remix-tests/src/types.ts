/** sources object with name of the file and content **/
export interface SrcIfc {
  [key: string]: {
    content: string
  }
}
/** An object with final results of test **/
export interface FinalResult {
    totalPassing: number,
    totalFailing: number,
    totalTime: number,
    errors: any[],
}
/** List of tests to run **/
export interface RunListInterface {
  name: string,
  inputs?: any[]
  type: string,
  constant: boolean,
  payable: boolean,
  signature?: any
}
export interface ResultsInterface {
    passingNum: number,
    failureNum: number,
    timePassed: number
}
export interface TestResultInterface {
  type: string
  value: any
  time?: number
  context?: string
  errMsg?: string
  filename?: string
  assertMethod?: string
  returned?: string | number
  expected?: string | number
  location?: string
  hhLogs?: []
  provider?: any
  debugTxHash?: string
}
export interface TestCbInterface {
  (error: Error | null | undefined, result: TestResultInterface) : void;
}
export interface ResultCbInterface {
  (error: Error | null | undefined, result: ResultsInterface) : void;
}

export interface Options {
  accounts?: string[] | null,
  testFilePath?: string
  provider?: any
}

export interface CompilerConfiguration {
  currentCompilerUrl: string,
  evmVersion: string,
  optimize: boolean,
  usingWorker?: boolean,
  runs: number
}
export interface CompilationErrors {
  name: string,
  errors: Array<Error>,
  message: string
}
// eslint-disable-next-line no-redeclare
export class CompilationErrors extends Error {
  constructor (errors: Array<any>) {
    const mapError = errors.map((e) => { return e.formattedMessage || e.message })
    super(mapError.join('\n'))
    this.errors = errors
    this.name = 'CompilationErrors'
  }
}

/** sources object with name of the file and content **/

/// /////////
// SOURCE //
/// /////////
export interface CompilationSource {
  /** Identifier of the source (used in source maps) */
  id: number
  /** The AST object */
  ast: AstNode
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

export interface compilationInterface {
  [fileName: string]: {
    [contract: string]: CompiledContract
  }
}

export interface ASTInterface {
  [contractName: string]: CompilationSource
}

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
}

/// //////
// ABI //
/// //////
export type ABIDescription = FunctionDescription | EventDescription

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
  signature?: string
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
