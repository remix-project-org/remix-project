# Step 0 Findings — Formal Check Plugin

> Exploration performed 2026-11-09. All claims cite the actual source file; "UNVERIFIED" means
> I could not confirm from source alone and runtime testing is needed.

---

## Q1 — Native plugin definition, registration, activation

### Base class

```ts
import { ViewPlugin } from '@remixproject/engine-web'
// (non-UI service plugins use Plugin from '@remixproject/engine')
```

`ViewPlugin` lives in `node_modules/@remixproject/engine-web`. Its `activate()` method calls
`this.call(this.profile.location, 'addView', this.profile, this.render())`, so a `render()`
method returning a React element is mandatory for sidebar/panel plugins.

### Profile shape (real example: `apps/remix-ide/src/app/tabs/debugger-tab.tsx:11-42`)

```ts
const profile = {
  name: 'debugger',
  displayName: 'Debugger',
  methods: ['debug', 'getTrace'],
  events: ['debuggingStarted'],
  icon: 'assets/img/debuggerLogo.webp',
  description: 'Debug transactions',
  kind: 'debugging',
  location: 'sidePanel',      // ← left sidebar; 'mainPanel' for centre; 'none' for services
  documentation: 'https://…',
  version: packageJson.version,
  maintainedBy: 'Remix',
}
```

`location: 'sidePanel'` is the magic that places the plugin in the left-panel icon rail.

### Registration in `apps/remix-ide/src/app.ts`

1. Import & instantiate the plugin class (around line 54 / 406).
2. `this.engine.register([..., myPlugin])` (line ~700–740 for sidePanel UI plugins).
3. `await this.appManager.activatePlugin(['myPluginName'])` (line ~979 for the sidePanel batch).

### render() / updateComponent() / PluginViewWrapper pattern

Canonical pattern from `apps/remix-ide/src/app/tabs/analysis-tab.js:81-100`:

```ts
// Class (in apps/remix-ide/src/app/tabs/ or apps/remix-ide/src/app/plugins/)
export class FormalCheckPlugin extends ViewPlugin {
  dispatch: React.Dispatch<any> = () => {}

  render() {
    return <div id="formalCheckView"><PluginViewWrapper plugin={this} /></div>
  }

  setDispatch(dispatch: React.Dispatch<any>) {
    this.dispatch = dispatch
    this.renderComponent()
  }

  renderComponent() {
    this.dispatch({ plugin: this })
  }

  updateComponent(state: any) {
    return <RemixUiFormalCheck plugin={state.plugin} />
  }
}
```

`PluginViewWrapper` (`libs/remix-ui/helper/src/lib/components/PluginViewWrapper.tsx`) calls
`plugin.setDispatch(setState)` on mount and re-renders via `plugin.updateComponent(state)`.

The React component lives in `libs/remix-ui/<name>/src/lib/`.

**Verified template plugins:**
- `apps/remix-ide/src/app/plugins/compile-details.tsx` (compact, 60 lines, mainPanel)
- `libs/remix-ui/plan-manager/src/lib/plan-manager-plugin.tsx` (sidePanel, full pattern)
- `apps/remix-ide/src/app/tabs/debugger-tab.tsx` (sidePanel with icon)

---

## Q2 — Plugin APIs: fileManager, editor, compiler

All calls use `this.call('pluginName', 'methodName', ...args)`.

### fileManager (`apps/remix-ide/src/app/files/fileManager.ts`)

```ts
await this.call('fileManager', 'getCurrentFile')       // → current file path (string)
await this.call('fileManager', 'readFile', path)       // → file contents (string)
await this.call('fileManager', 'exists', path)         // → boolean
await this.call('fileManager', 'readdir', path)        // → {name: {isDirectory: bool}}
// 'writeFile' exists but we must NEVER call it on the user's file
```

### editor (`apps/remix-ide/src/app/editor/editor.js`)

```ts
// Annotation shape: { row: number, column: number, text: string, type: 'error'|'warning'|'info' }
await this.call('editor', 'addAnnotation', annotation)
await this.call('editor', 'clearAnnotations')

// HighlightPosition: { start: {line, column}, end: {line, column} }
await this.call('editor', 'highlight', position, filePath, '#ff0000', { focus: false })
await this.call('editor', 'discardHighlight')

await this.call('editor', 'gotoLine', lineNumber, columnNumber)
await this.call('editor', 'addErrorMarker', [{ from, message, severity, type }])
await this.call('editor', 'clearErrorMarkers', [filePath])
```

Decorations are scoped per requesting plugin (editor reads `this.currentRequest.from`).

### compiler events

```ts
this.on('solidity', 'compilationFinished',
  (fileName, source, languageVersion, data: CompilationResult) => { … })
// data.errors[] contains diagnostics; SMTChecker warnings appear here (UNVERIFIED at runtime)
```

Type declarations: `libs/remix-ui/editor/src/lib/remix-plugin-types.ts:405-421`.

---

## Q3 — solc loading and SMTChecker / Z3

### How solc is loaded

- `libs/remix-solidity/src/lib/es-web-worker/compiler-worker.ts` — the Worker.
- `Compiler.loadVersion(url)` sends `{cmd:'loadVersion', data:url}` → worker calls
  `self.importScripts(url)` then `setupMethods(self)` via `solc/wrapper`.
- URLs come from `binaries.soliditylang.org/wasm/` (CDN, user-selected version).
  `compiler-utils.ts:4-5`.
- Special case: `'builtin'` loads `assets/js/soljson.js` from app domain.

### Is Z3 present? **NO.**

**Zero matches** for `modelChecker`, `smtchecker`, `z3`, `cvc4`, `soljson-with-z3` in any
TypeScript, JSON, or Markdown source file (outside `node_modules`).

The standard `binaries.soliditylang.org/wasm` builds are compiled _without_ Z3. The solc wasm
builds contain the CHC/BMC engine-name strings but no actual SMT solver implementation.
Only the native Linux/macOS solc binaries embed Z3.

**Consequence:** `engine: 'chc'` (Horn Clause, true unbounded) requires Z3 and will return
all results as "unsupported" or silently produce no conclusions with the current soljson.
`engine: 'bmc'` (Bounded Model Checking) does NOT require Z3 and works with wasm builds.

### Can the existing compiler plugin accept `settings.modelChecker`?

The normal `compilerInput()` path (`compiler-input.ts:4-42`) has no `modelChecker` field in
`CompilerSettings`. However, `Compiler.state.useFileConfiguration = true` +
`configFileContent = <full JSON>` causes `compilerInputForConfigFile` to do `JSON.stringify(opts)`
verbatim, so `modelChecker` reaches solc. The worker does no filtering.

**Using the existing compiler plugin for custom settings requires:**
```ts
await this.call('solidity', 'compileWithParameters', targets, {
  useFileConfiguration: true,
  configFileContent: JSON.stringify({ language: 'Solidity', sources: {...}, settings: { modelChecker: {...} } })
})
```
UNVERIFIED at runtime: whether `compileWithParameters` on the solidity tab plugin actually
honours `useFileConfiguration`. Its runtime flow in `compile-and-run.ts` needs tracing.

**Recommendation: use a separate Compiler instance / worker** to avoid blocking main
compilation UX and to handle cancellation independently.

---

## Q4 — Existing AI / LLM service

**Yes.** `RemixAIPlugin` at `apps/remix-ide/src/app/plugins/remixAIPlugin.tsx`, name `'remixAI'`.

Callable methods (from profile.methods, lines 21–37):
- `basic_prompt(prompt: string): Promise<string>` — single-turn, no history (line 680)
- `code_generation(prompt: string): Promise<string>`
- `generate(userPrompt, options): Promise<string>`
- Many others (chat, workspace, model selection, MCP)

Usage from any plugin:
```ts
const result = await this.call('remixAI', 'basic_prompt', myPrompt)
```

No API key in client code — handled server-side at `endpointUrls` from `@remix-endpoints-helper`.

The underlying `IRemoteModel` / `IGeneration` interfaces are in
`libs/remix-ai-core/src/types/types.ts:87-103`. **No existing `LLMProvider` interface** in
the repo; we define our own in `libs/remix-formal-check`.

The `remixAI` backend adapter for `LLMProvider` just wraps `this.call('remixAI', 'basic_prompt', …)`.

---

## Q5 — Lint, unit-test, and E2E conventions

### Unit tests: **Mocha + ts-node + Chai** (NOT Jest)

```
libs/<name>/test/**/*.spec.ts
```

Run: `nx run <name>:test`  
Raw command pattern from `project.json`:
```
TS_NODE_PROJECT=libs/<name>/tsconfig.spec.json \
  mocha -r ts-node/register -r tsconfig-paths/register "libs/<name>/test/**/*.spec.ts"
```

Each lib with tests needs `tsconfig.spec.json` with `"types": ["node", "mocha"]`.

Lint: `nx lint <name>` (ESLint, each lib has its own `.eslintrc`).

### E2E tests: Nightwatch

```
apps/remix-ide-e2e/src/tests/<feature>.test.ts        (actual tests with '@disabled': true)
apps/remix-ide-e2e/src/tests/<feature>_group1.test.ts (thin wrapper)
```

Build: `yarn build:e2e`  
Run: `yarn test:e2e --test=<feature> --group=group1`

Minimal E2E test structure:
```ts
'use strict'
import { NightwatchBrowser } from 'nightwatch'
import init from '../helpers/init'
const tests = {
  '@disabled': true,
  before: function (browser: NightwatchBrowser, done: VoidFunction) { init(browser, done) },
  'Shows plugin icon in sidebar #group1': function (browser: NightwatchBrowser) {
    browser
      .clickLaunchIcon('formalCheck')
      .waitForElementPresent('[data-id="formalCheckPanel"]')
      .end()
  },
}
export default tests
module.exports = tests
```

### New lib structure (from `remix-zkverify-core` and `remix-import-resolver`)

```
libs/<name>/
  package.json          name: "@remix-project/<name>", main: "./src/index.js"
  tsconfig.json         extends ../../tsconfig.base.json
  tsconfig.spec.json    "types": ["node", "mocha"]
  project.json          Nx targets: build, test, lint
  src/index.ts
  test/
```

Path alias: add to `tsconfig.paths.json`:
```json
"@remix-project/remix-formal-check": ["libs/remix-formal-check/src/index.ts"]
```

`build:libs` only needs updating if the lib is published to npm or pre-built as an artifact.
For libs compiled by webpack at app-build time, the path alias is sufficient.

---

## Unverified items

1. **BMC in-browser**: Whether `engine: 'bmc'` with targets `['assert','overflow']` actually
   produces results (not just "unsupported") in the current wasm soljson — needs runtime testing.
2. **SMTChecker output format**: Whether counterexamples and "unknown" results appear in
   `data.errors[]` after compilation or in a different field — needs runtime testing.
3. **`compileWithParameters` + `useFileConfiguration`**: Whether the runtime flow in
   `compile-and-run.ts` actually passes the full JSON config through — needs tracing.
4. **Z3-enabled wasm soljson**: There _may_ be a Z3-wasm build from the solc team (the Remix
   team has referenced one in GitHub issues) but it is not in the official registry and not
   wired into this codebase.
5. **sidePanel slot capacity**: Whether the sidePanel plugin will accept our new entry without
   config changes to the icon rail — not inspected in depth.

---

## Two decisions required before implementation

### Decision 1 — Solver engine for Phase 1

The standard in-browser wasm soljson has **no Z3**. Three options:

| Option | Engine | In-browser | Proof strength | Source leaves browser |
|--------|--------|-----------|----------------|----------------------|
| **A. BMC-only** | `bmc` | ✓ | Bounded up to N steps | No |
| **B. Backend solver** | `chc` | ✗ (server-side) | Unbounded (Horn Clause) | Yes (needs consent) |
| **C. Z3 wasm soljson** | `chc` | ✓ if we ship it | Unbounded | No |

Option A is the safe Phase 1 baseline: works fully offline, no consent flow needed for the
solver, clearly labelled "BMC-bounded proof, not unbounded". The spec already says if the
engine was BMC, say so.

Option B is the natural Phase 2 path (backend also handles LLM). Option C is blocked on
whether a Z3 wasm build actually exists.

**My recommendation: Option A (BMC) for Phase 1**, with the solver module designed so the
engine string is a parameter — swapping to CHC in Phase 2 only requires pointing at a
Z3-capable soljson or backend endpoint.

### Decision 2 — Compiler worker: own vs reuse existing

| Option | Pros | Cons |
|--------|------|------|
| **A. Own Compiler instance** in a dedicated worker | Clean isolation, full control over settings, can cancel independently, never blocks main UI | ~50 extra lines, loads soljson twice |
| **B. Reuse `solidity` plugin** via `compileWithParameters` | Less code | UNVERIFIED that modelChecker settings pass through; contends with user's active compilation; no independent cancel |

**My recommendation: Option A (own worker)**, consistent with the spec ("Never block the UI
thread; support cancel"). Reusing the existing plugin for a one-off experiment would work but
creates surprising interactions (e.g., triggering `compilationFinished` events that other
plugins listen to).

---

## Proposed file layout

```
libs/remix-formal-check/
├── package.json                    # @remix-project/remix-formal-check
├── tsconfig.json
├── tsconfig.spec.json
├── project.json                    # Nx: build, test, lint
├── src/
│   ├── index.ts                    # Public exports
│   ├── types.ts                    # Shared: ProposalSchema, Outcome, CheckResult, etc.
│   ├── proposal.ts                 # LLM output schema + Zod validation
│   ├── instrument.ts               # AST-based assertion insertion (pure, no IDE dep)
│   ├── guardrails.ts               # Diff check, injection rejection, vacuity check
│   ├── solver.ts                   # Wraps SMTChecker worker; returns SolverResult
│   ├── classify.ts                 # SolverResult → PROVEN | COUNTEREXAMPLE | NOT_PROVEN
│   ├── llm.ts                      # LLMProvider interface + MockProvider + RemixAIAdapter
│   └── templates.ts                # Built-in property templates (ERC-20, owner-only, vault…)
├── workers/
│   └── smtchecker-worker.ts        # Web Worker: loads soljson, runs compile with modelChecker
└── test/
    ├── fixtures/
    │   ├── vault-buggy.sol
    │   ├── vault-fixed.sol
    │   └── unsupported-feature.sol
    ├── proposal.spec.ts            # JSON validation, rejection cases
    ├── instrument.spec.ts          # Assertion insertion, diff check
    ├── guardrails.spec.ts          # All rejection rules + vacuity detection
    ├── classify.spec.ts            # Outcome mapping from solver output
    └── llm.spec.ts                 # Mock provider, schema validation

libs/remix-ui/formal-check/
├── package.json                    # @remix-ui/formal-check
├── tsconfig.json
└── src/
    ├── index.ts
    └── lib/
        ├── formal-check.tsx        # Root component (receives plugin instance as prop)
        ├── components/
        │   ├── IntentInput.tsx     # Free-text + template picker
        │   ├── ConsentBanner.tsx   # "Source will be sent to LLM — confirm" gate
        │   ├── ProposalView.tsx    # Shows assertion + "This matches what I meant" checkbox
        │   ├── ResultView.tsx      # PROVEN / COUNTEREXAMPLE / NOT_PROVEN badge + detail
        │   └── DetailsSection.tsx  # Engine, settings, unsupported-feature list
        └── types.ts

apps/remix-ide/src/app/plugins/
└── formalCheckPlugin.tsx           # ViewPlugin class (thin: reads file, calls lib, decorates)

apps/remix-ide-e2e/src/tests/
├── formal-check.test.ts            # Actual Nightwatch test cases (#group1 tags)
└── formal-check_group1.test.ts    # Group wrapper (imports from above)
```

No changes to unrelated files except:
- `apps/remix-ide/src/app.ts`: add `import`, `engine.register`, `activatePlugin`
- `tsconfig.paths.json`: add path alias for `@remix-project/remix-formal-check` and `@remix-ui/formal-check`
- `libs/remix-ui/formal-check/package.json` referenced in `tsconfig.base.json` paths

---

*End of findings. Awaiting decisions on Decision 1 and Decision 2 before Phase 1 implementation.*
