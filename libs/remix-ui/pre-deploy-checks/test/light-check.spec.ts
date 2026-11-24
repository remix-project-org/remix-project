import * as assert from 'assert'
import { LightChecker, LightCheckHost, LightCheckOutcome, LightCheckRecord, verdictFields, scanAllowance, deployCheckFindings } from '../src/lib/light-check'
import { StepResult } from '../src/lib/types'
import { contentHash } from '../src/lib/store'

const FILE = 'contracts/Vault.sol'
const SOURCE = 'contract Vault { function withdraw() public {} }'
const deployment = (address = '0xAbC0000000000000000000000000000000000001', contractName = 'Vault', filePath = FILE) => ({ filePath, contractName, address, chainId: '1', network: 'VM' })

const clean: LightCheckOutcome = { status: 'ok', result: { Answer: 'No', Reason: [], Suggestion: []} }
const vulnerable: LightCheckOutcome = { status: 'ok', result: { Answer: 'Yes', Reason: ['withdraw has no access control'], Suggestion: ['Add onlyOwner']} }

function deferred<T> () {
  let resolve: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function setup (overrides: Partial<LightCheckHost> = {}) {
  const calls: string[] = []
  const changes: LightCheckRecord[] = []
  let signedIn = true
  const host: LightCheckHost = {
    isEnabled: async () => true,
    isSignedIn: async () => signedIn,
    getSource: async () => SOURCE,
    panelVerdict: () => undefined,
    check: async (source) => { calls.push(source); return clean },
    onChange: (record) => changes.push(record),
    ...overrides
  }
  const checker = new LightChecker(host)
  return { checker, calls, changes, signIn: () => { signedIn = true }, signOut: () => { signedIn = false } }
}

describe('light security check', () => {
  it('reports a clean verdict after showing the check as running', async () => {
    const { checker, calls, changes } = setup()
    const record = await checker.onDeployed(deployment())
    assert.strictEqual(record.status, 'clear')
    assert.deepStrictEqual(changes.map((r) => r.status), ['running', 'clear'])
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(checker.get('0xabc0000000000000000000000000000000000001').status, 'clear', 'looked up by any address casing')
  })

  it('maps a vulnerable answer to issues with its reasons and suggestions', () => {
    assert.deepStrictEqual(verdictFields(vulnerable.status === 'ok' && vulnerable.result), {
      status: 'issues', reasons: ['withdraw has no access control'], suggestions: ['Add onlyOwner']
    })
    assert.strictEqual(verdictFields({ Answer: 'No, nothing major', Reason: ['x']}).status, 'clear')
  })

  it('treats a free-form answer with listed reasons as issues', () => {
    assert.strictEqual(verdictFields({ Answer: 'High-impact issues found', Reason: ['withdraw is reentrant']}).status, 'issues')
    assert.strictEqual(verdictFields({ Answer: 'Looks fine', Reason: []}).status, 'clear')
  })

  it('checks each version of the code once, also for parallel deployments', async () => {
    const { checker, calls } = setup()
    const [a, b] = await Promise.all([
      checker.onDeployed(deployment('0x01')),
      checker.onDeployed(deployment('0x02'))
    ])
    const c = await checker.onDeployed(deployment('0x03'))
    assert.strictEqual(calls.length, 1)
    assert.deepStrictEqual([a.status, b.status, c.status], ['clear', 'clear', 'clear'])
    assert.strictEqual(c.reused, true)
  })

  it('checks again when the code changed', async () => {
    let source = SOURCE
    const { checker, calls } = setup({ getSource: async () => source })
    await checker.onDeployed(deployment('0x01'))
    source = SOURCE + ' // changed'
    await checker.onDeployed(deployment('0x02'))
    assert.strictEqual(calls.length, 2)
  })

  it('shows the sign-in teaser without calling RemixAI, and checks once signed in', async () => {
    const { checker, calls, signOut, signIn } = setup()
    signOut()
    const teaser = await checker.onDeployed(deployment())
    assert.strictEqual(teaser.status, 'signin')
    assert.strictEqual(calls.length, 0)
    signIn()
    await checker.onSignedIn()
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(checker.get(deployment().address).status, 'clear')
    await checker.onSignedIn()
    assert.strictEqual(calls.length, 1, 'a deployment is retried only once after signing in')
  })

  it('does not keep failed outcomes, so a later deployment checks again', async () => {
    const outcomes: LightCheckOutcome[] = [{ status: 'exhausted', code: 'INSUFFICIENT_CREDITS' }, clean]
    const { checker, calls } = setup({ check: async (source) => { calls.push(source); return outcomes.shift() } })
    assert.strictEqual((await checker.onDeployed(deployment('0x01'))).status, 'exhausted')
    assert.strictEqual((await checker.onDeployed(deployment('0x02'))).status, 'clear')
    assert.strictEqual(calls.length, 2)
  })

  it('turns a thrown check into an error record', async () => {
    const { checker } = setup({ check: async () => { throw new Error('network down') } })
    assert.strictEqual((await checker.onDeployed(deployment())).status, 'error')
  })

  it('lets a newer deployment at the same address own the card', async () => {
    const first = deferred<LightCheckOutcome>()
    let source = SOURCE
    const { checker } = setup({
      getSource: async () => source,
      check: (src) => src === SOURCE ? first.promise : Promise.resolve(clean)
    })
    const pendingFirst = checker.onDeployed(deployment('0x01', 'Vault'))
    await new Promise((r) => setTimeout(r, 0))
    source = 'contract Token {}'
    const second = await checker.onDeployed(deployment('0x01', 'Token'))
    first.resolve(vulnerable)
    assert.strictEqual(await pendingFirst, null)
    assert.strictEqual(second.contractName, 'Token')
    assert.strictEqual(checker.get('0x01').contractName, 'Token')
    assert.strictEqual(checker.get('0x01').status, 'clear')
  })

  it("reuses the panel's clean verdict on the same content instead of calling RemixAI", async () => {
    const hash = contentHash(SOURCE)
    const { checker, calls, changes } = setup({
      panelVerdict: (file, h) => file === FILE && h === hash ? { Answer: 'No', Reason: [], Suggestion: []} : undefined
    })
    const record = await checker.onDeployed(deployment())
    assert.strictEqual(calls.length, 0)
    assert.strictEqual(record.status, 'clear')
    assert.strictEqual(record.reused, true)
    assert.deepStrictEqual(changes.map((r) => r.status), ['clear'])
  })

  it("checks the contract itself when the panel's file-wide verdict has issues", async () => {
    const { checker, calls } = setup({ panelVerdict: () => ({ Answer: 'Yes', Reason: ['Other.drain is public'], Suggestion: []}) })
    const record = await checker.onDeployed(deployment())
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(record.status, 'clear')
  })

  it('checks each contract of a file separately', async () => {
    const asked: string[] = []
    const { checker } = setup({ check: async (_source, _file, contractName) => { asked.push(contractName); return contractName === 'Vault' ? vulnerable : clean } })
    const [vault, token] = await Promise.all([
      checker.onDeployed(deployment('0x01', 'Vault')),
      checker.onDeployed(deployment('0x02', 'Token'))
    ])
    assert.deepStrictEqual(asked.sort(), ['Token', 'Vault'])
    assert.strictEqual(vault.status, 'issues')
    assert.strictEqual(token.status, 'clear')
  })

  describe('after a paste', () => {
    it('checks the whole file with the paste prompt, without a contract name', async () => {
      const asked: any[] = []
      const { checker } = setup({ check: async (source, file, contractName, mode) => { asked.push({ source, file, contractName, mode }); return vulnerable } })
      const result = await checker.onPasted(FILE, SOURCE)
      assert.deepStrictEqual(asked, [{ source: SOURCE, file: FILE, contractName: '', mode: 'pasted' }])
      assert.strictEqual(result.status, 'issues')
      assert.strictEqual(result.contentHash, contentHash(SOURCE))
      assert.deepStrictEqual(result.answer.Reason, ['withdraw has no access control'])
      assert.strictEqual(checker.all().length, 0, 'no card for Deployed Contracts')
    })

    it('checks the same pasted content once', async () => {
      const { checker, calls } = setup()
      await checker.onPasted(FILE, SOURCE)
      const again = await checker.onPasted(FILE, SOURCE)
      assert.strictEqual(calls.length, 1)
      assert.strictEqual(again.reused, true)
    })

    it('keeps paste and deploy verdicts apart: they use different prompts', async () => {
      const { checker, calls } = setup()
      await checker.onPasted(FILE, SOURCE)
      await checker.onDeployed(deployment())
      assert.strictEqual(calls.length, 2)
    })

    it('reuses a fresh verdict for the file instead of calling RemixAI', async () => {
      const { checker, calls } = setup({ panelVerdict: () => ({ Answer: 'No', Reason: [], Suggestion: []}) })
      const result = await checker.onPasted(FILE, SOURCE)
      assert.strictEqual(calls.length, 0)
      assert.strictEqual(result.status, 'clear')
      assert.strictEqual(result.reused, true)
    })

    it('does nothing when signed out, switched off, or for other files', async () => {
      const signedOut = setup()
      signedOut.signOut()
      assert.strictEqual(await signedOut.checker.onPasted(FILE, SOURCE), null)
      assert.strictEqual(signedOut.calls.length, 0)
      assert.strictEqual(await setup({ isEnabled: async () => false }).checker.onPasted(FILE, SOURCE), null)
      assert.strictEqual(await setup().checker.onPasted('scripts/deploy.ts', SOURCE), null)
      assert.strictEqual(await setup().checker.onPasted(FILE, '   '), null)
    })

    it('runs a scan the user asked for even with automatic checks switched off', async () => {
      const { checker, calls } = setup({ isEnabled: async () => false })
      assert.strictEqual(await checker.onPasted(FILE, SOURCE), null)
      assert.strictEqual((await checker.onPasted(FILE, SOURCE, { force: true })).status, 'clear')
      assert.strictEqual(calls.length, 1)
    })

    it('reports a failed check without a verdict, and checks again next time', async () => {
      const outcomes: LightCheckOutcome[] = [{ status: 'exhausted' }, clean]
      const { checker, calls } = setup({ check: async (source) => { calls.push(source); return outcomes.shift() } })
      const first = await checker.onPasted(FILE, SOURCE)
      assert.strictEqual(first.status, 'exhausted')
      assert.strictEqual(first.answer, undefined)
      assert.strictEqual((await checker.onPasted(FILE, SOURCE)).status, 'clear')
      assert.strictEqual(calls.length, 2)
    })
  })

  it('does nothing when switched off, for non-Solidity files, or without source', async () => {
    assert.strictEqual(await setup({ isEnabled: async () => false }).checker.onDeployed(deployment()), null)
    assert.strictEqual(await setup().checker.onDeployed(deployment('0x01', 'V', 'contracts/V.vy')), null)
    const noSource = setup({ getSource: async () => undefined })
    assert.strictEqual(await noSource.checker.onDeployed(deployment()), null)
    assert.strictEqual(noSource.calls.length, 0)
  })
})

describe('scanAllowance', () => {
  const quota = (over: any) => ({ provider: '*', model: '*', operation: '*', remaining: 0, periodResetAt: '2030-01-02T00:00:00Z', ...over })

  it('uses the free security_check allowance first, then an allowance for every call, then credits', () => {
    assert.deepStrictEqual(scanAllowance({ balance: 0, quotas: [quota({ operation: 'security_check', remaining: 3 })]}), { canScan: true, freeScansLeft: true, resetAt: undefined })
    assert.strictEqual(scanAllowance({ balance: 0, quotas: [quota({ remaining: 100 })]}).canScan, true)
    assert.strictEqual(scanAllowance({ balance: 5, quotas: []}).canScan, true)
  })

  it('reports when the free scans come back once nothing is left', () => {
    const credits = { balance: 0, quotas: [
      quota({ operation: 'security_check', remaining: 0, periodResetAt: '2030-01-02T00:00:00Z' }),
      // a model-specific allowance doesn't pay for a scan
      quota({ provider: 'mistralai', model: 'mistral-small-latest', remaining: 5000 })
    ]}
    assert.deepStrictEqual(scanAllowance(credits), { canScan: false, freeScansLeft: false, resetAt: '2030-01-02T00:00:00Z' })
  })

  it('assumes a scan can run when the balance is unknown', () => {
    assert.strictEqual(scanAllowance(null).canScan, true)
  })
})

describe('deployCheckFindings', () => {
  const record = (contractName: string, over: Partial<LightCheckRecord> = {}): LightCheckRecord => ({
    address: '0x1', contractName, file: FILE, status: 'issues', reasons: [`${contractName}.withdraw is reentrant`], suggestions: ['Update state first'], at: 1, contentHash: 'h1', ...over
  })
  const aiStep = (over: Partial<StepResult>): StepResult => ({ status: 'findings', at: 1, origin: 'auto', contentHash: 'h1', findings: [], ...over })

  it('adds a finding per contract with issues, and nothing for a clean contract', () => {
    const vault = deployCheckFindings(undefined, record('Vault'))
    assert.strictEqual(vault.length, 1)
    assert.strictEqual(vault[0].title, 'RemixAI flagged a possible major vulnerability in Vault')
    assert.ok(vault[0].message.includes('Vault.withdraw is reentrant'))
    assert.strictEqual(deployCheckFindings(undefined, record('Vault', { status: 'clear', reasons: []})), null)
  })

  it('keeps the findings of the file\'s other contracts, replacing only its own', () => {
    const first = deployCheckFindings(undefined, record('Vault'))
    const both = deployCheckFindings(aiStep({ findings: first }), record('Token'))
    assert.deepStrictEqual(both.map((f) => f.rule), ['Light check: Vault', 'Light check: Token'])
    const again = deployCheckFindings(aiStep({ findings: both }), record('Vault', { reasons: ['new reason']}))
    assert.deepStrictEqual(again.map((f) => f.rule), ['Light check: Token', 'Light check: Vault'])
    // a previous version of the file doesn't carry over
    assert.strictEqual(deployCheckFindings(aiStep({ findings: both, contentHash: 'h0' }), record('Vault')).length, 1)
  })

  it('leaves a whole-file verdict alone: an AI run in the panel or a scan after a paste', () => {
    assert.strictEqual(deployCheckFindings(aiStep({ origin: 'panel' }), record('Vault')), null)
    assert.strictEqual(deployCheckFindings(aiStep({ data: { answer: { Answer: 'No' } } }), record('Vault')), null)
    assert.strictEqual(deployCheckFindings(aiStep({ status: 'running', origin: 'panel', contentHash: 'h0' }), record('Vault')), null)
  })
})
