import { ContractTypeStrategy } from '../../types/template-explorer-types'
import { erc1155, erc20, erc721 } from '@openzeppelin/wizard';
import type { Access } from '@openzeppelin/wizard';
import type { Upgradeable } from '@openzeppelin/wizard';

function getAccess(contractAccessControl: string): Access {
  if (contractAccessControl === 'ownable' || contractAccessControl === 'roles' || contractAccessControl === 'managed') {
    return contractAccessControl
  }
  return false
}

function getUpgradeable(contractUpgradability: { uups?: boolean; transparent?: boolean }): Upgradeable {
  if (contractUpgradability.uups) return 'uups'
  if (contractUpgradability.transparent) return 'transparent'
  return false
}

export function getErc20ContractCode (_contractType: 'erc20', state: ContractTypeStrategy) {
  return erc20.print({
    name: state.tokenName || 'MyToken',
    symbol: 'MTK',
    mintable: state.contractOptions.mintable,
    burnable: state.contractOptions.burnable,
    pausable: state.contractOptions.pausable,
    permit: state.contractOptions.permit,
    access: getAccess(state.contractAccessControl),
    upgradeable: getUpgradeable(state.contractUpgradability),
  })
}

export function getErc721ContractCode (_contractType: 'erc721', state: ContractTypeStrategy) {
  return erc721.print({
    name: state.tokenName || 'MyToken',
    symbol: 'MTK',
    mintable: state.contractOptions.mintable,
    burnable: state.contractOptions.burnable,
    pausable: state.contractOptions.pausable,
    access: getAccess(state.contractAccessControl),
    upgradeable: getUpgradeable(state.contractUpgradability),
  })
}

export function getErc1155ContractCode (_contractType: 'erc1155', state: ContractTypeStrategy) {
  return erc1155.print({
    name: state.tokenName || 'MyToken',
    uri: '',
    mintable: state.contractOptions.mintable,
    burnable: state.contractOptions.burnable,
    pausable: state.contractOptions.pausable,
    access: getAccess(state.contractAccessControl),
    upgradeable: getUpgradeable(state.contractUpgradability),
  })
}
