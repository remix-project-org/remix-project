import { Plugin } from '@remixproject/engine'
import { createPublicClient, createWalletClient, custom, type Hex } from 'viem'
import {
  ENS_EVENTS,
  ENS_PUBLIC_RESOLVER_L1,
  OWNABLE_ABI,
  POLL_INTERVAL,
  REVERSE_REGISTRAR_ABI_L1,
  REVERSE_REGISTRAR_ABI_L2,
  REVERSE_REGISTRAR_READ_ABI,
  SUPPORTED_CHAINS,
  buildFullName,
  createEnsJob,
  fetchEnsJobStatus,
  fetchEnsNetworks,
  fetchEnsPreflight,
  getEnsEventName,
  getReverseRegistrar,
  lookupPrimaryEnsName,
  type EnsEventName,
  type JobResult,
  type PreflightRequest,
  type PrimaryEnsCheckParams,
  type PrimaryEnsCheckResult,
  type RegisterForwardParams,
  type ReverseCheckParams,
  type ReverseCheckResult,
} from '@remix-ui/run-tab-deployed-contracts/ens-contract-names'

const MAX_JOB_POLL_FAILURES = 3

const profile = {
  name: 'ensContractNames',
  displayName: 'ENS Contract Names',
  description: 'Manages ENS contract naming operations for deployed contracts',
  methods: [
    'getSupportedNetworks',
    'preflight',
    'registerForward',
    'getJob',
    'checkReverseStatus',
    'setReverse',
    'checkPrimaryEnsName',
    'lookupPrimary',
    'cancelOperation',
  ],
  events: [
    ENS_EVENTS.forwardStatus,
    ENS_EVENTS.forwardCompleted,
    ENS_EVENTS.forwardFailed,
    ENS_EVENTS.reverseStatus,
    ENS_EVENTS.reverseCompleted,
    ENS_EVENTS.reverseFailed,
    ENS_EVENTS.primaryEnsStatus,
  ],
  version: '0.0.1',
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export class EnsContractNamesPlugin extends Plugin {
  private cancelledOperations = new Set<string>()

  constructor() {
    super(profile)
  }

  getSupportedNetworks() {
    return fetchEnsNetworks()
  }

  preflight(params: PreflightRequest) {
    return fetchEnsPreflight(params)
  }

  getJob(jobId: string) {
    return fetchEnsJobStatus(jobId)
  }

  lookupPrimary(params: { name: string; chainId: number; contractAddress: string }) {
    return lookupPrimaryEnsName(params)
  }

  cancelOperation(requestId: string) {
    if (requestId) this.cancelledOperations.add(requestId)
  }

  async registerForward(params: RegisterForwardParams): Promise<JobResult> {
    const { requestId = '', label, project, chainId, contractAddress } = params
    this.cancelledOperations.delete(requestId)
    this.emitForRequest(ENS_EVENTS.forwardStatus, requestId, { status: 'pending' })

    try {
      const response = await createEnsJob({ label, project, chainId, contractAddress })
      const fullName = response.fullName || buildFullName(label, project)

      if (response.status === 'current') {
        const current: JobResult = {
          id: '',
          status: 'completed',
          fullName,
          label,
          project,
          chainId,
          contractAddress,
          transactions: [],
          totalGasUsed: '0',
          totalCostWei: '0',
        }
        this.emitForRequest(ENS_EVENTS.forwardCompleted, requestId, { job: current })
        return current
      }

      if (!response.jobId) throw new Error(response.error || 'ENS registration job was not created.')

      let job: JobResult | null = null
      let consecutivePollFailures = 0
      while (!job || (job.status !== 'completed' && job.status !== 'failed')) {
        this.throwIfCancelled(requestId)
        await wait(POLL_INTERVAL)
        this.throwIfCancelled(requestId)

        try {
          job = await fetchEnsJobStatus(response.jobId)
          consecutivePollFailures = 0
        } catch (pollError: any) {
          consecutivePollFailures += 1
          if (consecutivePollFailures >= MAX_JOB_POLL_FAILURES) {
            throw new Error(pollError?.message || 'Could not fetch ENS registration status.')
          }
          continue
        }

        this.emitForRequest(ENS_EVENTS.forwardStatus, requestId, { job, status: job.status })

        if (job.status === 'completed') {
          await this.logTerminal('info', `ENS registered: ${job.fullName}`)
          this.emitForRequest(ENS_EVENTS.forwardCompleted, requestId, { job })
          return job
        }

        if (job.status === 'failed') {
          const error = job.error || 'Registration failed.'
          throw new Error(error)
        }
      }
    } catch (error: any) {
      if (error?.message !== 'Operation canceled') {
        this.emitForRequest(ENS_EVENTS.forwardFailed, requestId, { error: error?.message || String(error) })
      }
      throw error
    } finally {
      this.cancelledOperations.delete(requestId)
    }
  }

  async checkReverseStatus(params: ReverseCheckParams): Promise<ReverseCheckResult> {
    const { requestId = '', chainId, contractAddress, fullName } = params
    const result = await this.readReverseStatus(chainId, contractAddress, fullName)
    this.emitForRequest(ENS_EVENTS.reverseStatus, requestId, { result })
    return result
  }

  async checkPrimaryEnsName(params: PrimaryEnsCheckParams): Promise<PrimaryEnsCheckResult> {
    const { requestId = '', chainId, contractAddress } = params
    this.emitForRequest(ENS_EVENTS.primaryEnsStatus, requestId, { result: { status: 'checking', name: '', message: '' } })

    const provider = this.getWalletProvider()
    if (!provider) {
      const result: PrimaryEnsCheckResult = { status: 'unavailable', name: '', message: '' }
      this.emitForRequest(ENS_EVENTS.primaryEnsStatus, requestId, { result })
      return result
    }

    try {
      const publicClient = createPublicClient({ transport: custom(provider) })
      const currentChainId = await publicClient.getChainId()
      if (currentChainId !== chainId) {
        const result: PrimaryEnsCheckResult = { status: 'unavailable', name: '', message: '' }
        this.emitForRequest(ENS_EVENTS.primaryEnsStatus, requestId, { result })
        return result
      }

      const name = await publicClient.readContract({
        address: getReverseRegistrar(chainId),
        abi: REVERSE_REGISTRAR_READ_ABI,
        functionName: 'nameForAddr',
        args: [contractAddress as Hex],
      })
      const candidate = typeof name === 'string' ? name.trim() : ''

      if (!candidate) {
        const result: PrimaryEnsCheckResult = { status: 'unverified', name: '', message: '' }
        this.emitForRequest(ENS_EVENTS.primaryEnsStatus, requestId, { result })
        return result
      }

      const lookup = await lookupPrimaryEnsName({ name: candidate, chainId, contractAddress })
      const result: PrimaryEnsCheckResult = lookup.verified
        ? { status: 'verified', name: lookup.name, message: 'Primary ENS verified by reverse and forward records.' }
        : { status: 'unverified', name: candidate, message: 'Reverse name found, but its forward record does not point to this address.' }

      this.emitForRequest(ENS_EVENTS.primaryEnsStatus, requestId, { result })
      return result
    } catch {
      const result: PrimaryEnsCheckResult = { status: 'unavailable', name: '', message: '' }
      this.emitForRequest(ENS_EVENTS.primaryEnsStatus, requestId, { result })
      return result
    }
  }

  async setReverse(params: ReverseCheckParams): Promise<ReverseCheckResult> {
    const { requestId = '', chainId, contractAddress, fullName } = params
    this.emitForRequest(ENS_EVENTS.reverseStatus, requestId, { message: 'Connecting wallet...' })

    try {
      const provider = this.getWalletProvider()
      if (!provider) throw new Error('No wallet provider found. Please install MetaMask.')

      const walletClient = createWalletClient({ transport: custom(provider) })
      const publicClient = createPublicClient({ transport: custom(provider) })

      const currentChainId = await publicClient.getChainId()
      await this.logTerminal('info', `[ENS-Reverse] Chain: ${currentChainId}, expected: ${chainId}`)
      if (currentChainId !== chainId) {
        throw new Error(`Please switch your wallet to ${SUPPORTED_CHAINS.get(chainId)} (chain ID ${chainId}). Current: ${currentChainId}`)
      }

      const [account] = await walletClient.requestAddresses()
      await this.logTerminal('info', `[ENS-Reverse] Account: ${account}`)

      this.emitForRequest(ENS_EVENTS.reverseStatus, requestId, { message: 'Verifying contract ownership...' })
      const owner = await this.readOwner(publicClient, contractAddress)
      await this.logTerminal('info', `[ENS-Reverse] Contract owner: ${owner}, account: ${account}`)

      if (owner.toLowerCase() !== account.toLowerCase()) {
        throw new Error(`Reverse can only be set by the contract owner.\nowner(): ${owner}\nYour address: ${account}`)
      }

      const registrar = getReverseRegistrar(chainId)
      const isL1 = chainId === 1
      const abi = isL1 ? REVERSE_REGISTRAR_ABI_L1 : REVERSE_REGISTRAR_ABI_L2
      const args = isL1
        ? [contractAddress as Hex, account, ENS_PUBLIC_RESOLVER_L1, fullName]
        : [contractAddress as Hex, fullName]

      await this.logTerminal('info', `[ENS-Reverse] Registrar: ${registrar}, L1: ${isL1}`)
      await this.logTerminal('info', `[ENS-Reverse] Args: ${JSON.stringify(args)}`)

      this.emitForRequest(ENS_EVENTS.reverseStatus, requestId, { message: 'Simulating transaction...' })
      try {
        await publicClient.simulateContract({
          address: registrar,
          abi: abi as any,
          functionName: 'setNameForAddr',
          args: args as any,
          account,
        })
        await this.logTerminal('info', '[ENS-Reverse] Simulation passed')
      } catch (simulationError: any) {
        const reason = simulationError.shortMessage || simulationError.message
        await this.logTerminal('error', `[ENS-Reverse] Simulation failed: ${reason}`)
        if (simulationError.data) {
          await this.logTerminal('error', `[ENS-Reverse] Revert data: ${JSON.stringify(simulationError.data)}`)
        }
        throw new Error(`Transaction would fail: ${reason}`)
      }

      this.emitForRequest(ENS_EVENTS.reverseStatus, requestId, { message: 'Confirm the transaction in your wallet...' })
      const tx = await walletClient.writeContract({
        chain: null,
        address: registrar,
        abi: abi as any,
        functionName: 'setNameForAddr',
        args: args as any,
        account,
        gas: BigInt(200000),
      })
      await this.logTerminal('info', `[ENS-Reverse] Tx submitted: ${tx}`)

      this.emitForRequest(ENS_EVENTS.reverseStatus, requestId, { message: 'Waiting for transaction confirmation...' })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx, timeout: 120_000 })
      await this.logTerminal('info', `[ENS-Reverse] Tx confirmed. Status: ${receipt.status}, block: ${receipt.blockNumber}, gas: ${receipt.gasUsed}`)

      if (receipt.status === 'reverted') throw new Error(`Transaction reverted on-chain (tx: ${tx})`)

      await this.logTerminal('info', `Reverse: ${contractAddress} -> ${fullName} (on ${SUPPORTED_CHAINS.get(chainId)})`)

      const result: ReverseCheckResult = {
        status: 'set',
        name: fullName,
        done: true,
        message: 'Reverse record set.',
      }
      this.emitForRequest(ENS_EVENTS.reverseCompleted, requestId, { result })
      return result
    } catch (error: any) {
      const message = error?.shortMessage || error?.message || String(error)
      this.emitForRequest(ENS_EVENTS.reverseFailed, requestId, { error: message })
      await this.logTerminal('error', `[ENS-Reverse] ERROR: ${message}`)
      if (error?.cause) await this.logTerminal('error', `[ENS-Reverse] Cause: ${this.safeJson(error.cause)}`)
      throw error
    }
  }

  private async readReverseStatus(chainId: number, contractAddress: string, fullName: string): Promise<ReverseCheckResult> {
    const provider = this.getWalletProvider()
    if (!provider) {
      return {
        status: 'unavailable',
        name: '',
        done: false,
        message: 'Connect a wallet to check the reverse record.',
      }
    }

    try {
      const publicClient = createPublicClient({ transport: custom(provider) })
      const currentChainId = await publicClient.getChainId()

      if (currentChainId !== chainId) {
        return {
          status: 'wrong_chain',
          name: '',
          done: false,
          message: `Switch your wallet to ${SUPPORTED_CHAINS.get(chainId)} to check the reverse record.`,
        }
      }

      const name = await publicClient.readContract({
        address: getReverseRegistrar(chainId),
        abi: REVERSE_REGISTRAR_READ_ABI,
        functionName: 'nameForAddr',
        args: [contractAddress as Hex],
      })
      const currentName = typeof name === 'string' ? name : ''

      if (currentName.toLowerCase() === fullName.toLowerCase()) {
        return {
          status: 'set',
          name: currentName,
          done: true,
          message: 'Reverse record is already set.',
        }
      }

      return {
        status: 'not_set',
        name: currentName,
        done: false,
        message: currentName ? `Reverse currently points to ${currentName}.` : 'Reverse is not set yet.',
      }
    } catch {
      return {
        status: 'unavailable',
        name: '',
        done: false,
        message: 'Reverse status could not be checked from the current wallet.',
      }
    }
  }

  private async readOwner(publicClient: any, contractAddress: string): Promise<string> {
    try {
      return await publicClient.readContract({
        address: contractAddress as Hex,
        abi: OWNABLE_ABI,
        functionName: 'owner',
        args: [],
      }) as string
    } catch {
      throw new Error('Only the contract owner can set the reverse name. This contract may not expose owner().')
    }
  }

  private throwIfCancelled(requestId: string) {
    if (requestId && this.cancelledOperations.has(requestId)) {
      throw new Error('Operation canceled')
    }
  }

  private getWalletProvider(): any {
    if (typeof window === 'undefined') return null
    return (window as any).ethereum
  }

  private emitForRequest(eventName: EnsEventName, requestId: string, payload: Record<string, any>) {
    const nextPayload = { requestId, ...payload }
    const scopedEventName = getEnsEventName(eventName, requestId)
    this.emit(scopedEventName as any, nextPayload)
    if (scopedEventName !== eventName) this.emit(eventName as any, nextPayload)
  }

  private async logTerminal(type: 'info' | 'error', value: string) {
    try {
      await this.call('terminal', 'log', { type, value })
    } catch {
      // Terminal may not be active in tests or embedded hosts.
    }
  }

  private safeJson(value: any): string {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
}
