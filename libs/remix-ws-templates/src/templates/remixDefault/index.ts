export default async () => {
  return {
    // @ts-ignore
    'contracts/1_Storage.sol': (await import('raw-loader!./contracts/1_Storage.sol')).default,
    // @ts-ignore
    'contracts/2_Owner.sol': (await import('raw-loader!./contracts/2_Owner.sol')).default,
    // @ts-ignore
    'contracts/3_Ballot.sol': (await import('raw-loader!./contracts/3_Ballot.sol')).default,
    // @ts-ignore
    'scripts/deploy_with_ethers.ts': (await import('!!raw-loader!./scripts/deploy_with_ethers.ts')).default,
    // @ts-ignore
    'scripts/deploy_with_web3.ts': (await import('!!raw-loader!./scripts/deploy_with_web3.ts')).default,
    // @ts-ignore
    'scripts/ethers-lib.ts': (await import('!!raw-loader!./scripts/ethers-lib.ts')).default,
    // @ts-ignore
    'scripts/web3-lib.ts': (await import('!!raw-loader!./scripts/web3-lib.ts')).default,
    // @ts-ignore
    'tests/Ballot_test.sol': (await import('raw-loader!./tests/Ballot_test.sol')).default,
    // @ts-ignore
    'tests/storage.test.js': (await import('!!raw-loader!./tests/storage.test.js')).default,
    // @ts-ignore
    'README.txt': (await import('raw-loader!./README.txt')).default,
    // @ts-ignore
    '.prettierrc.json': (await import('raw-loader!./.prettierrc')).default,
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default
  }
}