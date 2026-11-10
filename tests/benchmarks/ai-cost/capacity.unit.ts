/**
 * Unit tests for the "what you can do with your credits" maths. Not a
 * Playwright spec (the name keeps it out of the benchmark project):
 *
 *   npx ts-node -T -O '{"module":"commonjs","resolveJsonModule":true,"esModuleInterop":true}' tests/benchmarks/ai-cost/capacity.unit.ts
 */

import tape from 'tape'
import { TaskCostTable, capacityModel, capacitySummary, isStale, pluralTitle, profiledModels, taskCapacity } from '../../../libs/remix-ui/plan-manager/src/lib/ai-task-costs'

const cost = (medianCredits: number, successRate = 1) => ({ medianCredits, p90Credits: medianCredits, runs: 3, successRate, medianDurationMs: 1000 })

const TABLE: TaskCostTable = {
  version: 1,
  measuredAt: '2026-11-01',
  models: { default: { id: 'auto', label: 'Auto' }, fast: { id: 'haiku', label: 'Haiku' }, premium: { id: 'sonnet', label: 'Sonnet' } },
  tasks: [
    { id: 'gas-audit-simple', title: 'gas audit (simple contract)', costs: { default: cost(1000), fast: cost(300), premium: cost(3000) } },
    { id: 'frontend-generation', title: 'frontend generation', costs: { default: cost(6000) } },
    { id: 'flaky', title: 'flaky task', costs: { default: cost(100, 0.5) } },
    { id: 'premium-flaky', title: 'compile error fix', costs: { default: cost(500), premium: cost(900, 0.3) } }
  ]
}

tape('taskCapacity splits the balance into a weighted mix, per tier', (t) => {
  // default: gas 0.2, frontend 0.2, compile fix 0.02 (unnamed) → shares /0.42
  const [gas, frontend, fix] = taskCapacity(20_000, TABLE)
  t.deepEqual([gas.id, frontend.id, fix.id], ['gas-audit-simple', 'frontend-generation', 'premium-flaky'], 'mix order')
  t.deepEqual(gas.counts, { default: 9, fast: 66, premium: 6 }, 'rounded down; gas is all of the fast and premium mix')
  t.deepEqual(frontend.counts, { default: 1 }, 'only tiers that were measured')
  t.deepEqual(fix.counts, { default: 1 })
  t.end()
})

tape('the mix fits the credits together, on every model', (t) => {
  for (const tier of Object.keys(TABLE.models)) {
    const spent = taskCapacity(20_000, TABLE, tier).reduce((sum, row) => sum + (row.counts[tier] ?? 0) * (row.costs[tier] ?? 0), 0)
    t.ok(spent <= 20_000, `${tier}: ${spent} of 20000 credits`)
  }
  t.end()
})

tape('taskCapacity hides tasks and tiers that fail too often', (t) => {
  const ids = taskCapacity(20_000, TABLE).map((row) => row.id)
  t.notOk(ids.includes('flaky'), 'a task under the success threshold is dropped')
  const fix = taskCapacity(20_000, TABLE).find((row) => row.id === 'premium-flaky')
  t.deepEqual(Object.keys(fix?.counts ?? {}), ['default'], 'a flaky tier is dropped, the task stays')
  t.end()
})

tape('taskCapacity with unlimited credits reports costs, not counts', (t) => {
  const [gas] = taskCapacity(null, TABLE)
  t.deepEqual(gas.counts, {})
  t.deepEqual(gas.costs, { default: 1000, fast: 300, premium: 3000 })
  t.end()
})

tape('taskCapacity for another model keeps only the tasks measured on it', (t) => {
  const rows = taskCapacity(20_000, TABLE, 'premium')
  t.deepEqual(rows.map((row) => row.id), ['gas-audit-simple'], 'the premium compile fix fails too often')
  t.equal(rows[0].counts.premium, 6)
  t.end()
})

tape('profiledModels lists models with a usable measurement, default first', (t) => {
  const table: TaskCostTable = {
    ...TABLE,
    models: { premium: { id: 'sonnet', label: 'Sonnet' }, default: { id: 'auto', label: 'Auto', served: [{ model: 'opus', share: 0.8 }] }, unused: { id: 'x', label: 'X' } }
  }
  t.deepEqual(profiledModels(table), [
    { tier: 'default', label: 'Auto', mostlyServed: 'opus' },
    { tier: 'premium', label: 'Sonnet', mostlyServed: null }
  ])
  t.end()
})

tape('an empty or unmeasured table shows nothing', (t) => {
  t.deepEqual(taskCapacity(20_000, { version: 1, measuredAt: null, models: {}, tasks: []}), [])
  t.equal(capacitySummary(20_000, 2, { version: 1, measuredAt: null, models: {}, tasks: []}), null)
  t.ok(isStale({ version: 1, measuredAt: null, models: {}, tasks: []}), 'never measured counts as stale')
  t.end()
})

tape('staleness and wording', (t) => {
  t.notOk(isStale(TABLE, new Date('2026-11-20')))
  t.ok(isStale(TABLE, new Date('2027-02-01')), 'older than 60 days')
  t.equal(pluralTitle('gas audit (simple contract)', 20), 'gas audits (simple contract)')
  t.equal(pluralTitle('compile error fix', 2), 'compile error fixes')
  t.equal(pluralTitle('frontend generation', 1), 'frontend generation')
  t.equal(capacitySummary(20_000, 2, TABLE), '≈ 9 gas audits + 1 frontend generation')
  t.equal(capacitySummary(50, 2, TABLE), null, 'nothing fits → no line')
  t.end()
})

tape('capacitySummary and the shared model pick follow the selected model', (t) => {
  t.equal(capacitySummary(20_000, 2, TABLE, 'fast'), '≈ 66 gas audits', 'only tasks measured on that model')
  const seen: string[] = []
  const unsubscribe = capacityModel.subscribe(() => seen.push(capacityModel.get()))
  capacityModel.set('premium')
  capacityModel.set('premium')
  unsubscribe()
  capacityModel.set('default')
  t.deepEqual(seen, ['premium'], 'listeners fire once per change, not after unsubscribing')
  t.end()
})
