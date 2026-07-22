// Standalone Rspack pilot config for apps/circuit-compiler.
// Stage D position 5 — the single highest-technical-risk app in the batch: the first genuine WASM
// consumer (circom_wasm, git-dependency-pinned) that actually exercises experiments.syncWebAssembly,
// plus a vendored snarkjs.min.js copy-asset. Build-success is NOT proof for WASM — the module must
// instantiate at runtime (a manual browser check). Modeled on the noir-compiler pilot (the other
// real-WASM app). Not wired into the Nx build graph.
const path = require('path')
const rspack = require('@rspack/core')
const { ReactRefreshRspackPlugin } = require('@rspack/plugin-react-refresh')

const isProd = process.env.NODE_ENV === 'production'

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
    path: path.resolve(__dirname, '../../dist/rspack-pilot/circuit-compiler'),
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
      // Rspack's strict ESM linking rejects fastfile.js's `import { O_TRUNC } from "constants"`
      // against constants-browserify's CJS default-only export; this ESM shim re-exports the
      // fs-flag constants as real named bindings. See src/constants-shim.js.
      constants: path.resolve(__dirname, 'src/constants-shim.js'),
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
      vm: require.resolve('vm-browserify'),
      tty: false
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
      },
      {
        test: /\.js$/,
        use: ['source-map-loader'],
        enforce: 'pre'
      }
    ]
  },
  ignoreWarnings: [/Failed to parse source map/, /Critical dependency/, /has been mocked/, /Module parse warning/, /require function/],
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
      url: ['url', 'URL'],
      process: require.resolve('process/browser')
    }),
    !isProd && new ReactRefreshRspackPlugin()
  ].filter(Boolean),
  devServer: {
    port: 4207,
    hot: true,
    historyApiFallback: true,
    client: { overlay: true }
  },
  performance: { hints: false },
  devtool: isProd ? false : 'eval-cheap-module-source-map'
}
