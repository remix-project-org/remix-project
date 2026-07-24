// Standalone Rspack pilot config for apps/solhint.
// Stage D position 4 — the only pilot with NO externals.solc, a minimal node-polyfill fallback
// (path/os/fs/module:false only), and a custom DefinePlugin({ BROWSER: true }). This app has its
// own apps/solhint/package.json (a nested module-resolution scope) and imports only external npm
// packages, never internal @remix-project path aliases. Modeled on the debugger pilot.
// Not wired into the Nx build graph.
const path = require('path')
const rspack = require('@rspack/core')
const { ReactRefreshRspackPlugin } = require('@rspack/plugin-react-refresh')

const isProd = process.env.NODE_ENV === 'production'

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry: {
    main: [path.resolve(__dirname, 'src/main.tsx')]
  },
  output: {
    path: path.resolve(__dirname, '../../dist/rspack-pilot/solhint'),
    filename: '[name].js',
    publicPath: './'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    tsConfig: {
      configFile: path.resolve(__dirname, 'tsconfig.app.json')
    },
    fallback: {
      path: false,
      os: false,
      fs: false,
      module: false
    }
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
        { from: path.resolve(__dirname, 'src/profile.json'), to: 'profile.json' }
      ]
    }),
    new rspack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      url: ['url', 'URL'],
      process: require.resolve('process/browser')
    }),
    new rspack.DefinePlugin({
      BROWSER: true
    }),
    !isProd && new ReactRefreshRspackPlugin()
  ].filter(Boolean),
  devServer: {
    port: 4206,
    hot: true,
    historyApiFallback: true,
    client: { overlay: true }
  },
  performance: { hints: false },
  devtool: isProd ? false : 'eval-cheap-module-source-map'
}
