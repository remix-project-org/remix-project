import * as assert from 'assert'
import { aggregateFindings, blockingFindings, collectFindings, countBySeverity, issueKey, withIssueKeys } from '../src/lib/findings'
import { remixSeverity, slitherSeverity, solhintSeverity, canonicalRule } from '../src/lib/severity'
import { CheckStore, contentHash, isStale, needsRun, deployedFromOlderVersion, PlanContext } from '../src/lib/store'
import { offsetToPosition, parseSlitherAnalysis, relativeImports, relativePath, remixFindings, SlitherReport, slitherFindings, solhintFindings, aiFindings, compilerMessages, withoutDependencies } from '../src/lib/converters'
import { buildReport, reportFileName } from '../src/lib/report'
import { CheckHost, ownFindings, recordManualAnalysis, recordManualFlatten, runPipeline } from '../src/lib/runner'
import { isRecordedDeployment, receiptOutcome, VerificationEvent, verificationStep } from '../src/lib/verification'
import { deriveVerdict, summarize, toolLines, VerdictInput } from '../src/lib/verdict'
import { DEFAULT_TOGGLES, FileCheckState, Finding, RawFinding } from '../src/lib/types'
import { activeFilters, filterOptions, isFiltering, matchesFilter, NO_FILTER } from '../src/lib/ui/filter'

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

  it('handles a clean Slither run without detectors', () => {
    assert.deepStrictEqual(slitherFindings({ success: true, error: null, results: {} }), [])
  })

  it('keeps Slither impact and confidence and strips the service path prefix', () => {
    const [finding] = slitherFindings({
      success: true,
      results: { detectors: [{ check: 'tx-origin', description: 'Dangerous use of tx.origin\n', impact: 'Medium', confidence: 'Medium', elements: [{ type: 'function', name: 'kill', source_mapping: { start: 0, length: 1, filename_relative: 'src/' + FILE, lines: [2, 3], starting_column: 5, ending_column: 9 } }]}]}
    })
    assert.strictEqual(finding.rule, 'tx-origin')
    assert.strictEqual(finding.severity, 'medium')
    assert.strictEqual(finding.nativeSeverity, 'Medium · Medium confidence')
    assert.strictEqual(finding.file, FILE)
    assert.deepStrictEqual(finding.range, { start: { line: 1, column: 4 }, end: { line: 2, column: 8 } })
  })

  it('rewrites non-relative imports to relative paths for the Slither service', () => {
    assert.strictEqual(relativePath('contracts/A.sol', '@openzeppelin/contracts/access/Ownable.sol'), '../@openzeppelin/contracts/access/Ownable.sol')
    assert.strictEqual(relativePath('contracts/A.sol', 'contracts/lib/B.sol'), './lib/B.sol')
    assert.strictEqual(relativePath('A.sol', 'contracts/B.sol'), './contracts/B.sol')
    // a multi-byte character before the imports checks that solc's byte offsets are honoured
    const content = '// ünïcode\nimport "@oz/Ownable.sol";\nimport {B} from \'contracts/B.sol\';\nimport "./C.sol";\ncontract A {}\n'
    const directive = (statement: string, file: string, absolutePath: string) => {
      const start = Buffer.byteLength(content.slice(0, content.indexOf(statement)))
      return { nodeType: 'ImportDirective', file, absolutePath, src: `${start}:${Buffer.byteLength(statement)}:0` }
    }
    const ast = { nodes: [
      directive('import "@oz/Ownable.sol";', '@oz/Ownable.sol', '@oz/Ownable.sol'),
      directive('import {B} from \'contracts/B.sol\';', 'contracts/B.sol', 'contracts/B.sol'),
      directive('import "./C.sol";', './C.sol', 'contracts/C.sol')
    ]}
    const out = relativeImports({ [FILE]: { content }, 'contracts/B.sol': { content: 'contract B {}' } }, { [FILE]: { ast } })
    assert.strictEqual(out[FILE].content, '// ünïcode\nimport "../@oz/Ownable.sol";\nimport {B} from \'./B.sol\';\nimport "./C.sol";\ncontract A {}\n')
    assert.strictEqual(out['contracts/B.sol'].content, 'contract B {}')
  })

  it('turns a Slither log into a failed report with the compiler message', () => {
    assert.deepStrictEqual(parseSlitherAnalysis('{"success":true,"results":{}}'), { success: true, results: {} })
    const log = "'forge clean' running (wd: /tmp/slither-sandbox-Zr1lGp)\n'forge' returned non-zero exit code 1\nError: Compiler run failed:\n" +
      'stderr: Error (6275): Source "@oz/Ownable.sol" not found: File not found. Searched the following locations: "/tmp/slither-sandbox-Zr1lGp".\nstderr:  --> src/contracts/A.sol:3:1:\nTraceback (most recent call last):'
    assert.deepStrictEqual(parseSlitherAnalysis(log), { success: false, error: 'Slither could not compile the contract: Source "@oz/Ownable.sol" not found: File not found.' })
    const version = "'forge' returned non-zero exit code 1\nError: Encountered invalid compiler version in src/contracts/A.sol: No compiler version exists that matches the version requirement: ^0.8.0\nTraceback"
    assert.strictEqual(parseSlitherAnalysis(version).error, 'Slither could not compile the contract: Encountered invalid compiler version in contracts/A.sol: No compiler version exists that matches the version requirement: ^0.8.0')
    assert.strictEqual(parseSlitherAnalysis('Traceback (most recent call last):').error, 'Slither could not compile the contract')
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

  function fakeHost (compileStatus: 'passed' | 'failed', slither: () => Promise<SlitherReport> = async () => ({ success: true, results: { detectors: []} })) {
    const calls: string[] = []
    const store = new CheckStore()
    const host: CheckHost = {
      store,
      runSlither: async (sources, version) => {
        calls.push(`slither:${Object.keys(sources).join(',')}@${version}`)
        return slither()
      },
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
    assert.strictEqual(store.get(FILE).steps.slither.status, 'passed')
    assert.ok(calls.includes(`slither:${FILE}@0.8.26`)) // the compiled sources, not a flattened copy
    assert.strictEqual(store.get(FILE).steps.flatten.contentHash, 'h1')
    assert.ok(!calls.some((c) => c.startsWith('udapp') || c.startsWith('contract-verification')))
  })

  it('stops when compilation fails', async () => {
    const { host, store } = fakeHost('failed')
    const outcome = await runPipeline(host, { file: FILE, toggles: { ...DEFAULT_TOGGLES }, isCancelled: () => false })
    assert.deepStrictEqual(outcome, { kind: 'compile-failed' })
    assert.deepStrictEqual(Object.keys(store.get(FILE).steps), ['compile'])
  })

  it('fails the Slither step when the service is down or the run did not complete', async () => {
    const down = fakeHost('passed', async () => { throw new Error('HTTP 502') })
    await runPipeline(down.host, { file: FILE, toggles: { ...DEFAULT_TOGGLES }, isCancelled: () => false })
    assert.strictEqual(down.store.get(FILE).steps.slither.status, 'failed')
    assert.strictEqual(down.store.get(FILE).steps.slither.note, 'Slither service unavailable: HTTP 502')
    const broken = fakeHost('passed', async () => ({ success: false, error: 'compilation failed' }))
    await runPipeline(broken.host, { file: FILE, toggles: { ...DEFAULT_TOGGLES }, isCancelled: () => false })
    assert.strictEqual(broken.store.get(FILE).steps.slither.note, 'compilation failed')
  })

  it('records an analysis run in the Solidity Analyzers panel', async () => {
    const { host, store } = fakeHost('passed')
    await recordManualAnalysis(host, {
      file: FILE,
      remix: [{ name: 'Transaction origin: ', report: [{ warning: 'Use of tx.origin', location: '0:8:0' }]}],
      solhint: null
    })
    const step = store.get(FILE).steps.analysis
    assert.strictEqual(step.origin, 'manual')
    assert.strictEqual(step.status, 'findings')
    assert.strictEqual(step.contentHash, contentHash('contract A {}'))
    assert.deepStrictEqual(step.findings.map((f) => [f.source, f.severity]), [['remix', 'high']])
    assert.ok(step.findings[0].key)
    assert.strictEqual(step.note, 'Solhint was off')
  })

  it('ignores an analysis of a file it has no compilation for, or with every tool off', async () => {
    const { host, store } = fakeHost('passed')
    await recordManualAnalysis({ ...host, getCompilation: () => undefined }, { file: FILE, remix: [], solhint: []})
    await recordManualAnalysis(host, { file: FILE, remix: null, solhint: null })
    assert.strictEqual(store.get(FILE).steps.analysis, undefined)
  })

  it('records a flattened file written by the Contract Flattener', () => {
    const { host, store } = fakeHost('passed')
    recordManualFlatten(host, FILE, 'contracts/Wallet_flattened.sol')
    const step = store.get(FILE).steps.flatten
    assert.strictEqual(step.status, 'passed')
    assert.strictEqual(step.origin, 'manual')
    assert.strictEqual(step.data.path, 'contracts/Wallet_flattened.sol')
    assert.strictEqual(step.contentHash, contentHash('contract A {}'))
  })
})

describe('verification', () => {
  const ADDRESS = '0xAbC0000000000000000000000000000000000001'
  const deploy = { status: 'passed' as const, at: 1, origin: 'manual' as const, data: { address: ADDRESS, chainId: '11155111' } }
  const event = (receipts: VerificationEvent['receipts'], done: boolean): VerificationEvent =>
    ({ id: 'x', filePath: FILE, contractName: 'Wallet', chainId: '11155111', address: ADDRESS.toLowerCase(), receipts, done })

  it('maps verifier statuses to outcomes', () => {
    assert.strictEqual(receiptOutcome('exactly verified'), 'verified')
    assert.strictEqual(receiptOutcome('already verified'), 'verified')
    assert.strictEqual(receiptOutcome('awaiting implementation verification'), 'pending')
    assert.strictEqual(receiptOutcome('not verified'), 'failed')
    assert.strictEqual(receiptOutcome('lookup failed'), 'failed')
  })

  it('applies only to the deployment recorded for the file', () => {
    const e = event([], true)
    assert.ok(isRecordedDeployment(deploy, e)) // address case does not matter
    assert.ok(!isRecordedDeployment({ ...deploy, data: { ...deploy.data, address: '0x01' } }, e))
    assert.ok(!isRecordedDeployment({ ...deploy, data: { ...deploy.data, chainId: '1' } }, e))
    assert.ok(!isRecordedDeployment(undefined, e))
  })

  it('stays submitted while receipts wait, then is verified when any verifier verified it', () => {
    const waiting = verificationStep(event([{ verifier: 'Sourcify', status: 'exactly verified' }, { verifier: 'Etherscan', status: 'pending' }], false), 2)
    assert.strictEqual(waiting.status, 'submitted')
    assert.deepStrictEqual(waiting.data.receipts.map((r) => r.outcome), ['verified', 'pending'])
    const done = verificationStep(event([{ verifier: 'Sourcify', status: 'exactly verified', lookupUrl: 'https://sourcify' }, { verifier: 'Etherscan', status: 'failed', message: 'Invalid API key' }], true), 3)
    assert.strictEqual(done.status, 'passed')
    assert.strictEqual(done.note, 'Sourcify: exactly verified, Etherscan: failed (Invalid API key)')
    const failed = verificationStep(event([{ verifier: 'Blockscout', status: 'failed' }], true), 4)
    assert.strictEqual(failed.status, 'failed')
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
    const skipped: FileCheckState = { ...checked, steps: { ...checked.steps, slither: done({ status: 'failed', note: 'Slither service unavailable' }) } }
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
    const failed: FileCheckState = { file: FILE, currentHash: 'h1', steps: { compile: done({ status: 'failed', at: 7, data: { errors: [{}, {}]} }) } }
    assert.deepStrictEqual(summarize(input(failed)), { file: FILE, kind: 'compile-failed', count: 2, checkedAt: 7 })
    assert.deepStrictEqual(summarize(input(checked, { runningStep: 'analysis' })), { file: FILE, kind: 'running', count: 0, checkedAt: 1 })
  })

  it('lists tools without a current result', () => {
    const state: FileCheckState = {
      ...checked,
      steps: {
        compile: done(),
        analysis: done({ data: { solhintError: 'Solhint is not active' } }),
        slither: done({ status: 'failed', note: 'Slither service unavailable' }),
        ai: done({ status: 'failed', note: 'timeout' }),
        flatten: done({ contentHash: 'h0' })
      }
    }
    assert.deepStrictEqual(toolLines(input(state, { toggles: { ...DEFAULT_TOGGLES, ai: true } })), [
      { tools: ['solhint'], kind: 'failed', note: 'Solhint is not active' },
      { tools: ['slither'], kind: 'failed', note: 'Slither service unavailable' },
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

  it('contains the checks, open and ignored issues, the deployment and the disclaimer', () => {
    const txOrigin: RawFinding = { source: 'remix', severity: 'high', rule: 'txOrigin', title: 'Transaction origin', message: 'Use of | tx.origin', file: FILE, range: range(4), key: 'k1' }
    const assembly: RawFinding = { source: 'remix', severity: 'medium', rule: 'inlineAssembly', title: 'Inline assembly', message: 'Use of assembly', file: FILE, range: range(9), key: 'k2' }
    const state: FileCheckState = {
      file: FILE,
      currentHash: 'h1',
      ignored: { k2: { reason: 'accepted-risk', at: 0 } },
      steps: {
        compile: { status: 'passed', at: 0, origin: 'manual', contentHash: 'h1' },
        analysis: { status: 'findings', at: 0, origin: 'panel', contentHash: 'h1', findings: [txOrigin, assembly]},
        deploy: { status: 'passed', at: 0, origin: 'manual', contentHash: 'h1', data: { contractName: 'Wallet', address: '0xabc', txHash: '0xdef', network: 'Sepolia', chainId: '11155111', openHigh: 1 } },
        verify: { status: 'submitted', at: 0, origin: 'manual' }
      }
    }
    const md = buildReport(state, { date: new Date(0), contractName: 'Wallet', compiler: { version: '0.8.26', optimize: true, runs: 200 } })
    assert.ok(md.includes('not a security audit'))
    assert.ok(md.includes('| Compile | passed | by hand |'))
    assert.ok(!md.includes('| Deploy |'))
    assert.ok(md.includes('1 open high-severity issue.'))
    assert.ok(md.includes('1 issue ignored'))
    assert.ok(md.includes('Deployed with 1 open high-severity issue.'))
    assert.ok(md.includes('contracts/Wallet.sol:5'))
    assert.ok(md.includes('Use of \\| tx.origin'))
    assert.ok(md.includes('| medium | Remix analyzer | inlineAssembly | contracts/Wallet.sol:10 | Accepted risk | Use of assembly |'))
    assert.ok(md.includes('`0xabc`'))
    assert.ok(md.includes('Sepolia (chain id 11155111)'))
    assert.ok(md.includes('the version checked above'))
    assert.ok(md.includes('**Verification:** submitted'))
    assert.ok(md.includes('optimizer on (200 runs)'))
  })

  it('says when the deployment came from an earlier version', () => {
    const state: FileCheckState = {
      file: FILE,
      currentHash: 'h2',
      steps: { deploy: { status: 'passed', at: 0, origin: 'manual', contentHash: 'h1', data: { contractName: 'Wallet', address: '0xabc' } } }
    }
    const md = buildReport(state, { date: new Date(0) })
    assert.ok(md.includes('an earlier version of the file'))
    assert.ok(!md.includes('Deployed with'))
  })
})

describe('own findings', () => {
  it('keeps the checked file and workspace imports, drops imported packages', async () => {
    const workspace = ['contracts/Lib.sol']
    const host = { call: async (_plugin: string, method: string, path: string) => method === 'exists' && workspace.includes(path) } as unknown as CheckHost
    const at = (file: string): RawFinding => ({ source: 'remix', severity: 'low', title: 'Gas costs', message: '', file })
    const { own, dependencyCount } = await ownFindings(host, FILE, [
      at(FILE), at('contracts/Lib.sol'), at('hardhat/console.sol'), at('hardhat/console.sol'), at('.deps/npm/x/A.sol')
    ])
    assert.deepStrictEqual(own.map((f) => f.file), [FILE, 'contracts/Lib.sol'])
    assert.strictEqual(dependencyCount, 3)
  })
})

describe('AI security check', () => {
  it('lists the reasons and suggestions, or says there are none', () => {
    const [flagged] = aiFindings({ Answer: 'Yes', Reason: ['reentrancy in withdraw', 'no access control'], Suggestion: ['use a guard']}, FILE)
    assert.strictEqual(flagged.message, '• reentrancy in withdraw\n• no access control\n\nSuggestions:\n• use a guard')
    const [bare] = aiFindings({ Answer: 'Yes', Reason: []}, FILE)
    assert.ok(bare.message.startsWith('RemixAI gave no details'))
  })

  it('shows a line when RemixAI found no major vulnerability', () => {
    const state: FileCheckState = { file: FILE, currentHash: 'h1', ignored: {}, steps: {
      compile: { status: 'passed', at: 1, origin: 'panel', contentHash: 'h1' },
      ai: { status: 'passed', at: 2, origin: 'panel', contentHash: 'h1' }
    } } as any
    const lines = toolLines({ state, findings: [], toggles: { ...DEFAULT_TOGGLES, analysis: false, slither: false, ai: true, flatten: false }, runningStep: null })
    assert.deepStrictEqual(lines, [{ tools: ['ai'], kind: 'clear' }])
  })
})

describe('issue filters', () => {
  const issue = (severity: Finding['severity'], sources: Finding['sources'], file: string, title = 't', message = 'm'): Finding =>
    ({ id: title, severity, title, message, file, sources, items: [], stale: false, keys: [title]})
  const list = [
    issue('high', ['slither', 'remix'], FILE, 'Reentrancy in withdraw()'),
    issue('low', ['solhint'], FILE, 'func-visibility'),
    issue('medium', ['slither'], 'contracts/lib/FeeMath.sol', 'divide-before-multiply', 'FeeMath.fee performs a multiplication')
  ]

  it('offers only the severities, tools and files present, with counts', () => {
    const options = filterOptions(list, FILE)
    assert.deepStrictEqual(options.severities, [{ value: 'high', count: 1 }, { value: 'medium', count: 1 }, { value: 'low', count: 1 }])
    assert.deepStrictEqual(options.sources, [{ value: 'slither', count: 2 }, { value: 'remix', count: 1 }, { value: 'solhint', count: 1 }])
    assert.strictEqual(options.files, true)
    assert.strictEqual(filterOptions(list.slice(0, 2), FILE).files, false)
  })

  it('matches on severity, tool, file and search text together', () => {
    const titles = (filter) => list.filter((f) => matchesFilter(f, filter, FILE)).map((f) => f.title)
    assert.strictEqual(titles(NO_FILTER).length, 3)
    assert.deepStrictEqual(titles({ ...NO_FILTER, severities: ['high', 'low']}), ['Reentrancy in withdraw()', 'func-visibility'])
    assert.deepStrictEqual(titles({ ...NO_FILTER, sources: ['slither'], file: 'this' }), ['Reentrancy in withdraw()'])
    assert.deepStrictEqual(titles({ ...NO_FILTER, file: 'imports' }), ['divide-before-multiply'])
    assert.deepStrictEqual(titles({ ...NO_FILTER, query: '  feemath ' }), ['divide-before-multiply'])
    assert.strictEqual(activeFilters({ ...NO_FILTER, severities: ['high'], file: 'imports', query: 'x' }), 2)
    assert.strictEqual(isFiltering({ ...NO_FILTER, query: '   ' }), false)
  })
})
