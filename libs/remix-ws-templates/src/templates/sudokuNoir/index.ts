export default async (opts, plugin) => {
  return {
    // @ts-ignore
    'src/main.nr': (await import('raw-loader!./src/main.nr')).default,
    // @ts-ignore
    'Nargo.toml': (await import('raw-loader!./Nargo.toml')).default,
    // @ts-ignore
    'README.md': (await import('raw-loader!./README.md')).default,
    // @ts-ignore
    'tests/sudoku.test.ts': (await import('!!raw-loader!./tests/sudoku.test.ts')).default,
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default
  }
}
