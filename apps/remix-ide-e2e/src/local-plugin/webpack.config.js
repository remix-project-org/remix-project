const { composePlugins, withNx } = require('@nx/webpack')

// Nx plugins for webpack.
module.exports = composePlugins(withNx(), (config) => {
  // Update the webpack config as needed here.
  // e.g. `config.plugins.push(new MyPlugin())`

  // add public path
  config.output.publicPath = '/'

  // source-map loader
  config.module.rules.push({
    test: /\.js$/,
    use: ['source-map-loader'],
    enforce: 'pre',
  })

  config.ignoreWarnings = [/Failed to parse source map/] // ignore source-map-loader warnings

  config.watchOptions = {
    ignored: /node_modules/,
  }

  return config
})
