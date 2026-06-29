# @remix-project/import-resolver

Standalone, Node-friendly import resolver and flattener for Solidity built from Remix internals.

- Adapterized I/O (no global fs/network): plug in Node or your own adapters
- URL normalization (npm CDNs, GitHub raw/blob, IPFS, Swarm)
- Context-aware dependency resolution with per-file package bases
- Foundry-style remappings (inline or remappings.txt)
  - If both are provided, remappings.txt takes precedence
- Deterministic flattening with single SPDX/pragma and "// File:" sections
- Optional resolution index for IDE "Go to Definition" parity

## Quick start

```ts
import {
  NodeIOAdapter,
  SourceFlattener,
} from '@remix-project/import-resolver'

const io = new NodeIOAdapter()
const flattener = new SourceFlattener(io)

const { flattened } = await flattener.flatten('contracts/MyToken.sol', {
  remappingsFile: 'remappings.txt', // wins over inline
  remappings: ['oz=@openzeppelin/contracts@4.8.0/'], // optional fallback
})
console.log(flattened)
```

## API highlights

- SourceFlattener.flatten(entry, opts) → { entry, order, sources, flattened }
- SourceFlattener.flattenToFile(entry, outFile, opts)
- DependencyResolver: build dependency graph, save resolution index
- NodeIOAdapter: basic fs/network I/O for Node
- parseRemappingsFileContent / normalizeRemappings: manage remappings

### Cache control

By default the resolver uses a cache-first strategy, reusing on-disk files under `.deps/` and skipping redundant network requests where possible.

You can toggle this behavior at runtime per session:

```ts
import { DependencyResolver, NodeIOAdapter } from '@remix-project/import-resolver'

const io = new NodeIOAdapter()
const dep = new DependencyResolver(io, 'contracts/Main.sol')

// Disable cache: always refetch and overwrite saved content
dep.setCacheEnabled(false)

// Build graph or flatten as usual
await dep.buildDependencyTree('contracts/Main.sol')
```

If you use the low-level `ImportResolver` directly:

```ts
import { ImportResolver, NodeIOAdapter } from '@remix-project/import-resolver'

const resolver = new ImportResolver(new NodeIOAdapter(), 'contracts/Main.sol')
resolver.setCacheEnabled(false)
```

When cache is disabled:

- External content (.sol and package.json) is always fetched and written to the deterministic path under `.deps/`, even if a file already exists.
- GitHub `package.json` short-circuiting (by repo@ref) is bypassed.
- This is useful for forcing fresh sources or debugging resolution changes.

### Warnings and verbosity

Warnings are centralized and deduplicated via `WarningSystem`.

- High-signal issues (multi-parent dependency conflicts, duplicate file across versions, processing errors) always emit once per unique event.
- Noisy messages (like failed resolves or non-.sol imports) are gated behind the resolver `debug` flag. Instantiate with `debug=true` to enable verbose warnings:

```ts
import { DependencyResolver, NodeIOAdapter } from '@remix-project/import-resolver'

const dep = new DependencyResolver(new NodeIOAdapter(), 'contracts/Main.sol', true) // debug → verbose
```

For advanced scenarios, `WarningSystem` is exported from the package utilities.

See the Remix monorepo tests under `libs/remix-solidity/test` for end-to-end usage.

## CLI

After building the library in this monorepo, a CLI is available as `remix-flatten`.

- Help

  - `node dist/libs/remix-import-resolver/src/cli.js --help`

- Flatten to stdout

  - `node dist/libs/remix-import-resolver/src/cli.js contracts/MyToken.sol`

- Flatten to a file

  - `node dist/libs/remix-import-resolver/src/cli.js contracts/MyToken.sol --out flat/MyToken.flat.sol`

- With remappings (repeatable) or a remappings file

  - `node dist/libs/remix-import-resolver/src/cli.js contracts/MyToken.sol -r @openzeppelin/=node_modules/@openzeppelin/`
  - `node dist/libs/remix-import-resolver/src/cli.js contracts/MyToken.sol -R remappings.txt`

When published as a package, the CLI is exposed as `remix-flatten` in your PATH:

- `remix-flatten contracts/MyToken.sol -o flat/MyToken.flat.sol`

Optional overrides:

- Force a specific pragma in the flattened header (useful if dependencies use a looser range):
  - `node dist/libs/remix-import-resolver/src/cli.js contracts/MyToken.sol --pragma ^0.8.26`
  - Or when installed: `remix-flatten contracts/MyToken.sol --pragma ^0.8.26`

Control working directory (affects where `.deps/` is written):

- `node dist/libs/remix-import-resolver/src/cli.js --cwd . contracts/MyToken.sol -o flat.sol`

## Testing

- Run all tests for this library

  - Using Nx: `yarn nx test remix-import-resolver`

- Run a specific test suite (file or glob)

  - Using Nx target with args:
    - `yarn nx run remix-import-resolver:test:suite --args="--suite=libs/remix-import-resolver/test/cdn-and-github.spec.ts"`
    - You can pass any glob, e.g. `--suite=libs/remix-import-resolver/test/import-resolver-groups1-6.spec.ts`

## Troubleshooting

See TROUBLESHOOTING.md in this folder for common warnings, causes, and fixes (multi-parent conflicts, duplicate file across versions, verbose resolution hints) and how to enable verbose warnings.

Notes

- Tests rely on NodeIOAdapter which performs HTTP fetches for external imports (npm CDNs/GitHub). A network connection is required.
- Resolution artifacts (normalized sources and index) are written under `.deps/` relative to the current working directory during tests.
