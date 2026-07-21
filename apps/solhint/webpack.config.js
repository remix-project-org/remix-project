const { composePlugins, withNx } = require('@nx/webpack')
const { withReact } = require('@nx/react')
const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')

// Nx plugins for webpack.
module.exports = composePlugins(withNx(), withReact(), (config) => {
  // Update the webpack config as needed here.

  // This app only imports external npm packages (solhint, @remixproject/*) and never
  // uses internal @remix-project/@remix-ui path aliases, so it doesn't need Nx's
  // auto-injected TsconfigPathsPlugin. Strip it: its async resolution path is
  // incompatible with this webpack version's NormalModuleFactory.resolve hook
  // (upstream tsconfig-paths-webpack-plugin bug, unresolved as of 4.2.0).
  if (config.resolve.plugins) {
    config.resolve.plugins = config.resolve.plugins.filter(
      (plugin) => plugin.constructor.name !== 'TsconfigPathsPlugin'
    )
  }

  config.resolve.fallback = {
    ...config.resolve.fallback,
    path: false,
    os: false,
    fs: false,
    module: false,
  }

  // add public path
  config.output.publicPath = '/'

  // add copy & provide plugin
  config.plugins.push(
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      url: ['url', 'URL'],
      process: 'process/browser',
    }),
    new webpack.DefinePlugin({
      BROWSER: true,
    }),
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

  return config
})
