export default async (opts, plugin) => {
  return {
    // @ts-ignore
    'contracts/PredictionMarket.sol': (await import('raw-loader!./contracts/PredictionMarket.sol')).default,
    // @ts-ignore
    'contracts/interfaces/IReceiver.sol': (await import('raw-loader!./contracts/interfaces/IReceiver.sol')).default,
    // @ts-ignore
    'contracts/interfaces/ReceiverTemplate.sol': (await import('raw-loader!./contracts/interfaces/ReceiverTemplate.sol')).default,
    // @ts-ignore
    'README.txt': (await import('raw-loader!./README.txt')).default,
    // @ts-ignore
    '.prettierrc.json': (await import('raw-loader!./.prettierrc')).default,
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default
  }
}