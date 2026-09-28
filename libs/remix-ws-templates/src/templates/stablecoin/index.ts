export default async (opts, plugin) => {
  return {
    // @ts-ignore
    'contracts/Stablecoin.sol': (await import('!!raw-loader!./contracts/Stablecoin.sol')).default,
    // @ts-ignore
    'contracts/CDPVaultManager.sol': (await import('!!raw-loader!./contracts/CDPVaultManager.sol')).default,
    // @ts-ignore
    'scripts/deploy_with_ethers.ts': (await import('!!raw-loader!./scripts/deploy_with_ethers.ts')).default,
    // @ts-ignore
    'scripts/ethers-lib.ts': (await import('!!raw-loader!./scripts/ethers-lib.ts')).default,
    // @ts-ignore
    'README.md': (await import('raw-loader!./README.md')).default,
    // @ts-ignore
    '.prettierrc.json': (await import('raw-loader!./.prettierrc')).default,
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default,
  }
}
