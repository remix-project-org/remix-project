'use strict'

import { Plugin } from '@remixproject/engine'
import { AbiCoder, EventFragment, Interface } from 'ethers'
import { init } from '@remix-project/remix-debug'
import { toHex } from "viem"

const profile = {
  name: 'transactionSimulator',
  description: 'Simulates transactions using eth_simulateV1 RPC endpoint',
  methods: ['simulate', 'simulateTransaction', 'extractLogs', 'decodeLogs', 'lookupEventSignature'],
  events: ['simulationResult', 'logsDecoded'],
  version: '0.0.1'
}

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

export class TransactionSimulator extends Plugin {
  private signatureCache: Map<string, any> = new Map()
  private readonly ETHER_TRANSFER_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  private readonly TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

  constructor() {
    super(profile)
  }

  /**
   * Looks up an event signature from the 4byte.directory API
   * @param signature The event signature hash (topic[0])
   * @returns Event signature information
   */
  async lookupEventSignature(signature: string): Promise<any> {
    // Check cache first
    if (this.signatureCache.has(signature)) {
      return this.signatureCache.get(signature)
    }

    try {
      const url = `https://api.4byte.sourcify.dev/signature-database/v1/lookup?function=${signature}&event=${signature}&filter=false`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch signature: ${response.statusText}`)
      }

      const data = await response.json()

      // Cache the result
      this.signatureCache.set(signature, data)

      return data
    } catch (error) {
      console.error('Error looking up event signature:', error)
      return null
    }
  }

  /**
   * Extracts logs from simulation result
   * @param simulationResult The raw simulation result from eth_simulateV1
   * @returns Array of logs
   */
  extractLogs(simulationResult: any): SimulationLog[] {
    const logs: SimulationLog[] = []

    if (!simulationResult || !Array.isArray(simulationResult)) {
      return logs
    }

    for (const block of simulationResult) {
      if (block.calls && Array.isArray(block.calls)) {
        for (const call of block.calls) {
          if (call.logs && Array.isArray(call.logs)) {
            logs.push(...call.logs)
          }
        }
      }
    }

    return logs
  }

  /**
   * Decodes logs from simulation result
   * @param logs Array of simulation logs
   * @returns Array of decoded logs
   */
  async decodeLogs(logs: SimulationLog[]): Promise<DecodedLog[]> {
    const decodedLogs: DecodedLog[] = []

    for (const log of logs) {
      const decodedLog: DecodedLog = { ...log }

      try {
        // Check if this is an Ether transfer
        if (log.address.toLowerCase() === this.ETHER_TRANSFER_ADDRESS.toLowerCase()) {
          decodedLog.isEtherTransfer = true
          decodedLog.eventName = 'EtherTransfer'

          // Decode standard transfer event
          if (log.topics[0] === this.TRANSFER_EVENT_SIGNATURE) {
            const abiCoder = AbiCoder.defaultAbiCoder()
            const from = log.topics[1] ? '0x' + log.topics[1].slice(26) : null
            const to = log.topics[2] ? '0x' + log.topics[2].slice(26) : null
            const value = log.data !== '0x' ? abiCoder.decode(['uint256'], log.data)[0] : 0n

            decodedLog.decodedData = [
              { name: 'from', type: 'address', value: from },
              { name: 'to', type: 'address', value: to },
              { name: 'value', type: 'uint256', value: value.toString() }
            ]
          }
        } else if (log.topics && log.topics.length > 0) {
          // Lookup the event signature
          const eventSignature = log.topics[0]
          const signatureData = await this.lookupEventSignature(eventSignature)

          if (signatureData && signatureData.result.event && signatureData.result.event[eventSignature] && signatureData.result.event[eventSignature][0]) {
            const eventInfo = signatureData.result.event[eventSignature][0]
            decodedLog.eventSignature = eventInfo.name

            // Try to decode using the event signature
            try {
              const abiCoder = AbiCoder.defaultAbiCoder()
              const eventFragment = EventFragment.from(eventInfo.name)
              const raw = log.topics.concat(log.data)
              raw.shift() // remove the event signature
              const decoded = abiCoder.decode(eventFragment.inputs.map((input) => input.type), '0x' + raw.join('').replace(/0x/g, '')) // just to ensure it's valid
              if (decoded) {
                decodedLog.decodedData = decoded.map((value, index) => {
                  const input = eventFragment.inputs[index]
                  return {
                    name: input.name || `param${index}`,
                    type: input.type,
                    value: typeof value === 'bigint' ? value.toString() : value
                  }
                })
              }
            } catch (decodeError) {
              decodedLog.error = `Failed to decode event: ${decodeError.message}`
            }
          } else {
            decodedLog.error = 'Event signature not found in 4byte.directory'
          }
        }
      } catch (error) {
        decodedLog.error = `Error decoding log: ${error.message}`
      }

      decodedLogs.push(decodedLog)
    }

    return decodedLogs
  }

  /**
   * Simulates a transaction using eth_simulateV1 RPC endpoint
   * @param options Simulation options including calls and validation settings
   * @param blockTag Block tag to simulate against (default: 'latest')
   * @param decodeLogs Whether to decode logs (default: true)
   * @returns Simulation result
   */
  async simulate(options: SimulationOptions, blockTag: string = 'latest', shouldDecodeLogs: boolean = true): Promise<SimulationResult> {
    try {
      // Format the simulation request
      const request = {
        id: Date.now(),
        jsonrpc: '2.0',
        method: 'eth_simulateV1',
        params: [options, blockTag]
      }

      const network = await this.call('network', 'detectNetwork')
      const webDebugNode = init.web3DebugNode(network.id)
      if (!webDebugNode) {
        throw new Error('No debug node available for the current network')
      }

      // Send the request using web3Provider plugin
      const response = await webDebugNode.send('eth_simulateV1', [options, blockTag])

      if (response.error) {
        const result: SimulationResult = {
          success: false,
          error: response.error.message || 'Simulation failed'
        }
        this.emit('simulationResult', result)
        return result
      }

      const result: SimulationResult = {
        success: true,
        result: response
      }
      // Extract and decode logs if requested
      if (shouldDecodeLogs) {
        const logs = this.extractLogs(response)
        if (logs.length > 0) {
          const decodedLogs = await this.decodeLogs(logs)
          result.decodedLogs = decodedLogs
          this.emit('logsDecoded', decodedLogs)
        }
      }

      this.emit('simulationResult', result)
      return result
    } catch (error) {
      const result: SimulationResult = {
        success: false,
        error: error.message || 'Unknown error occurred'
      }
      this.emit('simulationResult', result)
      return result
    }
  }

  /**
   * Simulates a simple transaction with common parameters
   * @param from From address
   * @param to To address (optional)
   * @param value Value in wei hex (optional)
   * @param maxFeePerGas Value in wei hex (optional)
   * @param data Transaction data (optional)
   * @param validation Enable validation (default: true)
   * @param traceTransfers Enable trace transfers (default: true)
   * @param shouldDecodeLogs Whether to decode logs (default: true)
   * @returns Simulation result
   */
  async simulateTransaction(
    from: string,
    to?: string,
    value?: string,
    maxFeePerGas?: string,
    data?: string,
    validation: boolean = true,
    traceTransfers: boolean = true,
    shouldDecodeLogs: boolean = true
  ): Promise<SimulationResult> {
    const ethers = await this.call('blockchain', 'web3')
    const txFee = await ethers.getFeeData()
    const call: SimulationCall = {
      from
    }
    if (maxFeePerGas) {
      call.maxFeePerGas = maxFeePerGas
    } else {
      const network = await this.call('network', 'detectNetwork')
      call.maxFeePerGas = toHex(network.lastBlock.baseFeePerGas ? network.lastBlock.baseFeePerGas + txFee.maxPriorityFeePerGas : txFee.gasPrice)
    }
    if (to) call.to = to
    if (value) call.value = value
    if (data) call.data = data
    const options: SimulationOptions = {
      blockStateCalls: [
        {
          calls: [call]
        }
      ],
      validation,
      traceTransfers
    }

    return this.simulate(options, 'latest', shouldDecodeLogs)
  }
}
