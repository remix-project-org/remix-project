// Standalone Rspack pilot config for apps/remix-ide — the hardest test case.
// Ported directly from apps/remix-ide/webpack.config.js: same resolve.fallback/alias,
// same externals, same custom EmitSoljsonPlugin/EmitVersionJsonPlugin, same node: rewriting.
// Intentionally skipped: copying other Nx apps' dist output into /plugins/ (implicitDependencies
// composition — that's a monorepo assembly step, not a bundler-compatibility question) and the
// BundleAnalyzer/prod minimizer paths (irrelevant to a dev-build compatibility test).
// Not wired into the Nx build graph.
const path = require('path')
const fs = require('fs')
const rspack = require('@rspack/core')

const isProd = process.env.NODE_ENV === 'production'

const versionData = {
  version: require('../../package.json').version,
  timestamp: 0,
  mode: isProd ? 'production' : 'development'
}

class EmitSoljsonPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('EmitSoljsonPlugin', (compilation) => {
      const { sources, Compilation } = compiler.webpack
      const RawSource = sources && sources.RawSource
      compilation.hooks.processAssets.tapPromise(
        { name: 'EmitSoljsonPlugin', stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        async () => {
          const assetName = 'assets/js/soljson.js'
          if (compilation.getAsset(assetName)) return
          try {
            const defaultVersion = require('../../package.json').defaultVersion
            const url = `https://binaries.soliditylang.org/bin/${defaultVersion}`
            const data = await new Promise((resolve, reject) => {
              const https = require('https')
              const request = https
                .get(url, (res) => {
                  if (res.statusCode !== 200) {
                    reject(new Error(`Failed to download soljson.js (${res.statusCode})`))
                    return
                  }
                  const chunks = []
                  res.on('data', (c) => chunks.push(c))
                  res.on('end', () => resolve(Buffer.concat(chunks)))
                })
                .on('error', reject)
              request.setTimeout(15000, () => {
                request.destroy(new Error(`Timed out downloading soljson.js from ${url}`))
              })
            })
            if (RawSource) compilation.emitAsset(assetName, new RawSource(data))
          } catch (e) {
            console.warn('EmitSoljsonPlugin: skipping emit due to error:', e.message)
          }
        }
      )
    })
  }
}

class EmitVersionJsonPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('EmitVersionJsonPlugin', (compilation) => {
      const json = JSON.stringify(versionData)
      const RawSource = compiler.webpack && compiler.webpack.sources && compiler.webpack.sources.RawSource
      if (RawSource) compilation.emitAsset('assets/version.json', new RawSource(json))
    })
  }
}

// use the web build instead of the node.js build for rust-verkle-wasm
let pkgVerkle = fs.readFileSync(path.resolve(__dirname, '../../node_modules/rust-verkle-wasm/package.json'), 'utf8')
pkgVerkle = pkgVerkle.replace('"main": "./nodejs/rust_verkle_wasm.js",', '"main": "./web/rust_verkle_wasm.js",')
fs.writeFileSync(path.resolve(__dirname, '../../node_modules/rust-verkle-wasm/package.json'), pkgVerkle)

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry: {
    main: [
      path.resolve(__dirname, 'src/polyfills.ts'),
      path.resolve(__dirname, 'src/index.tsx')
    ]
  },
  output: {
    path: path.resolve(__dirname, '../../dist/rspack-pilot/remix-ide'),
    filename: '[name].[contenthash].js',
    chunkFilename: '[name].[contenthash].js',
    publicPath: '/'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    tsConfig: {
      configFile: path.resolve(__dirname, 'tsconfig.app.json')
    },
    mainFields: ['browser', 'module', 'main'],
    fallback: {
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      path: require.resolve('path-browserify'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      constants: require.resolve('constants-browserify'),
      os: require.resolve('os-browserify/browser'),
      timers: false,
      zlib: require.resolve('browserify-zlib'),
      'assert/strict': require.resolve('assert/'),
      async_hooks: false,
      fs: path.resolve(__dirname, 'src/fs-shim.js'),
      module: false,
      tls: false,
      net: false,
      readline: false,
      child_process: false,
      buffer: require.resolve('buffer/'),
      vm: require.resolve('vm-browserify')
    },
    alias: {
      ws: false,
      express: false,
      'express-ws': false,
      'web3-rpc-providers': false,
      'async-limiter': false,
      '@so-ric/colorspace': false,
      os: path.resolve(__dirname, '../../node_modules/os-browserify/browser.js')
    }
  },
  externals: {
    solc: 'solc',
    'monaco-editor': 'monaco'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: { syntax: 'typescript', tsx: true },
              transform: { react: { runtime: 'automatic' } }
            }
          }
        }
      },
      {
        // Legacy .js files in this codebase contain JSX — Babel transformed these regardless of
        // extension; SWC needs it declared explicitly per rule.
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: { syntax: 'ecmascript', jsx: true },
              transform: { react: { runtime: 'automatic' } }
            }
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpe?g|gif|svg|woff2?|eot|ttf)$/,
        type: 'asset/resource'
      },
      {
        test: /\.js$/,
        use: ['source-map-loader'],
        enforce: 'pre'
      }
    ]
  },
  ignoreWarnings: [/Failed to parse source map/, /require function/],
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: path.resolve(__dirname, 'src/index.html')
    }),
    new rspack.CopyRspackPlugin({
      patterns: [
        { from: path.resolve(__dirname, '../../node_modules/monaco-editor/min/vs'), to: 'assets/js/monaco-editor/min/vs' },
        { from: path.resolve(__dirname, 'src/assets'), to: 'assets' },
        { from: path.resolve(__dirname, 'src/404.html'), to: '404.html' },
        { from: path.resolve(__dirname, 'src/favicon.ico'), to: 'favicon.ico' },
        { from: path.resolve(__dirname, 'src/robots.txt'), to: 'robots.txt' },
        { from: path.resolve(__dirname, 'src/sitemap.xml'), to: 'sitemap.xml' }
      ]
    }),
    new EmitSoljsonPlugin(),
    new EmitVersionJsonPlugin(),
    new rspack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      url: ['url', 'URL'],
      process: require.resolve('process/browser')
    }),
    new rspack.DefinePlugin({
      WALLET_CONNECT_PROJECT_ID: JSON.stringify(process.env.WALLET_CONNECT_PROJECT_ID),
      'process.env.NX_ENDPOINTS_URL': JSON.stringify(process.env.NX_ENDPOINTS_URL),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.version': JSON.stringify('v18.0.0'),
      'process.versions': JSON.stringify({ node: '18.0.0' })
    }),
    new rspack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
      const module = resource.request.replace(/^node:/, '')
      const replacements = {
        fs: 'fs-mock',
        'fs/promises': 'fs-mock',
        child_process: 'child-process-mock',
        worker_threads: 'worker-threads-mock',
        perf_hooks: 'perf-hooks-mock',
        async_hooks: 'async-hooks-mock',
        // Rspack enforces "fully specified" ESM resolution more strictly than webpack did —
        // bare specifiers fail to resolve from ESM-only dependencies, so these need to be
        // pre-resolved to absolute paths (same fix as the ProvidePlugin process/browser case).
        path: require.resolve('path-browserify'),
        os: require.resolve('os-browserify/browser'),
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        util: require.resolve('util/'),
        buffer: require.resolve('buffer/')
      }
      if (replacements[module] === 'fs-mock') {
        resource.request = path.resolve(__dirname, 'src/fs-shim.js')
      } else if (replacements[module] === 'child-process-mock') {
        resource.request = 'data:text/javascript,' + encodeURIComponent(`
          export const spawn = () => { throw new Error('child_process not available in browser'); };
          export const fork = () => { throw new Error('child_process not available in browser'); };
          export const exec = () => { throw new Error('child_process not available in browser'); };
          export default { spawn, fork, exec };
        `)
      } else if (replacements[module] === 'worker-threads-mock') {
        resource.request = 'data:text/javascript,' + encodeURIComponent(`
          export const Worker = class {};
          export default { Worker };
        `)
      } else if (replacements[module] === 'perf-hooks-mock') {
        resource.request = 'data:text/javascript,' + encodeURIComponent(`
          export const performance = { now: () => Date.now() };
          export default { performance };
        `)
      } else if (replacements[module] === 'async-hooks-mock') {
        resource.request = 'data:text/javascript,' + encodeURIComponent(`
          export class AsyncLocalStorage { constructor() {} run(store, callback, ...args) { return callback(...args); } getStore() { return undefined; } }
          export const executionAsyncId = () => 0;
          export const executionAsyncResource = () => ({});
          export default { AsyncLocalStorage, executionAsyncId, executionAsyncResource };
        `)
      } else if (replacements[module]) {
        resource.request = replacements[module]
      }
    })
  ],
  devtool: isProd ? false : 'eval-cheap-module-source-map'
}
