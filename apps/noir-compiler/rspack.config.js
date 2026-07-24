// Standalone Rspack pilot config for apps/noir-compiler.
// Second pilot app (after apps/debugger) — exercises the WASM package.json patch hack,
// snarkjs.min.js/profile.json static assets, and the syncWebAssembly experiment flag
// that debugger's config didn't touch. Not wired into the Nx build graph.
const path = require('path')
const fs = require('fs')
const rspack = require('@rspack/core')
const { ReactRefreshRspackPlugin } = require('@rspack/plugin-react-refresh')

const isProd = process.env.NODE_ENV === 'production'

// use the web build for noir-wasm (same bundler-agnostic hack as the webpack config)
let pkgNoirWasm = fs.readFileSync(path.resolve(__dirname, '../../node_modules/@noir-lang/noir_wasm/package.json'), 'utf8')
let typeCount = 0
pkgNoirWasm = pkgNoirWasm
  .replace(/"node"/, '"./node"')
  .replace(/"import"/, '"./import"')
  .replace(/"require"/, '"./require"')
  .replace(/"types"/g, (match) => (++typeCount === 2 ? '"./types"' : match))
  .replace(/"default"/, '"./default"')
fs.writeFileSync(path.resolve(__dirname, '../../node_modules/@noir-lang/noir_wasm/package.json'), pkgNoirWasm)

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry: {
    main: [
      path.resolve(__dirname, 'src/polyfills.ts'),
      path.resolve(__dirname, 'src/css/app.css'),
      path.resolve(__dirname, 'src/main.tsx')
    ]
  },
  output: {
    path: path.resolve(__dirname, '../../dist/rspack-pilot/noir-compiler'),
    filename: '[name].js',
    publicPath: './'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    tsConfig: {
      configFile: path.resolve(__dirname, 'tsconfig.app.json')
    },
    fallback: {
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      path: require.resolve('path-browserify'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      constants: require.resolve('constants-browserify'),
      os: false,
      timers: false,
      zlib: require.resolve('browserify-zlib'),
      fs: false,
      module: false,
      tls: false,
      net: false,
      readline: false,
      child_process: false,
      buffer: require.resolve('buffer/'),
      vm: require.resolve('vm-browserify')
    }
  },
  externals: {
    solc: 'solc'
  },
  experiments: {
    syncWebAssembly: true
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
              transform: { react: { runtime: 'automatic', development: !isProd, refresh: !isProd } }
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
      }
    ]
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: path.resolve(__dirname, 'src/index.html')
    }),
    new rspack.CopyRspackPlugin({
      patterns: [
        { from: path.resolve(__dirname, 'src/profile.json'), to: 'profile.json' },
        { from: path.resolve(__dirname, 'src/snarkjs.min.js'), to: 'snarkjs.min.js' }
      ]
    }),
    new rspack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: require.resolve('process/browser')
    }),
    new rspack.DefinePlugin({
      WALLET_CONNECT_PROJECT_ID: JSON.stringify(process.env.WALLET_CONNECT_PROJECT_ID),
      BASE_URL: JSON.stringify(process.env.NOIR_COMPILER_BASE_URL_DEV),
      WS_URL: JSON.stringify(process.env.NOIR_COMPILER_WS_URL_DEV)
    }),
    !isProd && new ReactRefreshRspackPlugin()
  ].filter(Boolean),
  devServer: {
    port: 4201,
    hot: true,
    historyApiFallback: true,
    client: { overlay: true }
  },
  ignoreWarnings: [/Failed to parse source map/, /Critical dependency/, /has been mocked/, /Module parse warning/, /require function/],
  performance: { hints: false },
  devtool: isProd ? false : 'eval-cheap-module-source-map'
}
