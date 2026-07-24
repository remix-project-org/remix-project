module.exports = {
  presets: ['@babel/preset-typescript', '@babel/preset-env', '@nx/react/babel'],
  plugins: [
    'babel-plugin-replace-ts-export-assignment',
    '@babel/plugin-transform-modules-commonjs',
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-proposal-nullish-coalescing-operator',
    ['@babel/plugin-proposal-private-property-in-object', { loose: false }],
    ['@babel/plugin-proposal-private-methods', { loose: false }],
    [
      '@babel/plugin-transform-runtime',
      {
        regenerator: true,
      },
    ],
  ],
}
