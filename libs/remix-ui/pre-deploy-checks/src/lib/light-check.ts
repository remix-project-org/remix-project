import { AiSecurityAnswer } from './converters'
import { aiIsVulnerable } from './severity'
import { contentHash } from './store'

/**
 * Light security check: a quick AI verdict on a contract right after it's
 * deployed, shown on its card in Deployed Contracts. It runs in the background,
 * never blocks or gates the deployment, and promotes the full security audit.
 */

export type LightCheckStatus =
  | 'running'
  | 'clear' // no major issue reported
  | 'issues' // RemixAI reported possible major issues
  | 'signin' // signed out: show a "sign in for a free check" teaser
  | 'exhausted' // no free allowance and no credits left
  | 'unavailable' // the check can't run for this account (model not open to it)
  | 'error'

export interface LightCheckRecord {
  address: string
  contractName: string
  file: string
  network?: string
  chainId?: string
  status: LightCheckStatus
  reasons: string[]
  suggestions: string[]
  at: number
  contentHash?: string
  /** the verdict was reused: the same code was checked before, or by the panel's AI step */
  reused?: boolean
}

/** udappDeploy's contractDeployed payload, as far as the light check needs it. */
export interface LightCheckDeployment {
  filePath: string
  contractName: string
  address: string
  chainId?: string
  network?: string
}

/** `deployed`: a contract just deployed. `pasted`: a file the user just pasted code into. */
export type LightCheckMode = 'deployed' | 'pasted'

/** The check of a file after code was pasted into it. */
export interface PasteCheckResult {
  file: string
  status: Exclude<LightCheckStatus, 'running' | 'signin'>
  contentHash: string
  /** the verdict, when there is one (status clear or issues) */
  answer?: AiSecurityAnswer
  reused?: boolean
}

/** remixAI.light_security_check's result. */
export type LightCheckOutcome =
  | { status: 'ok', result: AiSecurityAnswer, model?: string }
  | { status: 'signin' | 'exhausted' | 'unavailable' | 'error', code?: string, message?: string }

export interface LightCheckHost {
  /** server-side kill switch (app config) */
  isEnabled: () => Promise<boolean>
  isSignedIn: () => Promise<boolean>
  /** the deployed (last compiled) content of the file */
  getSource: (file: string) => Promise<string | undefined>
  /** the panel's own AI verdict on exactly this content, when it has one */
  panelVerdict: (file: string, hash: string) => AiSecurityAnswer | undefined
  check: (source: string, file: string, contractName: string, mode?: LightCheckMode) => Promise<LightCheckOutcome>
  onChange: (record: LightCheckRecord) => void
  now?: () => number
}

/** Records kept for the session; the oldest go first. */
export const MAX_LIGHT_CHECK_RECORDS = 100

export function lightCheckKey (address: string): string {
  return (address || '').toLowerCase()
}

function strings (items: unknown): string[] {
  if (Array.isArray(items)) return items.filter((item) => typeof item === 'string' && item.trim()).map((item: string) => item.trim())
  return typeof items === 'string' && items.trim() ? [items.trim()] : []
}

export function verdictFields (answer: AiSecurityAnswer): Pick<LightCheckRecord, 'status' | 'reasons' | 'suggestions'> {
  const reasons = strings(answer?.Reason)
  // Answer should be "Yes"/"No", but models sometimes write a sentence ("High-impact issues found"):
  // then listed reasons count as issues unless the answer is an explicit no
  const vulnerable = !!answer && (aiIsVulnerable(answer.Answer) || (reasons.length > 0 && !/^\s*no\b/i.test(answer.Answer || '')))
  if (!vulnerable) return { status: 'clear', reasons: [], suggestions: []}
  return { status: 'issues', reasons, suggestions: strings(answer.Suggestion) }
}

export class LightChecker {
  private records = new Map<string, LightCheckRecord>()
  /** verdicts by content hash and contract: one check per version of the code, shared while in flight */
  private verdicts = new Map<string, Promise<LightCheckOutcome>>()
  /** deployments shown the sign-in teaser, checked once the user signs in */
  private waitingForSignIn = new Map<string, LightCheckDeployment>()

  constructor (private host: LightCheckHost) {}

  get (address: string): LightCheckRecord | undefined {
    return this.records.get(lightCheckKey(address))
  }

  all (): LightCheckRecord[] {
    return Array.from(this.records.values())
  }

  private now (): number {
    return this.host.now ? this.host.now() : Date.now()
  }

  private publish (record: LightCheckRecord): LightCheckRecord {
    const key = lightCheckKey(record.address)
    this.records.delete(key)
    this.records.set(key, record)
    while (this.records.size > MAX_LIGHT_CHECK_RECORDS) this.records.delete(this.records.keys().next().value)
    this.host.onChange(record)
    return record
  }

  /** The check is about the deployed contract, so a file with several contracts gets one verdict per contract. */
  private verdictKey (hash: string, contractName: string): string {
    return `${hash}:${contractName}`
  }

  private verdict (key: string, source: string, file: string, contractName: string, mode: LightCheckMode = 'deployed'): Promise<LightCheckOutcome> {
    let pending = this.verdicts.get(key)
    if (!pending) {
      pending = this.host.check(source, file, contractName, mode).catch((e): LightCheckOutcome => ({ status: 'error', message: e?.message || String(e) }))
      this.verdicts.set(key, pending)
      // only real verdicts are kept: after signing in or topping up, the next deployment checks again
      pending.then((outcome) => { if (outcome.status !== 'ok' && this.verdicts.get(key) === pending) this.verdicts.delete(key) })
    }
    return pending
  }

  /** Checks a fresh deployment in the background. Resolves with the final record, or null when nothing is shown. */
  async onDeployed (deployment: LightCheckDeployment): Promise<LightCheckRecord | null> {
    const { filePath: file, contractName, address, network, chainId } = deployment || {} as LightCheckDeployment
    if (!file || !file.endsWith('.sol') || !address) return null
    if (!(await this.host.isEnabled().catch(() => false))) return null

    const base = { address, contractName, file, network, chainId, reasons: [], suggestions: []}
    const key = lightCheckKey(address)
    this.waitingForSignIn.delete(key)
    if (!(await this.host.isSignedIn().catch(() => false))) {
      this.waitingForSignIn.set(key, deployment)
      return this.publish({ ...base, status: 'signin', at: this.now() })
    }

    const source = await this.host.getSource(file).catch((): undefined => undefined)
    if (!source) return null
    const hash = contentHash(source)

    // the panel checks the whole file: a clean file means a clean contract, but its issues may be another contract's
    const fromPanel = this.host.panelVerdict(file, hash)
    if (fromPanel && verdictFields(fromPanel).status === 'clear') {
      return this.publish({ ...base, ...verdictFields(fromPanel), at: this.now(), contentHash: hash, reused: true })
    }

    const verdictKey = this.verdictKey(hash, contractName)
    const reused = this.verdicts.has(verdictKey)
    const running = this.publish({ ...base, status: 'running', at: this.now(), contentHash: hash })
    const outcome = await this.verdict(verdictKey, source, file, contractName)
    // a later deployment at the same address (a reset Remix VM reuses addresses) owns the card now
    if (this.records.get(key) !== running) return null

    if (outcome.status !== 'ok') {
      if (outcome.status === 'signin') this.waitingForSignIn.set(key, deployment)
      return this.publish({ ...base, status: outcome.status, at: this.now(), contentHash: hash })
    }
    return this.publish({ ...base, ...verdictFields(outcome.result), at: this.now(), contentHash: hash, reused })
  }

  /**
   * Checks a file the user just pasted code into, as a whole (a snippet alone lacks context).
   * Resolves with null when nothing was checked: switched off, signed out, or not Solidity.
   */
  async onPasted (file: string, source: string): Promise<PasteCheckResult | null> {
    if (!file || !file.endsWith('.sol') || !source || !source.trim()) return null
    if (!(await this.host.isEnabled().catch(() => false))) return null
    if (!(await this.host.isSignedIn().catch(() => false))) return null
    const hash = contentHash(source)

    const fromPanel = this.host.panelVerdict(file, hash)
    if (fromPanel) return { file, status: verdictFields(fromPanel).status as 'clear' | 'issues', contentHash: hash, answer: fromPanel, reused: true }

    const key = this.verdictKey(hash, '*pasted')
    const reused = this.verdicts.has(key)
    const outcome = await this.verdict(key, source, file, '', 'pasted')
    if (outcome.status !== 'ok') return { file, status: outcome.status === 'signin' ? 'error' : outcome.status, contentHash: hash }
    return { file, status: verdictFields(outcome.result).status as 'clear' | 'issues', contentHash: hash, answer: outcome.result, reused }
  }

  /** After signing in: checks the deployments that showed the sign-in teaser. */
  async onSignedIn (): Promise<void> {
    const waiting = Array.from(this.waitingForSignIn.values())
    this.waitingForSignIn.clear()
    await Promise.all(waiting.map((deployment) => this.onDeployed(deployment)))
  }
}
