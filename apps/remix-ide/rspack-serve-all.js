#!/usr/bin/env node
/*
 * Rspack composite runner for the FULL Remix IDE + its plugin apps — no webpack anywhere.
 *
 * Mirrors what apps/remix-ide/webpack.config.js does via Nx implicitDependencies + CopyPlugin,
 * but entirely through the standalone Stage-D Rspack pilot configs:
 *   1. build each plugin app (apps/<dep>/rspack.config.js) -> dist/rspack-pilot/<dep>
 *   2. build remix-ide (apps/remix-ide/rspack.config.js), which copies each dist/rspack-pilot/<dep>
 *      into dist/rspack-pilot/remix-ide/plugins/<dep>  (see pluginCopyPatterns in that config)
 *   3. serve dist/rspack-pilot/remix-ide statically (SPA fallback) so the whole IDE + plugins run
 *
 * With --hot: builds the 8 plugin apps once (they live in iframes, rarely edited), then hands off
 * to `rspack serve` for the remix-ide shell — giving true React Fast Refresh / HMR on the shell.
 * The prebuilt plugin dists are served as dev-server static content (see devServer.static in the
 * config). Edit a shell source file and it hot-updates in the browser without a full reload.
 *
 * This is a standalone pilot runner — it is NOT wired into Nx/CI. Nothing is cut over.
 *
 *   Usage:  node apps/remix-ide/rspack-serve-all.js [--no-build] [--hot|--reload] [--port=8080]
 *     (no flag) production build + static serve (no watch)
 *     --hot     dev server with React Fast Refresh (HMR, state-preserving)
 *     --reload  dev server with full-page live-reload on change (webpack `yarn serve` equivalent)
 */
const path = require('path')
const fs = require('fs')
const http = require('http')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.resolve(ROOT, 'dist/rspack-pilot/remix-ide')
const RSPACK = path.resolve(ROOT, 'node_modules/.bin/rspack')

const args = process.argv.slice(2)
const noBuild = args.includes('--no-build')
const hot = args.includes('--hot')
const reload = args.includes('--reload') // dev server, full-page live-reload instead of HMR
const portArg = args.find((a) => a.startsWith('--port='))
const PORT = portArg ? parseInt(portArg.split('=')[1], 10) : parseInt(process.env.RSPACK_COMPOSITE_PORT || '8080', 10)

const implicitDependencies = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'project.json'), 'utf8')
).implicitDependencies || []

function build(app) {
  const config = path.resolve(ROOT, `apps/${app}/rspack.config.js`)
  if (!fs.existsSync(config)) {
    console.warn(`\n!! skipping ${app} — no rspack.config.js`)
    return
  }
  console.log(`\n=== building ${app} (production) ===`)
  execFileSync(
    process.execPath,
    ['--max-old-space-size=8192', RSPACK, 'build', '-c', config],
    { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' }, cwd: ROOT }
  )
}

if (hot || reload) {
  // Dev-server mode: build the plugin iframes once (unless --no-build), then let `rspack serve`
  // own the remix-ide shell. --hot => React Fast Refresh (state-preserving); --reload => full-page
  // reload on rebuild (webpack `yarn serve` equivalent). The config's devServer.static exposes the
  // prebuilt plugin dists at /plugins/<dep>/, so the shell must be built AFTER the plugins exist.
  if (!noBuild) {
    for (const dep of implicitDependencies) build(dep)
  }
  const config = path.resolve(ROOT, 'apps/remix-ide/rspack.config.js')
  const mode = reload ? 'full-page live-reload' : 'HMR / Fast Refresh'
  console.log(`\n=== serving remix-ide shell with ${mode} at http://localhost:${PORT} (Ctrl-C to stop) ===\n`)
  // dev mode (NOT production); RSPACK_LIVE_RELOAD toggles HMR vs full-page reload in the config.
  const env = { ...process.env, RSPACK_COMPOSITE_PORT: String(PORT), RSPACK_LIVE_RELOAD: reload ? 'true' : 'false' }
  delete env.NODE_ENV
  execFileSync(
    process.execPath,
    ['--max-old-space-size=8192', RSPACK, 'serve', '-c', config, '--port', String(PORT)],
    { stdio: 'inherit', env, cwd: ROOT }
  )
  return
}

if (!noBuild) {
  // Plugins FIRST — remix-ide's config reads dist/rspack-pilot/<dep> at config-load time.
  for (const dep of implicitDependencies) build(dep)
  // Then remix-ide, which composes the freshly-built plugin dists into plugins/<dep>.
  build('remix-ide')
}

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error(`\nNothing to serve: ${OUT}/index.html not found. Run without --no-build first.`)
  process.exit(1)
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml'
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'
  let filePath = path.join(OUT, urlPath)
  // prevent path traversal
  if (!filePath.startsWith(OUT)) { res.writeHead(403); return res.end('Forbidden') }
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html')
    fs.readFile(filePath, (e, data) => {
      if (e) {
        // SPA fallback: unknown non-asset routes -> top-level index.html
        if (!path.extname(urlPath)) {
          return fs.readFile(path.join(OUT, 'index.html'), (e2, idx) => {
            if (e2) { res.writeHead(404); return res.end('Not found') }
            res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(idx)
          })
        }
        res.writeHead(404); return res.end('Not found')
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
      res.end(data)
    })
  })
})

server.listen(PORT, () => {
  console.log(`\n✅ Rspack composite (remix-ide + ${implicitDependencies.length} plugins) serving at:`)
  console.log(`   http://localhost:${PORT}\n`)
})
