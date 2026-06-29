import type { CompilationSource, SourcesCode } from '@remix-project/remix-solidity' // eslint-disable-line

export interface LineColumnLocation {
    start: {
        line: number, column: number
    },
    end: {
        line: number, column: number
    }
}

export interface RawLocation {
    start: number, length: number
}

export interface Asts {
    [fileName: string] : CompilationSource // ast
}

export interface TransactionReceipt {
    blockHash: string
    blockNumber: number
    transactionHash: string
    transactionIndex: number
    from: string
    to: string
    contractAddress: string | null
  }

export type OffsetToLineColumnConverterFn = { offsetToLineColumn: (sourceLocation: RawLocation, file: number, contents: SourcesCode, asts: Asts) => Promise<LineColumnLocation> }

/**
 * Represents the log of a single EVM step/opcode execution.
 */
export interface StructLog {
  /** The program counter (PC) or index of the currently executing opcode. */
  pc: number;
  /** The name of the current executing operation (opcode), e.g., "ADD", "CALL", "SSTORE". */
  op: string;
  /** The gas available before executing this operation (decimal integer). */
  gas: number;
  /** The gas cost of executing this specific operation (decimal integer). */
  gasCost: number;
  /** The current call depth of the EVM execution. */
  depth: number;
  /** An array of hex-encoded 32-byte values on the EVM stack. */
  stack: string[];
  /** A hex-encoded string of the current memory contents, often separated into 32-byte chunks. */
  memory: string[];
  /** An error message if the execution failed at this step, otherwise undefined. */
  error?: string;
  // Note: 'storage' is usually omitted in public trace formats for performance,
  // but can be included if tracing options explicitly request it.
  // storage?: Record<string, string>;
}

/**
 * The full result object for the default debug_traceTransaction tracer.
 */
export interface DebugTraceTransactionResult {
  /** True if the transaction execution failed (reverted). */
  failed: boolean;
  /** The total gas consumed by the transaction (hex-encoded). */
  gas: string;
  /** The hex-encoded return value of the executed contract call. */
  returnValue: string;
  /** An array of execution steps logs. */
  structLogs: StructLog[];
}

/**
 * Defines a single call frame in the execution trace, representing a contract interaction.
 * The structure is recursive.
 */
export interface CallFrame {
  /** The type of call, e.g., "CALL", "STATICCALL", "DELEGATECALL", "CREATE". */
  type: 'CALL' | 'STATICCALL' | 'DELEGATECALL' | 'CREATE' | 'CREATE2';
  /** The caller's address (hex-encoded). */
  from: string;
  /** The recipient's address (hex-encoded) or the address created for 'CREATE'/'CREATE2'. */
  to?: string;
  /** The value sent with the call (hex-encoded string of Wei). */
  value: string;
  /** The gas limit set for this call (hex-encoded string). */
  gas: string;
  /** The amount of gas used by this specific call (hex-encoded string). */
  gasUsed: string;
  /** The input data (method signature + arguments) (hex-encoded). */
  input: string;
  /** The output data (return value) (hex-encoded). */
  output: string;
  /** An error message if the call failed, otherwise undefined. */
  error?: string;
  /** The revert reason from the contract if the call reverted, otherwise undefined. */
  revertReason?: string;
  /** A recursive list of internal calls made by this call frame. */
  calls: CallFrame[];
}

/**
 * The result of debug_traceTransaction when using the 'callTracer'.
 * It is a single, top-level call frame.
 */
export type CallTracerResult = CallFrame;

/**
 * Defines the storage slots that were read from or written to for a specific account.
 * Key is the 32-byte storage key (hex-encoded), Value is the 32-byte storage value (hex-encoded).
 */
export type AccountStorage = Record<string, string>;

/**
 * Defines the state components of a single account involved in the transaction.
 * This structure reflects the state before and/or after the transaction's changes.
 */
export interface AccountPrestate {
  /** The account's balance in Wei (hex-encoded string). */
  balance: string;
  /** The contract's bytecode (hex-encoded string). Empty string for EOAs. */
  code: string;
  /** The account's nonce (hex-encoded string, or sometimes decimal string). */
  nonce: string;
  /** The storage slots for this account that were affected by the transaction. */
  storage: AccountStorage;
}

/**
 * The full result of debug_traceTransaction when using the 'prestateTracer'.
 * It is a map where the key is the account address (hex-encoded) and the value is the account's state.
 */
export type PrestateTracerResult = Record<string, AccountPrestate>;
