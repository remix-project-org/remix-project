
export default async (opts) => {

  const filesObj = {
    // @ts-ignore
    'contracts/Example7702.sol': (await import('!!raw-loader!./contracts/Example7702.sol')).default,
    // @ts-ignore
    'contracts/MyToken.sol': (await import('!!raw-loader!./contracts/MyToken.sol')).default,
    // @ts-ignore
    'contracts/Spender.sol': (await import('!!raw-loader!./contracts/Spender.sol')).default,
    // @ts-ignore
    'scripts/deploy.ts': (await import('!!raw-loader!./scripts/deploy.ts')).default,
    // @ts-ignore
    'scripts/run-eip7702.ts': (await import('!!raw-loader!./scripts/run-eip7702.ts')).default,
    // @ts-ignore
    'README.md': (await import('raw-loader!./README.md')).default,
    // @ts-ignore
    'remix.config.json': (await import('!!raw-loader!./remix.config')).default
  }
  return filesObj
}
