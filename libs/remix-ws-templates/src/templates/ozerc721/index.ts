import { erc721 } from '@openzeppelin/wizard';

export default async (opts) => {
  if (opts) {
    erc721.defaults.mintable = opts.mintable
    erc721.defaults.burnable = opts.burnable
    erc721.defaults.pausable = opts.pausable
  }

  const filesObj = {
    'contracts/MyToken.sol': erc721.print({ ...erc721.defaults, upgradeable: opts && opts.upgradeable ? opts.upgradeable : false }),
    // @ts-ignore
    'scripts/deploy_with_ethers.ts': (await import('!!raw-loader!./scripts/deploy_with_ethers.ts')).default,
    // @ts-ignore
    'scripts/deploy_with_web3.ts': (await import('!!raw-loader!./scripts/deploy_with_web3.ts')).default,
    // @ts-ignore
    'scripts/ethers-lib.ts': (await import('!!raw-loader!./scripts/ethers-lib.ts')).default,
    // @ts-ignore
    'scripts/web3-lib.ts': (await import('!!raw-loader!./scripts/web3-lib.ts')).default,
    // @ts-ignore
    '.prettierrc.json': (await import('raw-loader!./.prettierrc')).default,
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default
  }

  // If no options are selected, opts.upgradeable will be undefined
  // We do not show test file for upgradeable contract
  // @ts-ignore
  if (!opts || opts.upgradeable === undefined || !opts.upgradeable) {
    // @ts-ignore
    if (erc721.defaults.mintable) filesObj['tests/MyToken_test.sol'] = (await import('raw-loader!./tests/MyToken_mintable_test.sol')).default
    // @ts-ignore
    else filesObj['tests/MyToken_test.sol'] = (await import('raw-loader!./tests/MyToken_test.sol')).default
  }
  return filesObj
}
