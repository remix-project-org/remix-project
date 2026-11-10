import fs from 'fs'
import path from 'path'
import { expect, type Page } from '@playwright/test'
import { compile, converse, exists, findFiles, ideCall, send, waitForIdle, writeFile } from './harness'

/**
 * The AI tasks priced in the Plan & Credits panel. Each one is driven the way
 * a user triggers it, on a fixed fixture, with a "done" check that only holds
 * when the task actually produced its result — a run that fails still costs
 * credits, and the success rate is reported next to the cost.
 */

const REPO = path.resolve(__dirname, '../../..')
const TEMPLATES = path.join(REPO, 'libs/remix-ws-templates/src/templates')
const FIXTURES = path.join(__dirname, 'fixtures')

const read = (file: string) => fs.readFileSync(file, 'utf8')

export interface Fixture {
  /** Contract name, also used for file and report paths. */
  name: string
  source: string
}

export interface Workflow {
  id: string
  /** What the panel calls it, e.g. "gas audit (simple contract)". */
  title: string
  fixtures: Fixture[]
  /** Per-run time budget; audits and dapp generation are long. */
  timeoutMs: number
  /** Runs the task; resolves true when it produced its result. */
  run(page: Page, fixture: Fixture): Promise<boolean>
}

const template = (dir: string, file: string): Fixture => ({
  name: path.basename(file, '.sol').replace(/^\d+_/, ''),
  source: read(path.join(TEMPLATES, dir, 'contracts', file))
})

const SIMPLE = [template('remixDefault', '1_Storage.sol'), template('remixDefault', '2_Owner.sol'), template('remixDefault', '3_Ballot.sol')]
const COMPLEX = [template('lendingProtocol', 'LendingPool.sol'), template('derivativesProtocol', 'PerpetualMarket.sol'), template('ammDex', 'ConstantProductAMM.sol')]

/** Writes the fixture to contracts/<name>.sol and opens it, so UI actions target it. */
async function place(page: Page, fixture: Fixture): Promise<string> {
  const file = `contracts/${fixture.name}.sol`
  await writeFile(page, file, fixture.source)
  await ideCall(page, 'fileManager', 'open', file)
  return file
}

/** Compiles through the compiler tab, which is what the deploy panel reads from. */
async function compileInUi(page: Page): Promise<void> {
  await page.locator('[data-id="verticalIconsKindsolidity"]').click()
  await page.locator('[data-id="compilerContainerCompileBtn"]').click()
}

function runId(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `run-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

export const WORKFLOWS: Workflow[] = [
  {
    id: 'gas-audit-simple',
    title: 'gas audit (simple contract)',
    fixtures: SIMPLE,
    timeoutMs: 20 * 60_000,
    async run(page, fixture) {
      const file = await place(page, fixture)
      // The gas optimizer asks which file and which areas before it starts.
      return converse(page, '/gas-audit', [
        `Optimize ${file}. Cover all areas and do not ask further questions.`,
        'Yes, go ahead with all of them and write the report.'
      ], async () => (await findFiles(page, 'audit_reports', /gas_audit_report.*\.md$/)).length > 0)
    }
  },
  {
    id: 'security-audit-complex',
    title: 'security audit (complex contract)',
    fixtures: COMPLEX,
    timeoutMs: 30 * 60_000,
    async run(page, fixture) {
      const file = await place(page, fixture)
      // Same files and instruction the checklist modal produces for two
      // checklists; writing them is not an AI step.
      const dir = `audits/${fixture.name}`
      for (const checklist of ['access-control', 'reentrancy']) {
        await writeFile(page, `${dir}/${checklist}.md`, read(path.join(FIXTURES, 'checklists', `${checklist}.md`)))
      }
      await compile(page, file)
      const instruction =
        'Use the Comprehensive_Auditor subagent to audit this contract, passing it these values verbatim:\n'
        + `\nCONTRACT: ${fixture.name}\n`
        + `\nFILE: ${file}\n`
        + `\nCHECKLISTS: ${dir}/ (Access Control, Reentrancy)\n`
        + `\nRUN: ${runId()}`
      await ideCall(page, 'remixaiassistant', 'chatPipe', instruction, false, {
        source: 'checklist-explorer',
        presetId: 'audit-contract',
        displayText: `Auditing \`${fixture.name}\` (${file}) with 2 checklists`
      })
      await waitForIdle(page, { timeoutMs: 28 * 60_000 })
      return (await findFiles(page, `audit_reports/${fixture.name}`, /summary\.md$/)).length > 0
    }
  },
  {
    id: 'frontend-generation',
    title: 'frontend generation',
    fixtures: [SIMPLE[0]],
    timeoutMs: 30 * 60_000,
    async run(page, fixture) {
      await place(page, fixture)
      await compileInUi(page)
      await page.locator('[data-id="verticalIconsKindudapp"]').click()
      await page.locator('[data-id="deployButton"]').click()
      await expect(page.locator('[data-shared="universalDappUiInstance"]').first()).toBeVisible({ timeout: 60_000 })

      const deployed: any[] = await ideCall(page, 'udappDeployedContracts', 'getDeployedContracts')
      const contract = deployed[deployed.length - 1]
      const address = contract?.address ?? contract?.contractAddress
      const provider = await ideCall(page, 'blockchain', 'getProviderObject')
      const environmentId = String(provider?.name ?? 'vm').toLowerCase()
      const workspacesBefore = await workspaceNames(page)

      // The bottom bar's "setup confirmed" prompt, with default options.
      const design = 'Modern dark mode single-page DApp using React and Ethers.js'
      const prompt = `I want to create a DApp frontend. The user confirmed all setup options in the QuickDapp UI. Do not ask the setup question again and do not change the confirmed values.

Confirmed contracts:
- Main: ${fixture.name} at ${address}
- Additional: None

Call generate_dapp now with:
- description: ${JSON.stringify(design)}
- contractName: ${JSON.stringify(fixture.name)}
- contractAddress: ${JSON.stringify(address)}
- chainId: ${JSON.stringify(environmentId)}
- additionalContracts: omit this field
- frontendMode: "workspace"
- isBaseMiniApp: false
- figmaUrl: omit this field
- figmaContextId: omit this field
- subgraphFilePath: omit this field
- setupOptionsConfirmed: true
- setupOptionsSummary: ${JSON.stringify('Location: Workspace, Base mini-app: No, Design: defaults, Subgraph: None')}`
      await ideCall(page, 'remixaiassistant', 'chatPipe', prompt, false, { source: 'bottom-bar', presetId: 'quickdapp-start' })
      await waitForIdle(page, { timeoutMs: 28 * 60_000 })

      const created = (await workspaceNames(page)).filter((name) => name.startsWith('dapp-') && !workspacesBefore.includes(name))
      return created.length > 0
    }
  },
  {
    id: 'contract-generation-agent',
    title: 'contract generation',
    fixtures: [{ name: 'BenchCollection', source: '' }],
    timeoutMs: 15 * 60_000,
    async run(page, fixture) {
      const file = `contracts/${fixture.name}.sol`
      await send(page, `Create an ERC721 NFT contract named ${fixture.name} with symbol BNCH, a max supply of 1000, owner-only minting and burnable tokens, using OpenZeppelin. Write it to ${file}. Do not ask questions.`)
      await waitForIdle(page)
      return (await exists(page, file)) && (await compile(page, file)).length === 0
    }
  },
  {
    id: 'contract-generation-generate',
    title: 'contract generation (/generate)',
    fixtures: [{ name: 'BenchCollection', source: '' }],
    timeoutMs: 10 * 60_000,
    async run(page, fixture) {
      const before = await workspaceNames(page)
      await send(page, `/generate an ERC721 NFT contract named ${fixture.name} with symbol BNCH, max supply 1000, owner-only minting, burnable, using OpenZeppelin`)
      // /generate is one structured call (plus compile-and-fix retries), not a
      // streamed agent turn, so the streaming flag never turns on and
      // waitForIdle would return while it is still working. Wait for its
      // actual result instead: the new workspace it writes the contracts to.
      const deadline = Date.now() + 8 * 60_000
      while (Date.now() < deadline) {
        const created = (await workspaceNames(page)).filter((name) => !before.includes(name))
        if (created.length > 0) {
          // On failure /generate creates the workspace, then deletes it again
          // without waiting — only count one that is still there a bit later.
          await page.waitForTimeout(5000)
          const kept = (await workspaceNames(page)).some((name) => created.includes(name))
          const chat = await page.locator('[data-id="ai-response-chat-bubble-section"]').last().innerText().catch(() => '')
          if (kept && !/Failed to generate secure code|Max attempts reached/.test(chat)) return true
        }
        // Its own give-up messages (contractAgent.writeContracts).
        const chat = await page.locator('[data-id="ai-response-chat-bubble-section"]').last().innerText().catch(() => '')
        if (/Max attempts reached|No payload|Failed to generate secure code|might not be supported/.test(chat)) return false
        await page.waitForTimeout(3000)
      }
      return false
    }
  },
  {
    id: 'explain-contract',
    title: 'contract explanation',
    fixtures: [SIMPLE[2]],
    timeoutMs: 5 * 60_000,
    async run(page, fixture) {
      const file = await place(page, fixture)
      await ideCall(page, 'remixAI', 'chatPipe', 'code_explaining', `File: ${file}\n\n${fixture.source}\n\nExplain briefly the snippet above!`, undefined, `Explain the code of ${file}`, { source: 'bottom-bar', presetId: 'explain-contract' })
      await waitForIdle(page)
      const reply = await page.locator('[data-id="ai-response-chat-bubble-section"]').last().innerText().catch(() => '')
      return reply.trim().length > 50
    }
  },
  {
    id: 'autofill-inputs',
    title: 'deploy-input autofill',
    fixtures: [{ name: 'ParamTest', source: read(path.join(FIXTURES, 'ParamTest.sol')) }],
    timeoutMs: 5 * 60_000,
    async run(page, fixture) {
      await place(page, fixture)
      await compileInUi(page)
      await expect(page.locator('[data-id="compiledContracts"]')).toBeVisible({ timeout: 30_000 })
      await page.locator('[data-id="verticalIconsKindudapp"]').click()
      await page.locator('[data-id="deploy-auto-fill-with-ai"]').click()
      try {
        await expect.poll(
          async () => (await page.locator('[data-id="constructorInput0"]').inputValue()).trim().length,
          { timeout: 180_000, intervals: [2000, 3000, 5000]}
        ).toBeGreaterThan(0)
        return true
      } catch {
        return false
      }
    }
  },
  {
    id: 'fix-compile-error',
    title: 'compile error fix',
    fixtures: [{ name: 'FaultyStorage', source: read(path.join(FIXTURES, 'FaultyStorage.sol')) }],
    timeoutMs: 10 * 60_000,
    async run(page, fixture) {
      const file = await place(page, fixture)
      await compileInUi(page)
      await page.locator('[data-id="ask-remix-ai-button"]').first().click({ timeout: 30_000 })
      await waitForIdle(page)
      // If the agent only explained the error, ask for the fix once.
      if ((await compile(page, file)).length > 0) {
        await send(page, `Fix the error in ${file} now.`)
        await waitForIdle(page)
      }
      return (await compile(page, file)).length === 0
    }
  }
]

async function workspaceNames(page: Page): Promise<string[]> {
  const workspaces: any[] = await ideCall(page, 'filePanel', 'getWorkspaces').catch(() => [])
  return (workspaces || []).map((w: any) => (typeof w === 'string' ? w : w?.name)).filter(Boolean)
}
