export default async () => {
  return {
    // @ts-ignore
    'src/main.nr': (await import('raw-loader!./src/main.nr')).default,
    // @ts-ignore
    'Nargo.toml': (await import('raw-loader!./Nargo.toml')).default,
    // @ts-ignore
    'README.md': (await import('raw-loader!./README.md')).default,
    // @ts-ignore
    'tests/stealthdrop.test.ts': (await import('!!raw-loader!./tests/stealthdrop.test.ts')).default,
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default
  }
}