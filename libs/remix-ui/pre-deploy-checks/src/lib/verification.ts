import { StepResult } from './types'

/** Payload of Contract Verification's verificationFinished event, sent each time a receipt gets a final status. */
export interface VerificationEvent {
  id: string
  filePath: string
  contractName: string
  chainId: string
  address: string
  receipts: { verifier: string, status: string, message?: string, lookupUrl?: string }[]
  /** no receipt is waiting any more */
  done: boolean
}

export type ReceiptOutcome = 'verified' | 'pending' | 'failed'

export interface VerificationReceipt {
  verifier: string
  /** the verifier's own wording, e.g. "exactly verified" */
  status: string
  outcome: ReceiptOutcome
  message?: string
  lookupUrl?: string
}

const VERIFIED = ['verified', 'partially verified', 'already verified', 'exactly verified', 'fully verified']
const PENDING = ['pending', 'awaiting implementation verification']

export function receiptOutcome (status: string): ReceiptOutcome {
  if (VERIFIED.includes(status)) return 'verified'
  if (PENDING.includes(status)) return 'pending'
  return 'failed'
}

/** Whether the verification is about the deployment recorded for the file (not an earlier one). */
export function isRecordedDeployment (deploy: StepResult | undefined, event: VerificationEvent): boolean {
  if (deploy?.status !== 'passed' || !deploy.data?.address || !event?.address) return false
  if (deploy.data.address.toLowerCase() !== event.address.toLowerCase()) return false
  return !deploy.data.chainId || String(deploy.data.chainId) === String(event.chainId)
}

/** The verify step for a verification event: submitted while receipts wait, then verified if any verifier verified it. */
export function verificationStep (event: VerificationEvent, at: number): StepResult {
  const receipts: VerificationReceipt[] = (event.receipts || []).map((r) => ({ ...r, outcome: receiptOutcome(r.status) }))
  const status = !event.done ? 'submitted' : receipts.some((r) => r.outcome === 'verified') ? 'passed' : 'failed'
  const note = receipts.map((r) => `${r.verifier}: ${r.status}${r.outcome === 'failed' && r.message ? ` (${r.message})` : ''}`).join(', ')
  return { status, at, origin: 'manual', note: note || undefined, data: { address: event.address, chainId: event.chainId, receipts } }
}
