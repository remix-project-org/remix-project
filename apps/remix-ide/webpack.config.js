const {composePlugins, withNx} = require('@nrwl/webpack')
const {withReact} = require('@nrwl/react')
const webpack = require('webpack')
const CopyPlugin = require('copy-webpack-plugin')
const version = require('../../package.json').version
const fs = require('fs')
const TerserPlugin = require('terser-webpack-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')
const path = require('path')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const versionData = {
  version: version,
  timestamp: Date.now(),
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

// Emit the soljson.js compiler into the output without touching source files
class EmitSoljsonPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('EmitSoljsonPlugin', (compilation) => {
      const { sources, Compilation } = compiler.webpack
      const RawSource = sources && sources.RawSource
      compilation.hooks.processAssets.tapPromise(
        { name: 'EmitSoljsonPlugin', stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        async () => {
          const assetName = 'assets/js/soljson.js'
          // Check if asset already exists to avoid conflicts
          if (compilation.getAsset(assetName)) {
            return
          }
          try {
            const defaultVersion = require('../../package.json').defaultVersion
            const url = `https://binaries.soliditylang.org/bin/${defaultVersion}`
            const data = await new Promise((resolve, reject) => {
              const https = require('https')
              https
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
            })
            if (RawSource) {
              // Match previous public path: assets/js/soljson.js
              compilation.emitAsset(assetName, new RawSource(data))
            }
          } catch (e) {
            console.warn('EmitSoljsonPlugin: skipping emit due to error:', e.message)
          }
        }
      )
    })
  }
}

// Emit version.json as part of the build instead of writing to source
class EmitVersionJsonPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('EmitVersionJsonPlugin', (compilation) => {
      const json = JSON.stringify(versionData)
      const RawSource = compiler.webpack && compiler.webpack.sources && compiler.webpack.sources.RawSource
      if (RawSource) {
        compilation.emitAsset('assets/version.json', new RawSource(json))
      }
    })
  }
}

// No-op external writes; emit soljson during compilation instead

const project = fs.readFileSync(__dirname + '/project.json', 'utf8')

const implicitDependencies = JSON.parse(project).implicitDependencies

const copyPatterns = implicitDependencies.map((dep) => {
  try {
    fs.statSync(__dirname + `/../../dist/apps/${dep}`).isDirectory()
    return { from: __dirname + `/../../dist/apps/${dep}`, to: `plugins/${dep}` }
  }
  catch (e) {
    console.log('error', e)
    return false
  }
})

console.log('Copying plugins... ', copyPatterns)

// Nx plugins for webpack.
module.exports = composePlugins(withNx(), withReact(), (config) => {
  // Update the webpack config as needed here.
  // e.g. `config.plugins.push(new MyPlugin())`

  // add fallback for node modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    crypto: require.resolve('crypto-browserify'),
    stream: require.resolve('stream-browserify'),
    path: require.resolve('path-browserify'),
    http: require.resolve('stream-http'),
    https: require.resolve('https-browserify'),
    constants: require.resolve('constants-browserify'),
    os: require.resolve('os-browserify/browser'),
    timers: false, // require.resolve("timers-browserify"),
    zlib: require.resolve('browserify-zlib'),
    'assert/strict': require.resolve('assert/'),
    async_hooks: false,
    fs: false,
    module: false,
    tls: false,
    net: false,
    readline: false,
    child_process: false,
    buffer: require.resolve('buffer/'),
    vm: require.resolve('vm-browserify')
  }

  // add externals
  config.externals = {
    ...config.externals,
    solc: 'solc',
    // Do not bundle Monaco: it's copied as static assets and loaded by @monaco-editor/react
    'monaco-editor': 'monaco'
    // NOTE: @langchain packages (including @langchain/anthropic) MUST be bundled, not externalized
  }

  // uncomment this to enable react profiling
  /*
  config.resolve.alias = {
    ...config.resolve.alias,
    'react-dom$': 'react-dom/profiling',
  }
  */

  // use the web build instead of the node.js build
  // we do like that because using "config.resolve.alias" doesn't work
  let  pkgVerkle = fs.readFileSync(path.resolve(__dirname, '../../node_modules/rust-verkle-wasm/package.json'), 'utf8')
  pkgVerkle = pkgVerkle.replace('"main": "./nodejs/rust_verkle_wasm.js",', '"main": "./web/rust_verkle_wasm.js",')
  fs.writeFileSync(path.resolve(__dirname, '../../node_modules/rust-verkle-wasm/package.json'), pkgVerkle)

  // Prefer browser/Esm entry points where available
  config.resolve.mainFields = ['browser', 'module', 'main']

  config.resolve.alias = {
    ...config.resolve.alias,
    // Avoid bundling server-only deps or optional node paths
    ws: false,
    express: false,
    'express-ws': false,
    'web3-rpc-providers': false,
    'async-limiter': false,
    '@so-ric/colorspace': false,
    // 'rust-verkle-wasm$': path.resolve(__dirname, '../../node_modules/rust-verkle-wasm/web/run_verkle_wasm.js')
    // Explicitly alias os to os-browserify for DeepAgent
    'os': path.resolve(__dirname, '../../node_modules/os-browserify/browser.js')
  }


  // add public path
  if(process.env.NX_DESKTOP_FROM_DIST){
    config.output.publicPath = './'
  }else{
    config.output.publicPath = '/'
  }

  // set deterministic filenames for better caching
  config.output.filename = `[name].[contenthash].js`
  config.output.chunkFilename = `[name].[contenthash].js`

  // add copy & provide plugin
  config.plugins.push(
    new CopyPlugin({
      patterns: [
        {
          from: '../../node_modules/monaco-editor/min/vs',
          to: 'assets/js/monaco-editor/min/vs'
        },
        ...copyPatterns
      ].filter(Boolean)
    }),
    new EmitSoljsonPlugin(),
    new EmitVersionJsonPlugin(),
    new CopyFileAfterBuild(),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      url: ['url', 'URL'],
      process: 'process/browser'
    })
  )

  // Optional: generate static bundle analysis when ANALYZE env var is set
  if (process.env.ANALYZE) {
    config.plugins.push(
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        openAnalyzer: false,
        reportFilename: 'bundle-report.html',
        generateStatsFile: true,
        statsFilename: 'bundle-stats.json',
      })
    )
  }

  // set the define plugin to load the WALLET_CONNECT_PROJECT_ID
  config.plugins.push(
    new webpack.DefinePlugin({
      WALLET_CONNECT_PROJECT_ID: JSON.stringify(process.env.WALLET_CONNECT_PROJECT_ID),
      'process.env.NX_ENDPOINTS_URL': JSON.stringify(process.env.NX_ENDPOINTS_URL),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.version': JSON.stringify('v18.0.0'),
      'process.versions': JSON.stringify({ node: '18.0.0' })
    })
  )

  // Ignore node: prefix imports and provide fallbacks
  config.plugins.push(
    new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
      const module = resource.request.replace(/^node:/, '')

      // Map node: prefixed modules to their polyfills or empty modules
      const replacements = {
        'fs': 'fs-mock',
        'fs/promises': 'fs-mock',
        'child_process': 'child-process-mock',
        'worker_threads': 'worker-threads-mock',
        'perf_hooks': 'perf-hooks-mock',
        'async_hooks': 'async-hooks-mock',
        'path': 'path-browserify',
        'os': 'os-browserify/browser',
        'crypto': 'crypto-browserify',
        'stream': 'stream-browserify',
        'util': 'util/',
        'buffer': 'buffer/',
      }

      if (replacements[module] === 'fs-mock') {
        // Comprehensive fs mock with constants
        resource.request = 'data:text/javascript,' + encodeURIComponent(`
          export const constants = {
            O_RDONLY: 0,
            O_WRONLY: 1,
            O_RDWR: 2,
            O_CREAT: 64,
            O_EXCL: 128,
            O_NOCTTY: 256,
            O_TRUNC: 512,
            O_APPEND: 1024,
            O_DIRECTORY: 65536,
            O_NOATIME: 262144,
            O_NOFOLLOW: 131072,
            O_SYNC: 1052672,
            O_SYMLINK: 2097152,
            O_DIRECT: 16384,
            O_NONBLOCK: 2048,
            F_OK: 0,
            R_OK: 4,
            W_OK: 2,
            X_OK: 1
          };
          export const promises = {
            readFile: async () => { throw new Error('fs not available in browser'); },
            writeFile: async () => { throw new Error('fs not available in browser'); },
            readdir: async () => { throw new Error('fs not available in browser'); },
            stat: async () => { throw new Error('fs not available in browser'); },
            mkdir: async () => { throw new Error('fs not available in browser'); },
            rm: async () => { throw new Error('fs not available in browser'); },
            unlink: async () => { throw new Error('fs not available in browser'); }
          };
          export default { constants, promises };
        `)
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
  )

  // source-map loader
  config.module.rules.push({
    test: /\.js$/,
    use: ['source-map-loader'],
    enforce: 'pre'
  })

  config.ignoreWarnings = [/Failed to parse source map/, /require function/] // ignore source-map-loader warnings & AST warnings

  // set minimizer
  config.optimization.minimizer = [
    new TerserPlugin({
      parallel: true,
      terserOptions: {
        ecma: 2015,
        compress: false,
        mangle: false,
        format: {
          comments: false
        }
      },
      extractComments: false
    }),
    new CssMinimizerPlugin()
  ]

  // minify code
  if(process.env.NX_DESKTOP_FROM_DIST)
    config.optimization.minimize = true

  config.watchOptions = {
    ignored: /node_modules/,
    aggregateTimeout: 300,
    poll: false
  }

  // Reduce memory usage in development by using cheaper source maps
  if (config.mode === 'development') {
    config.devtool = 'eval-cheap-module-source-map'
    // Disable caching if memory is an issue (trade-off: slower rebuilds)
    // config.cache = false
  }

  // Allow ngrok and other tunneling services
  config.devServer = {
    ...config.devServer,
    allowedHosts: 'all'
  }

  return config;
});

class CopyFileAfterBuild {
  apply(compiler) {
    const onEnd = async () => {
      try {
        console.log('running CopyFileAfterBuild')
        // This copy the raw-loader files used by the etherscan plugin to the remix-ide root folder.
        // This is needed because by default the etherscan resources are served from the /plugins/etherscan/ folder,
        // but the raw-loader try to access the resources from the root folder.
      } catch (e) {
        console.error('running CopyFileAfterBuild failed with error: ' + e.message)
      }
    }
    compiler.hooks.afterEmit.tapPromise('FileManagerPlugin', onEnd)
  }
}
