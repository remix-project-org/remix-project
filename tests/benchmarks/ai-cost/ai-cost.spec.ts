import fs from 'fs'
import path from 'path'
import { test } from '../../helpers/e2e-pool'
import { selectModel, signIn } from './harness'
import { ResponseCostMeter, settle, snapshot } from './meter'
import { WORKFLOWS } from './workflows'

/**
 * AI task cost benchmark. Generates one test per workflow × fixture × model ×
 * run and appends a result row to results/<date>.jsonl; `aggregate.ts` turns
 * those rows into the cost table the Plan & Credits panel reads.
 *
 *   E2E_POOL_API_KEY=… BENCH_MODELS=auto,haiku-latest,sonnet-latest BENCH_RUNS=3 \
 *     npx playwright test --project=benchmarks --workers=2
 *
 * BENCH_MODELS   comma list; `auto` = Auto LLM Mode, anything else is a model-picker search (default: auto)
 * BENCH_RUNS     repetitions per combination (default: 3)
 * BENCH_ONLY     comma list of workflow ids to run (default: all)
 * BENCH_GROUP    E2E pool feature group (default: e2e-unlimited-quota)
 */

const MODELS = (process.env.BENCH_MODELS || 'auto').split(',').map((m) => m.trim()).filter(Boolean)
const RUNS = Number(process.env.BENCH_RUNS || 3)
const ONLY = (process.env.BENCH_ONLY || '').split(',').map((w) => w.trim()).filter(Boolean)
const GROUP = process.env.BENCH_GROUP || 'e2e-unlimited-quota'

const RESULTS_DIR = path.join(__dirname, 'results')
const RESULTS_FILE = path.join(RESULTS_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`)

function record(row: Record<string, unknown>): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  fs.appendFileSync(RESULTS_FILE, JSON.stringify(row) + '\n')
}

test.use({ viewport: { width: 1440, height: 900 } })

for (const workflow of WORKFLOWS.filter((w) => ONLY.length === 0 || ONLY.includes(w.id))) {
  for (const fixture of workflow.fixtures) {
    for (const model of MODELS) {
      for (let run = 1; run <= RUNS; run++) {
        test(`${workflow.id} · ${fixture.name} · ${model} · run ${run}`, async ({ page }) => {
          test.setTimeout(workflow.timeoutMs + 10 * 60_000)

          await signIn(page, GROUP)
          const modelLabel = await selectModel(page, model)

          // Two independent cost sources: the backend usage report (what was
          // billed) and the charge OpenRouter reports on each response (what
          // the call cost upstream). The report wins when it works; the
          // responses keep the benchmark running when it does not.
          let reportError: string | null = null
          const before = await snapshot(page).catch((error: any) => {
            reportError = String(error?.message ?? error)
            return null
          })
          const responses = new ResponseCostMeter(page)
          const startedAt = Date.now()

          let success = false
          let failureReason: string | null = null
          try {
            success = await workflow.run(page, fixture)
            if (!success) failureReason = 'done check did not hold'
          } catch (error: any) {
            failureReason = String(error?.message ?? error).split('\n')[0]
          }
          const durationMs = Date.now() - startedAt

          // A failed run still spent credits, so it is measured all the same.
          const responseCost = await responses.read()
          let usageReport = null
          if (before) {
            try {
              usageReport = await settle(page, before)
            } catch (error: any) {
              reportError = String(error?.message ?? error)
            }
          }

          const fromReport = usageReport !== null && usageReport.calls > 0
          const credits = fromReport ? usageReport.credits : responseCost.calls > 0 ? responseCost.credits : null
          const meterError = credits === null
            ? `no cost source: ${reportError ?? 'usage report recorded nothing'}; no costed AI responses seen`
            : null

          record({
            workflow: workflow.id,
            title: workflow.title,
            fixture: fixture.name,
            model,
            modelLabel,
            group: GROUP,
            run,
            success,
            failureReason,
            durationMs,
            credits,
            creditsSource: credits === null ? null : fromReport ? 'usage-report' : 'response-cost',
            meterError,
            reportError,
            // The model that did most of the work; under Auto, not the selection.
            servedModel: Object.entries(responseCost.servedModels).sort((x, y) => y[1].credits - x[1].credits || y[1].calls - x[1].calls)[0]?.[0] ?? null,
            usageReport,
            responseCost,
            at: new Date().toISOString()
          })

          if (meterError) throw new Error(`could not measure usage: ${meterError}`)
        })
      }
    }
  }
}
