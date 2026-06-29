export default async (opts, plugin) => {
  return {
    // @ts-ignore
    'contracts/WorldCupPredictionMarket.sol': (await import('raw-loader!./contracts/WorldCupPredictionMarket.sol')).default,
    // @ts-ignore
    'contracts/interfaces/ReceiverTemplate.sol': (await import('raw-loader!./contracts/interfaces/ReceiverTemplate.sol')).default,
    // @ts-ignore
    'README.md': (await import('raw-loader!./README.md')).default,
    // @ts-ignore
    '.prettierrc.json': (await import('raw-loader!./.prettierrc')).default,
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default
  }
}