import * as assert from 'assert'
import { aggregateFindings, blockingFindings, collectFindings, countBySeverity, issueKey, withIssueKeys } from '../src/lib/findings'
import { remixSeverity, slitherSeverity, solhintSeverity, canonicalRule } from '../src/lib/severity'
import { CheckStore, contentHash, isStale, needsRun, deployedFromOlderVersion, PlanContext } from '../src/lib/store'
import { offsetToPosition, remixFindings, slitherFindings, solhintFindings, aiFindings, compilerMessages, withoutDependencies } from '../src/lib/converters'
import { buildReport, reportFileName } from '../src/lib/report'
import { CheckHost, runPipeline } from '../src/lib/runner'
import { deriveVerdict, summarize, toolLines, VerdictInput } from '../src/lib/verdict'
import { DEFAULT_TOGGLES, FileCheckState, RawFinding } from '../src/lib/types'

const FILE = 'contracts/Wallet.sol'
const range = (line: number, endLine = line) => ({ start: { line, column: 0 }, end: { line: endLine, column: 0 } })

describe('severity mapping', () => {
  it('maps Remix analyzer modules', () => {
    assert.strictEqual(remixSeverity('Transaction origin: '), 'high')
    assert.strictEqual(remixSeverity('Check-effects-interaction: '), 'high')
    assert.strictEqual(remixSeverity('Selfdestruct: '), 'high')
    assert.strictEqual(remixSeverity('Inline assembly: '), 'medium')
    assert.strictEqual(remixSeverity('Block hash: '), 'medium')
    assert.strictEqual(remixSeverity('Gas costs: '), 'low')
    assert.strictEqual(remixSeverity('ERC20: '), 'low')
  })

  it('maps Slither impact and Solhint type', () => {
    assert.strictEqual(slitherSeverity('High'), 'high')
    assert.strictEqual(slitherSeverity('Medium'), 'medium')
    assert.strictEqual(slitherSeverity('Low'), 'low')
    assert.strictEqual(slitherSeverity('Informational'), 'info')
    assert.strictEqual(slitherSeverity('Optimization'), 'info')
    assert.strictEqual(solhintSeverity('error'), 'medium')
    assert.strictEqual(solhintSeverity('warning'), 'low')
  })

  it('knows equivalent rules', () => {
    assert.strictEqual(canonicalRule('remix', 'txOrigin'), 'tx-origin')
    assert.strictEqual(canonicalRule('slither', 'tx-origin'), 'tx-origin')
    assert.strictEqual(canonicalRule('solhint', 'avoid-tx-origin'), 'tx-origin')
    assert.strictEqual(canonicalRule('slither', 'reentrancy-eth'), 'reentrancy')
    assert.strictEqual(canonicalRule('slither', 'naming-convention'), undefined)
  })
})

describe('converters', () => {
  it('converts byte offsets with multi-byte characters', () => {
    const content = '// é\nuint x;'
    // "// é\n" is 6 bytes: "é" takes 2
    assert.deepStrictEqual(offsetToPosition(content, 6), { line: 1, column: 0 })
    assert.deepStrictEqual(offsetToPosition(content, 10), { line: 1, column: 4 })
  })

  it('maps Remix analyzer reports with locations', () => {
    const content = 'contract A {\n  function f() public { require(tx.origin == msg.sender); }\n}'
    const start = content.indexOf('tx.origin')
    const findings = remixFindings(
      [{ name: 'Transaction origin: ', report: [{ warning: 'Use of <i>tx.origin</i>', location: `${start}:9:0` }, { warning: 'INTERNAL ERROR', error: 'stack' }]}],
      { [FILE]: { content } },
      { [FILE]: { id: 0 } }
    )
    assert.strictEqual(findings.length, 1)
    assert.strictEqual(findings[0].rule, 'txOrigin')
    assert.strictEqual(findings[0].severity, 'high')
    assert.strictEqual(findings[0].message, 'Use of tx.origin')
    assert.strictEqual(findings[0].file, FILE)
    assert.strictEqual(findings[0].range.start.line, 1)
  })

  it('handles a clean Slither run without data', () => {
    assert.deepStrictEqual(slitherFindings({ status: true, count: 0 }), [])
  })

  it('keeps Slither impact and confidence', () => {
    const [finding] = slitherFindings({
      status: true,
      count: 1,
      data: [{ title: 'tx-origin', description: 'Dangerous use of tx.origin\n', severity: 'Medium', confidence: 'Medium', sourceMap: [{ source_mapping: { start: 0, length: 1, filename_relative: FILE, lines: [2, 3], starting_column: 5, ending_column: 9 } }]}]
    })
    assert.strictEqual(finding.severity, 'medium')
    assert.strictEqual(finding.nativeSeverity, 'Medium · Medium confidence')
    assert.deepStrictEqual(finding.range, { start: { line: 1, column: 4 }, end: { line: 2, column: 8 } })
  })

  it('maps Solhint, AI and compiler output', () => {
    const [hint] = solhintFindings([{ type: 'warning', line: 4, column: 3, message: 'Avoid tx.origin', ruleId: 'avoid-tx-origin' }], FILE)
    assert.deepStrictEqual(hint.range.start, { line: 4, column: 2 })
    assert.strictEqual(aiFindings({ Answer: 'No', Reason: []}, FILE).length, 0)
    assert.strictEqual(aiFindings({ Answer: 'Yes', Reason: ['reentrancy'], Suggestion: ['use a guard']}, FILE)[0].severity, 'high')
    const messages = compilerMessages([
      { severity: 'warning', type: 'Warning', message: 'unused', sourceLocation: { file: FILE, start: 0, end: 4 } },
      { severity: 'error', type: 'TypeError', message: 'bad' }
    ], { [FILE]: { content: 'abcd' } })
    assert.strictEqual(messages.warnings[0].severity, 'low')
    assert.strictEqual(messages.errors[0].title, 'TypeError')
  })

  it('separates dependency findings', () => {
    const findings: RawFinding[] = [
      { source: 'remix', severity: 'high', title: 'a', message: '', file: FILE },
      { source: 'remix', severity: 'high', title: 'b', message: '', file: '.deps/npm/@openzeppelin/contracts/utils/Address.sol' },
      { source: 'slither', severity: 'high', title: 'c', message: '', file: 'node_modules/x/y.sol' }
    ]
    const { own, dependencyCount } = withoutDependencies(findings)
    assert.strictEqual(own.length, 1)
    assert.strictEqual(dependencyCount, 2)
  })
})

describe('aggregated findings', () => {
  const remixTxOrigin: RawFinding = { source: 'remix', severity: 'high', rule: 'txOrigin', title: 'Transaction origin', message: 'remix', file: FILE, range: range(10) }
  const slitherTxOrigin: RawFinding = { source: 'slither', severity: 'medium', rule: 'tx-origin', title: 'tx-origin', message: 'slither', file: FILE, range: range(9, 11), nativeSeverity: 'Medium · Medium confidence' }

  it('merges equivalent findings from different tools, keeping the highest severity', () => {
    const findings = aggregateFindings([{ finding: slitherTxOrigin, stale: false }, { finding: remixTxOrigin, stale: false }])
    assert.strictEqual(findings.length, 1)
    assert.deepStrictEqual(findings[0].sources, ['slither', 'remix'])
    assert.strictEqual(findings[0].severity, 'high')
    assert.strictEqual(findings[0].items.length, 2)
  })

  it('does not merge findings on other lines or files', () => {
    const otherLine = { ...slitherTxOrigin, range: range(20) }
    const otherFile = { ...slitherTxOrigin, file: 'contracts/Other.sol' }
    assert.strictEqual(aggregateFindings([{ finding: remixTxOrigin, stale: false }, { finding: otherLine, stale: false }]).length, 2)
    assert.strictEqual(aggregateFindings([{ finding: remixTxOrigin, stale: false }, { finding: otherFile, stale: false }]).length, 2)
  })

  it('sorts by severity then file then line', () => {
    const low: RawFinding = { source: 'solhint', severity: 'low', title: 'l', message: '', file: FILE, range: range(1) }
    const medium2: RawFinding = { source: 'remix', severity: 'medium', title: 'm2', message: '', file: FILE, range: range(8) }
    const medium1: RawFinding = { source: 'remix', severity: 'medium', title: 'm1', message: '', file: FILE, range: range(3) }
    const titles = aggregateFindings([low, medium2, medium1, remixTxOrigin].map((finding) => ({ finding, stale: false }))).map((f) => f.title)
    assert.deepStrictEqual(titles, ['Transaction origin', 'm1', 'm2', 'l'])
  })

  it('excludes stale findings from the gate', () => {
    const state: FileCheckState = {
      file: FILE,
      currentHash: 'new',
      steps: {
        analysis: { status: 'findings', at: 1, origin: 'panel', contentHash: 'old', findings: [remixTxOrigin]},
        slither: { status: 'findings', at: 1, origin: 'panel', contentHash: 'new', findings: [{ ...slitherTxOrigin, severity: 'high' }]}
      }
    }
    const findings = collectFindings(state)
    assert.strictEqual(findings.length, 2) // stale and fresh findings are never merged together
    assert.strictEqual(blockingFindings(findings).length, 1)
    assert.strictEqual(blockingFindings(findings)[0].sources[0], 'slither')
  })
})

describe('ignored issues', () => {
  const content = 'contract Wallet {\n  function pay() public {\n    require(tx.origin == owner);\n  }\n}'
  const txOrigin: RawFinding = { source: 'remix', severity: 'high', rule: 'txOrigin', title: 'Transaction origin', message: 'Use of tx.origin', file: FILE, range: range(2) }

  it('keys a finding by its rule and code, not its line', () => {
    const moved = '// header\n\n' + content.replace('    require', '      require')
    assert.strictEqual(issueKey(txOrigin, content), issueKey({ ...txOrigin, range: range(4) }, moved))
    const edited = content.replace('tx.origin == owner', 'tx.origin == admin')
    assert.notStrictEqual(issueKey(txOrigin, content), issueKey(txOrigin, edited))
    // equivalent rules from other tools share the key
    assert.strictEqual(issueKey(txOrigin, content), issueKey({ ...txOrigin, source: 'slither', rule: 'tx-origin' }, content))
    // without a location the message stands in for the code
    const ai: RawFinding = { source: 'ai', severity: 'high', title: 'AI', message: 'reentrancy', file: FILE }
    assert.strictEqual(issueKey(ai), issueKey({ ...ai }))
    assert.notStrictEqual(issueKey(ai), issueKey({ ...ai, message: 'overflow' }))
  })

  it('leaves ignored findings out of the gate and the counts, and restores them', () => {
    const store = new CheckStore()
    store.setCurrentHash(FILE, 'h1')
    store.setStep(FILE, 'analysis', { status: 'findings', at: 1, origin: 'panel', contentHash: 'h1', findings: withIssueKeys([txOrigin], { [FILE]: { content } }) })
    const [finding] = collectFindings(store.get(FILE))
    assert.strictEqual(blockingFindings([finding]).length, 1)

    store.ignore(FILE, finding.keys, 'false-positive')
    const [ignored] = collectFindings(store.get(FILE))
    assert.strictEqual(ignored.ignored.reason, 'false-positive')
    assert.strictEqual(blockingFindings([ignored]).length, 0)
    assert.strictEqual(countBySeverity([ignored]).high, 0)

    store.restore(FILE, finding.keys)
    assert.strictEqual(collectFindings(store.get(FILE))[0].ignored, undefined)
  })

  it('keeps an ignore across a run on an edited file while the flagged code stays the same', () => {
    const store = new CheckStore()
    store.setStep(FILE, 'analysis', { status: 'findings', at: 1, origin: 'panel', findings: withIssueKeys([txOrigin], { [FILE]: { content } }) })
    store.ignore(FILE, collectFindings(store.get(FILE))[0].keys, 'accepted-risk')

    const editedElsewhere = content.replace('contract Wallet {', 'contract Wallet {\n  uint public total;')
    store.setStep(FILE, 'analysis', { status: 'findings', at: 2, origin: 'panel', findings: withIssueKeys([{ ...txOrigin, range: range(3) }], { [FILE]: { content: editedElsewhere } }) })
    assert.strictEqual(collectFindings(store.get(FILE))[0].ignored?.reason, 'accepted-risk')

    const editedThere = content.replace('tx.origin == owner', 'tx.origin == msg.sender')
    store.setStep(FILE, 'analysis', { status: 'findings', at: 3, origin: 'panel', findings: withIssueKeys([txOrigin], { [FILE]: { content: editedThere } }) })
    assert.strictEqual(collectFindings(store.get(FILE))[0].ignored, undefined)
  })

  it('ignores a merged finding when any of its tools reported the ignored code', () => {
    const slither: RawFinding = { source: 'slither', severity: 'medium', rule: 'tx-origin', title: 'tx-origin', message: 's', file: FILE, range: range(1, 3) }
    const store = new CheckStore()
    store.setStep(FILE, 'analysis', { status: 'findings', at: 1, origin: 'panel', findings: withIssueKeys([txOrigin], { [FILE]: { content } }) })
    store.ignore(FILE, collectFindings(store.get(FILE))[0].keys, 'false-positive')
    store.setStep(FILE, 'slither', { status: 'findings', at: 1, origin: 'panel', findings: withIssueKeys([slither], { [FILE]: { content } }) })
    const findings = collectFindings(store.get(FILE))
    assert.strictEqual(findings.length, 1)
    assert.strictEqual(findings[0].keys.length, 2)
    assert.ok(findings[0].ignored)
  })
})

describe('store and planning', () => {
  const ctx: PlanContext = { toggles: { ...DEFAULT_TOGGLES }, settingsKey: 'v1' }

  it('hashes content', () => {
    assert.strictEqual(contentHash('a'), contentHash('a'))
    assert.notStrictEqual(contentHash('a'), contentHash('b'))
  })

  it('marks content steps stale, never deploy', () => {
    const store = new CheckStore()
    store.setCurrentHash(FILE, 'h1')
    store.setStep(FILE, 'compile', { status: 'passed', at: 1, origin: 'manual', contentHash: 'h1', settingsKey: 'v1' })
    store.setStep(FILE, 'deploy', { status: 'passed', at: 1, origin: 'panel', contentHash: 'h1', settingsKey: '1|A|[]', data: { address: '0x1' } })
    assert.strictEqual(isStale(store.get(FILE), 'compile'), false)
    store.setCurrentHash(FILE, 'h2')
    assert.strictEqual(isStale(store.get(FILE), 'compile'), true)
    assert.strictEqual(isStale(store.get(FILE), 'deploy'), false)
    assert.strictEqual(deployedFromOlderVersion(store.get(FILE)), true)
    store.setCurrentHash(FILE, 'h1') // reverting the content makes results fresh again (FR-26)
    assert.strictEqual(isStale(store.get(FILE), 'compile'), false)
  })

  it('runs only missing, failed, stale or differently compiled steps', () => {
    const state: FileCheckState = {
      file: FILE,
      currentHash: 'h1',
      steps: {
        compile: { status: 'passed', at: 1, origin: 'manual', contentHash: 'h1', settingsKey: 'v1' },
        analysis: { status: 'findings', at: 1, origin: 'panel', contentHash: 'h0', settingsKey: 'v1' },
        slither: { status: 'skipped', at: 1, origin: 'panel', contentHash: 'h1', settingsKey: 'v1' },
        flatten: { status: 'passed', at: 1, origin: 'panel', contentHash: 'h1', settingsKey: 'v0' },
        deploy: { status: 'passed', at: 1, origin: 'panel', contentHash: 'h1', settingsKey: '1|A|[]', data: { address: '0x1' } },
        verify: { status: 'passed', at: 1, origin: 'panel', data: { address: '0x1' } }
      }
    }
    assert.strictEqual(needsRun(state, 'compile', ctx), false)
    assert.strictEqual(needsRun(state, 'analysis', ctx), true) // stale
    assert.strictEqual(needsRun(state, 'slither', ctx), true) // skipped last time
    assert.strictEqual(needsRun(state, 'ai', ctx), false) // off by default
    assert.strictEqual(needsRun(state, 'flatten', ctx), true) // other compiler settings
    assert.strictEqual(needsRun(state, 'compile', { ...ctx, force: true }), true)
    assert.strictEqual(needsRun(state, 'compile', { ...ctx, toggles: { ...ctx.toggles, compile: false } }), false)
  })
})

describe('runner', () => {
  const compilation = {
    file: FILE,
    source: { sources: { [FILE]: { content: 'contract A {}' } }, target: FILE },
    data: { sources: { [FILE]: { id: 0 } }, contracts: {} },
    input: '{}',
    version: '0.8.26'
  }

  function fakeHost (compileStatus: 'passed' | 'failed') {
    const calls: string[] = []
    const store = new CheckStore()
    const host: CheckHost = {
      store,
      isDesktop: false,
      call: async (plugin, method) => {
        calls.push(`${plugin}.${method}`)
        if (method === 'getCompilerState') return { currentVersion: '0.8.26' }
        if (method === 'lint') return []
        if (method === 'flattenContract') return 'flat'
        return null
      },
      compile: async (file) => { store.setStep(file, 'compile', { status: compileStatus, at: 1, origin: 'panel', contentHash: 'h1', settingsKey: '0.8.26|no-opt|default' }) },
      getCompilation: () => compilation as any,
      syncContent: async (file) => store.setCurrentHash(file, 'h1')
    }
    return { host, calls, store }
  }

  it('runs the checks only and never deploys', async () => {
    const { host, calls, store } = fakeHost('passed')
    const outcome = await runPipeline(host, { file: FILE, toggles: { ...DEFAULT_TOGGLES }, isCancelled: () => false })
    assert.deepStrictEqual(outcome, { kind: 'done' })
    assert.deepStrictEqual(Object.keys(store.get(FILE).steps), ['compile', 'analysis', 'slither', 'flatten'])
    assert.strictEqual(store.get(FILE).steps.slither.status, 'skipped') // no remixd
    assert.strictEqual(store.get(FILE).steps.flatten.contentHash, 'h1')
    assert.ok(!calls.some((c) => c.startsWith('udapp') || c.startsWith('contract-verification')))
  })

  it('stops when compilation fails', async () => {
    const { host, store } = fakeHost('failed')
    const outcome = await runPipeline(host, { file: FILE, toggles: { ...DEFAULT_TOGGLES }, isCancelled: () => false })
    assert.deepStrictEqual(outcome, { kind: 'compile-failed' })
    assert.deepStrictEqual(Object.keys(store.get(FILE).steps), ['compile'])
  })
})

describe('verdict', () => {
  const done = (extra = {}) => ({ status: 'passed' as const, at: 1, origin: 'panel' as const, contentHash: 'h1', ...extra })
  const high: RawFinding = { source: 'remix', severity: 'high', rule: 'txOrigin', title: 'Transaction origin', message: 'm', file: FILE, range: range(3), key: 'k-high' }
  const medium: RawFinding = { source: 'remix', severity: 'medium', rule: 'inlineAssembly', title: 'Inline assembly', message: 'm', file: FILE, range: range(8), key: 'k-medium' }
  const checked: FileCheckState = {
    file: FILE,
    currentHash: 'h1',
    steps: { compile: done(), analysis: done({ status: 'findings', findings: [high, medium]}), slither: done(), flatten: done() }
  }
  const input = (state: FileCheckState, extra: Partial<VerdictInput> = {}): VerdictInput =>
    ({ state, findings: state ? collectFindings(state) : [], toggles: { ...DEFAULT_TOGGLES }, runningStep: null, ...extra })
  const kind = (i: VerdictInput) => deriveVerdict(i).verdict

  it('shows the empty and not-checked states', () => {
    assert.deepStrictEqual(deriveVerdict(input(null)), { verdict: { kind: 'empty' }, actions: []})
    // a compile by hand alone is not a check
    assert.deepStrictEqual(deriveVerdict(input({ file: FILE, currentHash: 'h1', steps: { compile: done() } })), { verdict: { kind: 'not-checked' }, actions: ['run']})
  })

  it('shows a run in progress with Cancel', () => {
    assert.deepStrictEqual(deriveVerdict(input(checked, { runningStep: 'slither' })), { verdict: { kind: 'running', step: 'slither' }, actions: ['cancel']})
  })

  it('shows a failed compile, unless the file changed since', () => {
    const failed: FileCheckState = { file: FILE, currentHash: 'h1', steps: { compile: done({ status: 'failed', data: { errors: [{}, {}]} }) } }
    assert.deepStrictEqual(deriveVerdict(input(failed)), { verdict: { kind: 'compile-failed', errors: 2 }, actions: ['run']})
    assert.strictEqual(kind(input({ ...failed, steps: { ...failed.steps, analysis: done() }, currentHash: 'h2' })).kind, 'out-of-date')
  })

  it('shows out of date when the file changed since the last check', () => {
    assert.deepStrictEqual(deriveVerdict(input({ ...checked, currentHash: 'h2' })), { verdict: { kind: 'out-of-date' }, actions: ['run']})
  })

  it('gates on open high issues and names the tools that did not run', () => {
    const skipped: FileCheckState = { ...checked, steps: { ...checked.steps, slither: done({ status: 'skipped', data: { reason: 'unavailable' } }) } }
    assert.deepStrictEqual(deriveVerdict(input(skipped)), { verdict: { kind: 'gate', high: 1, notRun: ['slither']}, actions: ['rerun', 'deploy-anyway']})
  })

  it('clears once the high issue is ignored, counting tools, medium and ignored issues', () => {
    const ignoredHigh: FileCheckState = { ...checked, ignored: { 'k-high': { reason: 'false-positive', at: 1 } } }
    assert.deepStrictEqual(deriveVerdict(input(ignoredHigh)), {
      verdict: { kind: 'clear', tools: 4, medium: 1, ignored: 1 },
      actions: ['go-to-deploy']
    })
    // Solhint that failed and AI that is switched off are not counted
    const noSolhint: FileCheckState = { ...ignoredHigh, steps: { ...ignoredHigh.steps, analysis: { ...ignoredHigh.steps.analysis, data: { solhintError: 'down' } } } }
    assert.strictEqual((kind(input(noSolhint)) as any).tools, 3)
  })

  it('shows a deployment of the current version', () => {
    const deployed: FileCheckState = { ...checked, steps: { ...checked.steps, deploy: done({ at: 5, data: { address: '0x1', contractName: 'Wallet', network: 'Sepolia' } }) } }
    assert.deepStrictEqual(deriveVerdict(input(deployed)), { verdict: { kind: 'deployed', contractName: 'Wallet', network: 'Sepolia', at: 5 }, actions: []})
    // after an edit the file is out of date again
    assert.strictEqual(kind(input({ ...deployed, currentHash: 'h2' })).kind, 'out-of-date')
  })

  it('summarizes the verdict for Deploy & Run', () => {
    assert.strictEqual(summarize(input(null)), null)
    assert.deepStrictEqual(summarize(input(checked)), { file: FILE, kind: 'gate', count: 1, checkedAt: 1 })
    const failed: FileCheckState = { file: FILE, currentHash: 'h1', steps: { compile: done({ status: 'failed', at: 7, data: { errors: [{}, {}] } }) } }
    assert.deepStrictEqual(summarize(input(failed)), { file: FILE, kind: 'compile-failed', count: 2, checkedAt: 7 })
    assert.deepStrictEqual(summarize(input(checked, { runningStep: 'analysis' })), { file: FILE, kind: 'running', count: 0, checkedAt: 1 })
  })

  it('lists tools without a current result', () => {
    const state: FileCheckState = {
      ...checked,
      steps: {
        compile: done(),
        analysis: done({ data: { solhintError: 'Solhint is not active' } }),
        slither: done({ status: 'skipped', note: 'Connect remixd', data: { reason: 'unavailable' } }),
        ai: done({ status: 'failed', note: 'timeout' }),
        flatten: done({ contentHash: 'h0' })
      }
    }
    assert.deepStrictEqual(toolLines(input(state, { toggles: { ...DEFAULT_TOGGLES, ai: true } })), [
      { tools: ['solhint'], kind: 'failed', note: 'Solhint is not active' },
      { tools: ['slither'], kind: 'skipped', note: 'Connect remixd', reason: 'unavailable' },
      { tools: ['ai'], kind: 'failed', note: 'timeout' }
    ])
    const stale = { ...checked, currentHash: 'h2' }
    assert.deepStrictEqual(toolLines(input(stale)).map((l) => l.kind), ['stale', 'stale', 'stale'])
    const running: FileCheckState = { file: FILE, currentHash: 'h1', steps: { compile: done(), analysis: { ...done(), status: 'running' } } }
    assert.deepStrictEqual(toolLines(input(running, { runningStep: 'analysis' })).map((l) => `${l.tools.join('+')}:${l.kind}`), ['analyzer+solhint:running', 'slither:waiting'])
  })
})

describe('report', () => {
  it('names the report after the contract, next to the source', () => {
    assert.strictEqual(reportFileName(FILE, 'Wallet'), 'contracts/Wallet.predeploy.md')
    assert.strictEqual(reportFileName('Token.sol'), 'Token.predeploy.md')
  })

  it('contains steps, gate, findings and the disclaimer', () => {
    const state: FileCheckState = {
      file: FILE,
      currentHash: 'h1',
      gateOverridden: true,
      steps: {
        compile: { status: 'passed', at: 0, origin: 'manual', contentHash: 'h1' },
        analysis: { status: 'findings', at: 0, origin: 'panel', contentHash: 'h1', findings: [{ source: 'remix', severity: 'high', rule: 'txOrigin', title: 'Transaction origin', message: 'Use of | tx.origin', file: FILE, range: range(4) }]},
        deploy: { status: 'passed', at: 0, origin: 'panel', contentHash: 'h1', data: { contractName: 'Wallet', address: '0xabc', txHash: '0xdef', args: [1]} }
      }
    }
    const md = buildReport(state, { date: new Date(0), contractName: 'Wallet', compiler: { version: '0.8.26', optimize: true, runs: 200 }, environment: { provider: 'vm-prague', network: 'VM', chainId: '1337', account: '0x5B3' } })
    assert.ok(md.includes('not a security audit'))
    assert.ok(md.includes('| Compile | passed | by hand |'))
    assert.ok(md.includes('Overridden: deployed with 1 high-severity finding'))
    assert.ok(md.includes('contracts/Wallet.sol:5'))
    assert.ok(md.includes('Use of \\| tx.origin'))
    assert.ok(md.includes('`0xabc`'))
    assert.ok(md.includes('optimizer on (200 runs)'))
  })
})
