import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const suites = readdirSync('libs/remix-monad/test').filter(file => file.endsWith('.test.ts')).sort()

mkdirSync('tmp/monad-tests', { recursive: true })
await build({
  entryPoints: suites.map(file => `libs/remix-monad/test/${file}`), bundle: true,
  platform: 'node', format: 'esm', packages: 'external',
  outdir: 'tmp/monad-tests', outExtension: { '.js': '.mjs' },
  plugins: [{ name: 'legacy-package-paths', setup(build) {
    build.onResolve({ filter: /^(ethereum-cryptography|solc)\// }, args => ({ path: require.resolve(args.path), external: true }))
  } }],
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' }
})
const result = spawnSync(process.execPath, ['--test', ...suites.map(file => `tmp/monad-tests/${file.replace(/\.ts$/, '.mjs')}`)], { stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
