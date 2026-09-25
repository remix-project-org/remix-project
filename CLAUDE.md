# Claude Code Context for Remix Project

> **Purpose**: Context document for AI assistants working on the Remix Project. Read this at the start of a conversation to understand the codebase structure, conventions, and common patterns.

## Project Identity

**Remix Project** is a smart contract development toolset for Ethereum: the Remix IDE (web + desktop), its plugins, and the libraries behind Solidity compilation, testing, debugging, analysis, and deployment.

- **Repository**: https://github.com/remix-project-org/remix-project
- **Architecture**: Nx monorepo with Yarn 1 (classic) workspaces
- **Main Branch**: `master` (also the Nx `defaultBase`)
- **Default Nx Project**: `remix-ide`
- **Package version**: `2.6.0-dev` (root `package.json`)
- **Tech Stack**: React 18, TypeScript 5.5, Nx 15.7.1, Webpack 5, Bootstrap 5, Electron (desktop), Node 20 (`.nvmrc` → v20.19.0), Yarn 1.22.22

## Critical Context

### Monorepo Structure

```
remix-project/
├── apps/                       # 13 deployable apps (each with project.json)
│   ├── remix-ide/              # Main web IDE (default project)
│   ├── remixdesktop/           # Electron desktop app (own package.json + build)
│   ├── remix-ide-e2e/          # Nightwatch E2E tests + helpers/commands
│   ├── circuit-compiler/       # Circom circuit compilation plugin
│   ├── contract-verification/  # Contract verification plugin
│   ├── debugger/               # Debugger plugin app
│   ├── doc-gen/ doc-viewer/    # Documentation generation/viewing plugins
│   ├── learneth/               # Tutorial/learning plugin
│   ├── noir-compiler/          # Noir language support
│   ├── solhint/                # Solhint linter plugin
│   ├── solidity-compiler/      # Solidity compiler plugin
│   └── vyper/                  # Vyper compiler plugin
├── libs/                       # 20 shared libraries
│   ├── remix-ai-core/          # AI features, agents, MCP server ⭐
│   ├── remix-analyzer/         # Static analysis & security checks
│   ├── remix-api/              # Plugin API type contracts
│   ├── remix-astwalker/        # Solidity AST traversal
│   ├── remix-core-plugin/      # Plugin base classes / core plugins
│   ├── remix-debug/            # Transaction debugger & EVM tracing
│   ├── remix-git/              # Git integration helpers
│   ├── remix-import-resolver/  # Import resolution (npm/GitHub/IPFS/Swarm/CDN)
│   ├── remix-lib/              # Shared low-level utilities
│   ├── remix-simulator/        # In-browser EVM/JSON-RPC simulator
│   ├── remix-solidity/         # Compiler management
│   ├── remix-tests/            # Solidity unit testing framework
│   ├── remix-ui/               # React component library (60 sub-packages)
│   ├── remix-url-resolver/     # URL-based source resolution
│   ├── remix-ws-templates/     # Workspace templates
│   ├── remix-zkverify-core/    # zk verification support
│   ├── remixd/                 # Local filesystem daemon (npm published)
│   ├── endpoints-helper/ ghaction-helper/
│   └── README.md               # Libraries overview
├── tests/                      # Playwright specs (RemixAI / auth / quota flows)
├── scripts/                    # CI helper scripts (sharding, reports, timings)
└── docs/                       # Internal specs (E2E account pool, API manifests)
```

Nx project configuration lives in per-project `project.json` files (26 of them). Root `projects.json` is a **generated dep-graph dump**, not hand-edited config.

### Key Libraries to Know

**remix-ai-core** — the AI subsystem, the most actively evolving area:
- Location: `libs/remix-ai-core/src/`
  - `agents/`: `codeExplainAgent`, `completionAgent`, `contractAgent`, `securityAgent`, `workspaceAgent`
  - `inferencers/`:
    - `deepagent/`: DeepAgent inferencer (LangGraph-style agent) — `DeepAgentInferencer`, `ModelFactory`, `RemixFilesystemBackend`, `StreamEventHandler`, `SubagentConfig`, plus `tools/`, `prompts/`, `helpers/`
    - `local/`: Ollama integration (`ollamaInferencer`, `fimModelConfig`) — see `OLLAMA_SETUP.md`
    - `remote/`: hosted model inference
    - `mcp/`: MCP client side (`mcpClient`, `mcpInferencer`, `toolApiGenerator`, `codeExecutor`)
  - `remix-mcp-server/`: in-IDE MCP (Model Context Protocol) server
    - `handlers/`: tool handlers — Compilation, Debugging, Deployment, FileManagement, CodeAnalysis, DAppGenerator, FoundryHardhat, SkillLoader, Tutorials, Coordination, ContractClassifier, ChartJs, Amp, MathUtils, DAppDocs
    - `providers/`: resource providers — Compilation, Context, Debugging, Deployment, Project, Amp
    - `middleware/`, `registry/`, `config/`, `prompts/`, `types/`
  - `state/`: `assistant-machine.ts` (XState v5 machine for auth/tier/permission/error flow) and `ai-error.ts`
  - `storage/`: chat/checkpoint persistence — `IndexedDBCheckpointSaver`, `indexedDBBackend`, `cloudBackend`, `deepAgentMemoryBackend`, `storageManager`
  - `services/`: `intentAnalyzer`, `resourceScoring`, `simpleToolSelector`, `weightedToolSelector`
  - `prompts/`, `config/`, `helpers/`, `types/`

  There is a dedicated agent spec for the assistant state machine at `.github/agents/ai-state-machine.agent.md` — read it before touching `assistant-machine.ts`, AI permissions, tiers, or the plan-manager paywall hand-off.

**remix-core-plugin**: base classes and core plugins built on `@remixproject/engine` (v0.3.44); event-driven pub/sub communication.

**remix-api**: shared TypeScript contracts for plugin APIs (e.g. `PermissionsResponse` in `libs/remix-api/src/lib/plugins/api-types.ts`).

**remix-ui**: 60 independently-aliased React packages (`@remix-ui/<name>`), e.g. `editor`, `terminal`, `workspace`, `run-tab*`, `remix-ai-assistant`, `top-bar`, `statusbar`, `plan-manager`, `git`, `walkthrough`, `quick-dapp-v2`, `template-explorer-modal`.

**remix-ide-e2e**: Nightwatch E2E suite (109 test files) plus custom `commands/`, `helpers/`, `examples/`, and a local test plugin.

## Development Commands

```bash
# Setup
yarn install
yarn run build:libs        # ALWAYS build libs first (serial, --with-deps)
yarn build                 # Build default project (remix-ide)
yarn serve                 # Dev server → http://127.0.0.1:8080
yarn serve:hot             # Hot module reload configuration

# Per-project
nx build <project>
nx test <project>
nx lint <project>
yarn test:libs             # Unit tests for the core libs
yarn lint:libs             # Lint the curated lib list

# Plugin apps
yarn serve:plugin --plugin=<app-name>
yarn build:plugin --plugin=<app-name>

# Nightwatch E2E
yarn build:e2e                                   # REQUIRED after editing any test file
yarn test:e2e --test=<name> --group=group1       # One group
yarn test:e2e --test=<name>                      # Auto-discovers and runs all groups
yarn test:e2e --test=<name> --env=firefox        # Browser env (default chrome)
yarn run select_test                             # Interactive selector
yarn run install_webdriver                       # Set up drivers

# Playwright (AI/auth/quota flows in tests/)
npx playwright test                              # chromium, firefox, webkit projects
yarn playwright:record                           # Codegen against a running IDE

# Desktop
yarn build:desktop         # Linux/macOS  (build:desktopwin on Windows)

# Production
yarn run build:production
yarn run serve:production

# Local services used by tests
yarn ganache               # Local chain for ballot tests
yarn remixd                # remixd daemon against http://127.0.0.1:8080
yarn simulator             # remix-simulator JSON-RPC

# Utilities
nx dep-graph
yarn format                # nx format:write
yarn format:check
```

## Important Patterns & Conventions

### File Organization
- TypeScript path aliases (86 of them) live in `tsconfig.paths.json`, referenced from `tsconfig.base.json`.
- Import across library boundaries by alias, never relative paths: `@remix-project/<lib>`, `@remix-ui/<component>`, `@remix-api`, `@remix-git`, `@remix-endpoints-helper`.
- `@nrwl/nx/enforce-module-boundaries` is an **error** in ESLint — cross-boundary relative imports will fail lint.
- Each library has `src/`, `project.json`, `package.json`, `tsconfig.json`, and usually a `README.md`.

### Code Style
- Prettier config (`.prettierrc.json`): 2-space indent, **no semicolons**, single quotes, `printWidth: 500`.
- ESLint enforces `indent: 2`, `keyword-spacing`, `array-bracket-spacing: never`, `object-curly-spacing: always`. Many strict TS rules are intentionally off (`no-explicit-any`, `no-unused-vars`, `react-hooks/exhaustive-deps`).
- TypeScript for all new code. Match the surrounding file's style rather than reformatting it.
- Keep changes focused and minimal; large PRs (>200-400 changed lines) are hard to review — see `team-best-practices.md`.

### Testing Patterns
- **Unit tests**: Jest, `*.spec.ts` alongside or in a `test(s)/` folder of the lib (34 spec files; heaviest in `remix-import-resolver`, `remix-tests`, `remix-solidity`).
- **Nightwatch E2E** (`apps/remix-ide-e2e/src/tests/`):
  ```ts
  const tests = {
    '@disabled': true,                       // required when using group tags
    before: (browser, done) => init(browser, done),
    '@sources': () => sources,
    'Does something #group1': function (browser: NightwatchBrowser) { ... }
  }
  ```
  - `yarn build:e2e` regenerates per-group files via `cleanupGroupTests.js` + `buildGroupTests.js`, compiles with `tsconfig.e2e.json`, then runs `scripts/update-e2e-keywords.js`. **Nothing runs until you rebuild.**
  - Select elements by `data-id` attributes; custom commands live in `apps/remix-ide-e2e/src/commands/`.
  - Tag `#flaky` to fan a test across all CI instances.
  - External deps: `ballot` tests need Ganache, `remixd` tests need the daemon, `gist` tests need a GitHub token in `.env`.
- **Playwright** (`tests/*.spec.ts`, config `playwright.config.ts`): covers RemixAI assistant, sign-in CTA, free tier, quotas, autocomplete. Uses the shared **E2E account pool** (`tests/helpers/e2e-pool.ts`) which checks out a pre-provisioned authenticated account and wipes its data on release — requires `E2E_POOL_API_KEY`. See `docs/E2E-TEST-ACCOUNT-POOL.md`.

### Plugin Architecture
- Plugins extend base classes from `remix-core-plugin` and register on the engine in `apps/remix-ide/src/app.ts` (`RemixEngine` + `RemixAppManager`).
- IDE-level plugins live in `apps/remix-ide/src/app/plugins/` (AI assistant, auth, git, notifications, permission handler, quick-dapp, script runner, walkthrough/guide, …).
- Each plugin declares a profile (name, description, methods, events); communication is pub/sub over `@remixproject/engine`.
- API contracts belong in `remix-api`.

### UI Component Pattern
```typescript
import React from 'react'

interface ComponentProps {
  // props
}

export const Component: React.FC<ComponentProps> = (props) => {
  // hooks for state, Bootstrap 5 utility classes for styling
  return <div data-id="my-component">...</div>
}
```
Always add `data-id` on elements E2E tests need to reach.

### Internationalization
- react-intl with `FormattedMessage`; always pass `id`, use `defaultMessage` only for dynamic IDs.
- Locale files: `apps/remix-ide/src/app/tabs/locales/{en,es,fr,it,ko,ru,zh}` — `en` is the source of truth.
- Translations are managed through CrowdIn (`crowdin.yml`), **not** via GitHub PRs.

## When Working on This Codebase

### Always Check First
1. `yarn run build:libs` before building or serving apps.
2. Node 20 (`.nvmrc`), Yarn 1 classic — do not use `npm install`.
3. Nx Cloud caching is configured in `nx.json` (`NX_CLOUD_ACCESS_TOKEN`); add `--skip-nx-cache` when a build looks stale.
4. PRs target `master`.

### Common Locations
- **E2E tests**: `apps/remix-ide-e2e/src/tests/`
- **Playwright tests**: `tests/`
- **UI components**: `libs/remix-ui/<component>/src/lib/`
- **IDE plugins**: `apps/remix-ide/src/app/plugins/`
- **Core plugins**: `libs/remix-core-plugin/src/`
- **AI features**: `libs/remix-ai-core/src/`
- **Plugin API types**: `libs/remix-api/src/lib/plugins/`
- **CI helpers**: `scripts/`, `.circleci/config.yml`

### File Reading Strategy
1. Start with `README.md` in the relevant app/lib (and `libs/README.md` for an overview).
2. Check `project.json` for targets and `package.json` for scripts/deps.
3. Read the TypeScript interfaces/types to understand data shapes.
4. Read tests for expected behavior.
5. For AI work, walk `libs/remix-ai-core/src/` and the relevant root spec doc.

### Typical Task Workflows

**Adding a library**
```bash
nx generate @nrwl/node:library <name>
# add it to build:libs (and lint:libs/test:libs if applicable) in package.json
# add a path alias in tsconfig.paths.json, plus a README.md
```

**Adding a UI component** — create under `libs/remix-ui/<component>/src/lib/`, export from the package index, register a `@remix-ui/<component>` alias, use Bootstrap 5 classes and `data-id` hooks.

**Adding an E2E test** — new file in `apps/remix-ide-e2e/src/tests/`, `'@disabled': true` in metadata, `#groupN` tags on test names, then `yarn build:e2e` before running.

**Adding AI features**
- Agents: `libs/remix-ai-core/src/agents/`
- MCP handlers: `libs/remix-ai-core/src/remix-mcp-server/handlers/`
- MCP resource providers: `libs/remix-ai-core/src/remix-mcp-server/providers/`
- DeepAgent tools/prompts: `libs/remix-ai-core/src/inferencers/deepagent/{tools,prompts}/`
- Prompts: `libs/remix-ai-core/src/prompts/`
- Auth/tier/error flow: `libs/remix-ai-core/src/state/assistant-machine.ts` (+ `.github/agents/ai-state-machine.agent.md`)

## Environment Variables

- `NX_CLOUD_ACCESS_TOKEN` — Nx Cloud auth
- `NX_ENDPOINTS_URL` — API endpoints (`serve:endpoints`, `serve:ngrok`)
- `NX_DESKTOP_FROM_DIST` — desktop build flag
- `NX_NO_CLOUD`, `NX_DAEMON`, `NX_PARALLEL` — set by `build:production`
- `WALLET_CONNECT_PROJECT_ID` — WalletConnect integration
- `E2E_POOL_API_KEY` (or `E2E_POOL_KEY`) — Playwright/E2E account pool
- GitHub token in `.env` for gist E2E tests

## CI

- **CircleCI** (`.circleci/config.yml`) drives everything: `build`, `lint`, `remix-libs`, `remix-ide-browser` (sharded/parallel E2E matrix), `remix-test-plugins`, `playwright-tests`, `deploy-build`, plus rerun/report jobs.
- Pipeline parameters select workflows: `run_all_tests`, `run_pr_tests`, `run_file_tests`, `run_file_tests_keyword`, `run_flaky_tests`, `run_rerun_failed`, `run_lint_only`, `run_build_only`, `run_libs_only`, `run_deploy_alpha`, `run_deploy_beta`, `run_playwright_tests`.
- Shard planning and reporting helpers: `yarn ci:plan-shard`, `yarn ci:timings`, `yarn ci:failed-report`, `yarn ci:post-pr-report` (`scripts/`).
- **GitHub Actions** (`.github/workflows/`): autosquash, rebase-pull-requests, pr-reminder, service-checker, publish-action, run-sut.

## Known Issues & Quirks

1. **Memory**: builds need headroom — scripts use `node --max-old-space-size=4096/8192`.
2. **Nx cache**: `yarn build` already retries with `--skip-nx-cache` on failure; add the flag manually when output looks stale.
3. **E2E**: always `yarn build:e2e` after touching test files; some tests need Ganache/remixd/tokens; group files are generated, so never edit `*_groupN.test.js` by hand.
4. **Hot reload**: use `yarn serve:hot`, not plain `yarn serve`.
5. **Import resolution**: complex resolver supporting npm, GitHub, IPFS, Swarm, and CDNs — 14 E2E groups cover it (`apps/remix-ide-e2e/README.md`).
6. **Desktop**: `apps/remixdesktop` has its own `package.json`, webpack/esbuild configs, Nightwatch config, and electron-builder pipeline; run its scripts from that directory.
7. **`projects.json`** at the root is generated output — don't edit it.

## Project-Specific Knowledge

### Ethereum/Solidity Context
Most libraries deal with Solidity compilation and AST parsing, EVM debugging and transaction tracing, static analysis for security vulnerabilities, and contract testing/deployment.

### Desktop vs Web IDE
`remix-ide` (web) is the main target; `remixdesktop` is the Electron wrapper adding local filesystem access, isomorphic-git support, and offline mode. They share most code with different build configurations (`--configuration=desktop`, `NX_DESKTOP_FROM_DIST`).

### Plugin System
Remix is extensible through plugins loaded from URLs, local files, or built in. Communication is pub/sub through the custom `@remixproject/engine`; each plugin has a profile.

### Testing Philosophy
Group-based E2E for parallel execution across CircleCI containers; groups run in isolation or sequentially; `#flaky` fans a test out across instances; Playwright covers authenticated AI/billing flows that need real accounts.

## Documentation & Resources

- **Main Docs**: https://remix-ide.readthedocs.io/en/latest/
- **Discord**: https://discord.gg/MzhfCGstNA
- **Contributing**: `CONTRIBUTING.md`
- **Team practices**: `team-best-practices.md`
- **Release**: `release-process.md`, `release-management.md`, `automation.md`
- **Libs overview**: `libs/README.md`
- **E2E**: `apps/remix-ide-e2e/README.md`, `METAMASK.md`, `CIRCLE_CI.md`, `docs/E2E-TEST-ACCOUNT-POOL.md`
- **Feature specs at root**: `OLLAMA_SETUP.md`, `Permissions-api.md`, `WALKTHROUGH_API.md`, `WORKSPACE_LOCK_API.md`, `FOUNDRY_HARDHAT_COMMAND_IMPLEMENTATION.md`, `docs/API-SPEC-VERIFY-MANIFEST.md`

## Updates to This File

Update this file when: new critical patterns emerge, project structure changes significantly, conventions are established, pitfalls are discovered, or new tools/workflows are adopted.

**Format**: Keep it focused on what an AI assistant needs to know, not general development docs.

---

**Last Updated**: 2026-08-18
**Purpose**: Context document for Claude Code and other AI assistants
