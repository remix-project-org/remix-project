import { StatusEvents } from '@remixproject/plugin-utils'

export interface SimulationCall {
  from?: string
  to?: string
  value?: string
  input?: string
  data?: string
  gas?: string
  gasPrice?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  nonce?: string
}

export interface BlockStateCall {
  calls: SimulationCall[]
  blockOverride?: {
    number?: string
    difficulty?: string
    time?: string
    gasLimit?: string
    coinbase?: string
    random?: string
    baseFee?: string
  }
}

export interface SimulationOptions {
  blockStateCalls: BlockStateCall[]
  validation?: boolean
  traceTransfers?: boolean
  returnData?: boolean
}

export interface SimulationLog {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
  transactionIndex: string
  blockHash: string
  blockTimestamp: string
  logIndex: string
  removed: boolean
}

export interface DecodedLog extends SimulationLog {
  eventName?: string
  eventSignature?: string
  decodedData?: {
    name: string
    type: string
    value: any
  }[]
  isEtherTransfer?: boolean
  error?: string
}

export interface SimulationResult {
  success: boolean
  result?: any
  error?: string
  decodedLogs?: DecodedLog[]
}

export interface ITransactionSimulatorApi {
  events: {
    simulationResult: (result: SimulationResult) => void
    logsDecoded: (logs: DecodedLog[]) => void
  } & StatusEvents
  methods: {
    simulate(options: SimulationOptions, blockTag?: string, shouldDecodeLogs?: boolean): Promise<SimulationResult>
    simulateTransaction(
      from: string,
      to?: string,
      value?: string,
      data?: string,
      validation?: boolean,
      traceTransfers?: boolean,
      shouldDecodeLogs?: boolean
    ): Promise<SimulationResult>
    extractLogs(simulationResult: any): SimulationLog[]
    decodeLogs(logs: SimulationLog[]): Promise<DecodedLog[]>
    lookupEventSignature(signature: string): Promise<any>
  }
}
