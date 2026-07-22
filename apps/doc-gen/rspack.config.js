// Standalone Rspack pilot config for apps/doc-gen.
// Stage D position 6 — introduces a new asset type: `.hbs` handlebars templates via
// `type: 'asset/source'` (Rspack's webpack5-compatible asset modules). Minimal node-polyfill
// fallback (path + fs:false only), matching the webpack config. Not wired into the Nx build graph.
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
    path: path.resolve(__dirname, '../../dist/rspack-pilot/doc-gen'),
    filename: '[name].js',
    publicPath: '/'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    tsConfig: {
      configFile: path.resolve(__dirname, 'tsconfig.app.json')
    },
    fallback: {
      path: require.resolve('path-browserify'),
      fs: false
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
        test: /\.hbs$/,
        type: 'asset/source'
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
  ignoreWarnings: [/Failed to parse source map/],
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
    new rspack.DefinePlugin({}),
    !isProd && new ReactRefreshRspackPlugin()
  ].filter(Boolean),
  devServer: {
    port: 4208,
    hot: true,
    historyApiFallback: true,
    client: { overlay: true }
  },
  devtool: isProd ? false : 'eval-cheap-module-source-map'
}
