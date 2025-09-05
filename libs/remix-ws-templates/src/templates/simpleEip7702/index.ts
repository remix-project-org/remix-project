
export default async (opts) => {

  const filesObj = {
    // @ts-ignore
    'contracts/Example7702.sol': (await import('!!raw-loader!./contracts/Example7702.sol')).default,
    // @ts-ignore
    'README.md': (await import('raw-loader!./README.md')).default,
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default
  }
  return filesObj
}
