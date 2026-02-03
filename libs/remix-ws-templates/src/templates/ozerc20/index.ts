import { erc20 } from '@openzeppelin/wizard';

export default async (opts: any, plugin, overrides) => {

  const contractName = (overrides && overrides.contractName) || 'MyToken'
  const contractContent = overrides && overrides.contractContent
  if (opts) {
    erc20.defaults.mintable = opts.mintable
    erc20.defaults.burnable = opts.burnable
    erc20.defaults.pausable = opts.pausable
  }
  const config = { ...erc20.defaults, upgradeable: opts && opts.upgradeable ? opts.upgradeable : false }

  const filesObj = {
    [`contracts/${contractName || 'MyToken'}.sol`]: contractContent ? contractContent : erc20.print(config),
    // @ts-ignore
    'scripts/deploy_with_ethers.ts': (await import('!!raw-loader!./scripts/deploy_with_ethers.ts')).default,
    // @ts-ignore
    'scripts/ethers-lib.ts': (await import('!!raw-loader!./scripts/ethers-lib.ts')).default,
    // @ts-ignore
    '.prettierrc.json': (await import('raw-loader!./.prettierrc')).default,
    // @ts-ignore
    'remix.config.json': (await import('raw-loader!./remix.config')).default,
    // @ts-ignore
    'remappings.txt': erc20.getVersionedRemappings(config).join('\n')
  }

  // If no options is selected, opts.upgradeable will be undefined
  // We do not show test file for upgradeable contract

  if (!opts || opts.upgradeable === undefined || !opts.upgradeable) {
    // @ts-ignore
    if (erc20.defaults.mintable) filesObj[`tests/${contractName}_test.sol`] = (await import(`raw-loader!./tests/MyToken_mintable_test.sol`)).default
    // @ts-ignore
    else filesObj[`tests/${contractName}_test.sol`] = (await import(`raw-loader!./tests/MyToken_test.sol`)).default
  }
  return filesObj
}
