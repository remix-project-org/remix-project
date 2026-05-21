const { composePlugins, withNx } = require('@nrwl/webpack')
const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')

const versionData = {
  timestamp: Date.now(),
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
}
// Nx plugins for webpack.
module.exports = composePlugins(withNx(), (config) => {
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
    os: false, //require.resolve("os-browserify/browser"),
    timers: false, // require.resolve("timers-browserify"),
    zlib: require.resolve('browserify-zlib'),
    fs: false,
    module: false,
    tls: false,
    net: false,
    readline: false,
    child_process: false,
    buffer: require.resolve('buffer/'),
    vm: require.resolve('vm-browserify'),
  }

  // add externals
  config.externals = {
    ...config.externals,
    solc: 'solc',
  }

  // add public path
  config.output.publicPath = '/'

  // set deterministic filenames for better caching
  config.output.filename = `[name].plugin-contract-verification.[contenthash].js`
  config.output.chunkFilename = `[name].plugin-contract-verification.[contenthash].js`

  // polyfill global for browser (needed by stream-browserify etc.)
  config.node = {
    ...config.node,
    global: true,
  }

  // add copy & provide plugin
  config.plugins.push(
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      url: ['url', 'URL'],
      process: 'process/browser',
    })
  )

  // source-map loader
  config.module.rules.push({
    test: /\.js$/,
    use: ['source-map-loader'],
    enforce: 'pre',
  })

  config.ignoreWarnings = [/Failed to parse source map/] // ignore source-map-loader warnings

  // set minimizer
  config.optimization.minimizer = [
    new TerserPlugin({
      parallel: true,
      terserOptions: {
        ecma: 2015,
        compress: false,
        mangle: false,
        format: {
          comments: false,
        },
      },
      extractComments: false,
    }),
    new CssMinimizerPlugin(),
  ]

  config.watchOptions = {
    ignored: /node_modules/,
  }

  return config
})
