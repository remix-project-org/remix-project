import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
const suites = readdirSync('tests/monad').filter(file => file.endsWith('.test.ts')).sort()

mkdirSync('tmp/monad-ui-tests', { recursive: true })
await build({
  entryPoints: suites.map(file => `tests/monad/${file}`), bundle: true,
  platform: 'node', format: 'esm', packages: 'external',
  outdir: 'tmp/monad-ui-tests', outExtension: { '.js': '.mjs' }
})
const result = spawnSync(process.execPath, ['--test', ...suites.map(file => `tmp/monad-ui-tests/${file.replace(/\.ts$/, '.mjs')}`)], { stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
