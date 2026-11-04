/**
 * Turns benchmark result rows into the cost table the Plan & Credits panel
 * imports (`libs/remix-ui/plan-manager/src/lib/ai-task-costs.data.json`).
 *
 *   npx ts-node -T -O '{"module":"commonjs"}' tests/benchmarks/ai-cost/aggregate.ts \
 *     --tier default=auto --tier fast=haiku-latest --tier premium=sonnet-latest \
 *     [results/2026-11-02.jsonl …]
 *
 * With no files given, every results/*.jsonl is read. A `--tier` maps a
 * BENCH_MODELS entry to the tier the panel shows it as; without any, the
 * first model seen is `default`.
 *
 * Cost per task is the median credits of its *successful* runs; the success
 * rate is reported next to it, and the panel hides tasks that fail too often.
 */

import fs from 'fs'
import path from 'path'

type Tier = 'default' | 'fast' | 'premium'

interface Row {
  workflow: string
  title: string
  model: string
  modelLabel?: string
  success: boolean
  meterError?: string | null
  credits?: number
  durationMs: number
  responseCost?: { servedModels?: Record<string, { calls: number; credits: number }> }
}

/**
 * Which models actually answered, as shares of the credits they used (calls
 * when nothing was costed). Under Auto this is the real mix behind the price.
 */
function servedShares(rows: Row[], top = 5): { model: string; share: number }[] {
  const totals = new Map<string, { calls: number; credits: number }>()
  for (const row of rows) {
    for (const [model, used] of Object.entries(row.responseCost?.servedModels ?? {})) {
      const sum = totals.get(model) ?? { calls: 0, credits: 0 }
      sum.calls += used.calls
      sum.credits += used.credits
      totals.set(model, sum)
    }
  }
  const byCredits = [...totals.values()].some((t) => t.credits > 0)
  const weight = (t: { calls: number; credits: number }) => (byCredits ? t.credits : t.calls)
  const all = [...totals.values()].reduce((sum, t) => sum + weight(t), 0)
  if (all === 0) return []
  return [...totals.entries()]
    .map(([model, t]) => ({ model, share: Number((weight(t) / all).toFixed(2)) }))
    .sort((a, b) => b.share - a.share)
    .slice(0, top)
}

const OUTPUT = path.resolve(__dirname, '../../../libs/remix-ui/plan-manager/src/lib/ai-task-costs.data.json')

function parseArgs(argv: string[]): { files: string[]; tiers: Map<string, Tier> } {
  const files: string[] = []
  const tiers = new Map<string, Tier>()
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tier') {
      const [tier, model] = (argv[++i] || '').split('=')
      if (!['default', 'fast', 'premium'].includes(tier) || !model) throw new Error(`bad --tier "${argv[i]}", expected tier=model`)
      tiers.set(model, tier as Tier)
    } else {
      files.push(argv[i])
    }
  }
  if (files.length === 0) {
    const dir = path.join(__dirname, 'results')
    if (fs.existsSync(dir)) files.push(...fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f)))
  }
  return { files, tiers }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, index)]
}

function main(): void {
  const { files, tiers } = parseArgs(process.argv.slice(2))
  if (files.length === 0) throw new Error('no result files found')

  // Rows without a measurement cannot price anything.
  const rows: Row[] = files
    .flatMap((file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)))
    .filter((row: Row) => !row.meterError && typeof row.credits === 'number')

  if (tiers.size === 0 && rows.length > 0) tiers.set(rows[0].model, 'default')

  const tasks = new Map<string, { id: string; title: string; costs: Partial<Record<Tier, unknown>> }>()
  const models: Partial<Record<Tier, { id: string; label: string; served: { model: string; share: number }[] }>> = {}

  for (const [model, tier] of tiers) {
    const forModel = rows.filter((row) => row.model === model)
    if (forModel.length === 0) continue
    models[tier] = { id: model, label: forModel.find((r) => r.modelLabel)?.modelLabel ?? model, served: servedShares(forModel) }

    for (const workflow of [...new Set(forModel.map((row) => row.workflow))]) {
      const runs = forModel.filter((row) => row.workflow === workflow)
      const succeeded = runs.filter((row) => row.success)
      const credits = succeeded.map((row) => row.credits as number).sort((a, b) => a - b)
      const task = tasks.get(workflow) ?? { id: workflow, title: runs[0].title, costs: {} }
      task.costs[tier] = {
        medianCredits: Math.round(percentile(credits, 50)),
        p90Credits: Math.round(percentile(credits, 90)),
        runs: runs.length,
        successRate: Number((succeeded.length / runs.length).toFixed(2)),
        medianDurationMs: Math.round(percentile(runs.map((row) => row.durationMs).sort((a, b) => a - b), 50)),
        servedModels: servedShares(runs, 3)
      }
      tasks.set(workflow, task)
    }
  }

  const output = { version: 1, measuredAt: new Date().toISOString().slice(0, 10), models, tasks: [...tasks.values()]}
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n')
  console.log(`wrote ${tasks.size} task(s) from ${rows.length} measured run(s) to ${path.relative(process.cwd(), OUTPUT)}`)
  for (const task of tasks.values()) {
    const summary = Object.entries(task.costs).map(([tier, c]: [string, any]) => `${tier}: ${c.medianCredits} cr (${Math.round(c.successRate * 100)}% ok, n=${c.runs})`).join(' · ')
    console.log(`  ${task.id.padEnd(30)} ${summary}`)
  }
  for (const [tier, info] of Object.entries(models)) {
    const mix = info.served.map((s) => `${s.model} ${Math.round(s.share * 100)}%`).join(', ')
    if (mix) console.log(`  served on ${tier} (${info.label}): ${mix}`)
  }
}

main()
