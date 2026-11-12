import { checkStatus, linkProxy, verify } from 'explorer-verify/core'
import type { ClientList, ExplorerClient, ProxyLinkClient } from 'explorer-verify/core'
import { ExplorerVerifyError, hintFor } from 'explorer-verify/errors'
import { formatHandle, isHandleString, parseHandle } from 'explorer-verify/handle'
import type { BackendName } from 'explorer-verify/backends'
import type { Hex, RouteOverride, StoredContract, VerifyInput, VerifyResult } from 'explorer-verify'
import type { CompilerAbstract } from '@remix-project/remix-solidity'
import type { SubmittedContract, VerificationResponse, VerificationStatus } from '../types'

// Time budgets. The verify view's retry button and verify-on-deploy race a verifier call
// against 10 s and 15 s timers, so a submit returns before them: a job that is still running
// comes back as 'pending' with a handle, and the receipt poller in app.tsx takes over.
// verify() ends within timeoutMs + pollIntervalMs.
export const SUBMIT_TIMEOUT_MS = 7000
export const SUBMIT_POLL_INTERVAL_MS = 2000
// A short status check per poller tick: one or two polls, enough for a slow first answer.
export const STATUS_TIMEOUT_MS = 2500
export const STATUS_POLL_INTERVAL_MS = 1000

/** The route and clients of one Remix verifier. */
export interface ExplorerVerifyRoute {
  backend: BackendName
  clients: ClientList<ExplorerClient>
  route: RouteOverride
  fetch?: typeof fetch
}

/** Joins a base URL from Remix settings with a path, as the previous verifiers did. */
export function joinApiUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path
}

function toHex(value: string): Hex {
  const hex = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value
  return `0x${hex}`
}

/**
 * Builds explorer-verify input from Remix's compilation result for the selected contract.
 * The Standard JSON input goes to the explorer unchanged.
 */
export function toVerifyInput(submittedContract: SubmittedContract, compilerAbstract: CompilerAbstract): VerifyInput {
  const { filePath, contractName } = submittedContract
  const contract = compilerAbstract.data.contracts[filePath]?.[contractName]
  if (!contract) {
    throw new Error(`Compilation output not found for ${filePath}:${contractName}`)
  }
  // TODO: Handle Vyper contracts. This relies on Solidity metadata.
  const metadata = JSON.parse(contract.metadata)
  const input = typeof compilerAbstract.input === 'string' ? JSON.parse(compilerAbstract.input) : compilerAbstract.input

  const verifyInput: VerifyInput = {
    chainId: Number(submittedContract.chainId),
    address: toHex(submittedContract.address),
    contractName: `${filePath}:${contractName}`,
    compiler: { kind: 'solc', version: metadata.compiler.version, input },
  }
  const args = submittedContract.abiEncodedConstructorArgs
  if (args) {
    verifyInput.constructorArgs = toHex(args)
  }
  // Lets explorer-verify derive missing constructor arguments, and check them, where it can.
  const creationBytecode = contract.evm?.bytecode?.object
  if (creationBytecode) {
    verifyInput.creationBytecode = toHex(creationBytecode)
  }
  return verifyInput
}

/**
 * The text a receipt shows for an explorer-verify error: what went wrong and what to do. The
 * hint is the one for end users, which names no SDK function, option or field.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ExplorerVerifyError) {
    return `${error.message} ${hintFor(error, 'user')}`
  }
  return error instanceof Error ? error.message : String(error)
}

/** Names the contract whose source the explorer holds for this address. */
export function storedContractMessage(stored: StoredContract): string {
  const parts = [stored.name, stored.compilerVersion].filter((part): part is string => !!part)
  const which = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  return `The explorer already holds a partial match made from another contract's source${which}. It refused this source as already verified, so the explorer page shows the other source.`
}

function toResponse(result: VerifyResult, backend: BackendName, receiptId: string | null): VerificationResponse {
  if (result.status === 'failed') {
    return { status: 'failed', receiptId, message: result.reason }
  }
  if (result.status === 'already-verified') {
    // explorer-verify submitted this source because the explorer's match names another contract
    // or compiler version, and the explorer refused it as already verified. The code at the
    // address is verified, but the explorer shows the other contract's source, not this one.
    if (result.storedContract) {
      return { status: 'partially verified', receiptId, message: storedContractMessage(result.storedContract) }
    }
    // Routescan states no match grade, so explorer-verify reports every Routescan match as partial.
    if (result.match === 'partial' && backend !== 'routescan') {
      // A partial match of this source. explorer-verify does not submit over it.
      return { status: 'partially verified', receiptId, message: 'The explorer already holds a partial match for this address. It was not submitted again.' }
    }
    return { status: 'already verified', receiptId }
  }
  // Keep the statuses the receipts showed before: Sourcify distinguishes an exact match.
  const status: VerificationStatus = backend === 'sourcify' && result.match === 'exact' ? 'exactly verified' : 'verified'
  return { status, receiptId }
}

/**
 * Submits the contract and waits a short time for the result. A job that is still running
 * returns 'pending' with the explorer-verify handle as the receipt id.
 */
export async function submit(route: ExplorerVerifyRoute, input: VerifyInput): Promise<VerificationResponse & { jobId?: string }> {
  let handle: string | null = null
  try {
    const result = await verify(input, {
      clients: route.clients,
      route: route.route,
      fetch: route.fetch,
      timeoutMs: SUBMIT_TIMEOUT_MS,
      pollIntervalMs: SUBMIT_POLL_INTERVAL_MS,
      onEvent: (event) => {
        if (event.type === 'verify.submitted') {
          handle = event.handle
        }
      },
    })
    return { ...toResponse(result, route.backend, handle), ...jobIdOf(handle) }
  } catch (error) {
    if (error instanceof ExplorerVerifyError && error.details.code === 'not-confirmed') {
      const receiptId = formatHandle(error.details.handle)
      return { status: 'pending', receiptId, ...jobIdOf(receiptId) }
    }
    throw new Error(errorMessage(error))
  }
}

function jobIdOf(handle: string | null): { jobId?: string } {
  return handle && isHandleString(handle) ? { jobId: parseHandle(handle).jobId } : {}
}

/** Polls a submitted job once. Never submits. */
export async function poll(route: ExplorerVerifyRoute, receiptId: string): Promise<VerificationResponse> {
  if (!isHandleString(receiptId)) {
    // A receipt stored by an earlier version of the plugin holds the explorer's own job id.
    return { status: 'failed', receiptId, message: 'This receipt was created by an earlier version of the plugin. Verify the contract again.' }
  }
  try {
    const result = await checkStatus(receiptId, {
      clients: route.clients,
      route: route.route,
      fetch: route.fetch,
      timeoutMs: STATUS_TIMEOUT_MS,
      pollIntervalMs: STATUS_POLL_INTERVAL_MS,
    })
    return toResponse(result, route.backend, receiptId)
  } catch (error) {
    if (error instanceof ExplorerVerifyError) {
      if (error.details.code === 'not-confirmed') {
        return { status: 'pending', receiptId }
      }
      return { status: 'failed', receiptId, message: errorMessage(error) }
    }
    throw error
  }
}

/** Links a proxy to its implementation, which must be verified first. */
export async function link(
  route: Omit<ExplorerVerifyRoute, 'clients'> & { clients: ClientList<ProxyLinkClient> },
  submittedContract: SubmittedContract
): Promise<VerificationResponse> {
  if (!submittedContract.proxyAddress) {
    throw new Error('SubmittedContract does not have a proxyAddress')
  }
  try {
    const result = await linkProxy(
      {
        chainId: Number(submittedContract.chainId),
        address: toHex(submittedContract.proxyAddress),
        expectedImplementation: toHex(submittedContract.address),
      },
      {
        clients: route.clients,
        route: route.route,
        fetch: route.fetch,
        timeoutMs: SUBMIT_TIMEOUT_MS,
        pollIntervalMs: SUBMIT_POLL_INTERVAL_MS,
      }
    )
    if (result.status === 'linked') {
      const message = result.implementationVerified ? undefined : 'Linked, but the explorer holds no verified source for the implementation.'
      return { status: 'verified', receiptId: null, message }
    }
    if (result.status === 'mismatch') {
      const holds = result.implementation ? ` The explorer holds ${result.implementation}.` : ''
      return { status: 'failed', receiptId: null, message: `The proxy points at another implementation.${holds}` }
    }
    return { status: 'failed', receiptId: null, message: result.reason }
  } catch (error) {
    throw new Error(errorMessage(error))
  }
}
