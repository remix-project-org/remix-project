// Standalone Rspack pilot config for apps/solidity-compiler.
// Stage D position 2 — proven idioms only (full node-polyfill fallback, externals.solc,
// ProvidePlugin), closely matching the debugger/remix-ide shape. Modeled on the debugger pilot.
// Note: the webpack config carries a dead unused `versionData` object (no emit plugin consumes
// it) — intentionally not ported. Not wired into the Nx build graph.
const path = require('path')
const rspack = require('@rspack/core')
const { ReactRefreshRspackPlugin } = require('@rspack/plugin-react-refresh')

const isProd = process.env.NODE_ENV === 'production'

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry: {
    main: [
      path.resolve(__dirname, 'src/polyfills.ts'),
      path.resolve(__dirname, 'src/styles.css'),
      path.resolve(__dirname, 'src/main.tsx')
    ]
  },
  output: {
    path: path.resolve(__dirname, '../../dist/rspack-pilot/solidity-compiler'),
    filename: '[name].js',
    publicPath: '/'
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
        { from: path.resolve(__dirname, 'src/favicon.ico'), to: 'favicon.ico' },
        { from: path.resolve(__dirname, 'src/assets'), to: 'assets' }
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
    port: 4204,
    hot: true,
    historyApiFallback: true,
    client: { overlay: true }
  },
  performance: { hints: false },
  devtool: isProd ? false : 'eval-cheap-module-source-map'
}
