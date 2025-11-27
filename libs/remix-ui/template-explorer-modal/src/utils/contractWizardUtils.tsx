import * as erc20 from '../contractCode/erc20'
import * as erc721 from '../contractCode/erc721'
import * as erc1155 from '../contractCode/erc1155'
import { ContractTypeStrategy } from '../../types/template-explorer-types'

export function getErc20ContractCode (contractType: 'erc20', state: ContractTypeStrategy) {

  if (state.contractType === contractType) {
    if (state.contractOptions.mintable && state.contractOptions.burnable && state.contractOptions.pausable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSOwnableMintableBurnablePausableOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20MintablePausableBurnableOwnableOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20MintablePausableBurnableRolesOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20MintablePausableBurnableManagedOptions(state.contractName || 'MyToken')
      }
    } else if (state.contractOptions.mintable && state.contractOptions.burnable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSOwnableMintableBurnableOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20BurnableMintableOwnableOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
      } else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20MintableManagedOptions(state.contractName || 'MyToken')
      }
      return erc20.erc20BurnableMintableOwnableOptions(state.contractName || 'MyToken')
    }
    if (state.contractOptions.mintable && state.contractOptions.pausable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20PausableBurnableMintableOwnableOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20MintablePausableOwnableOptions(state.contractName || 'MyToken')
      }
    }
    if (state.contractOptions.burnable && state.contractOptions.pausable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20PausableBurnableMintableOwnableOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20PausableBurnableOwnableOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20MintableBurnablePausableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20MintableBurnablePausableManagedOptions(state.contractName || 'MyToken')
      }
      return erc20.erc20PausableBurnableOwnableOptions(state.contractName || 'MyToken')
    } else if (state.contractOptions.mintable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSOwnableMintableOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20MintableOwnableOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20MintableRolesOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20MintableManagedOptions(state.contractName || 'MyToken')
      }
    } else if (state.contractOptions.burnable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSOwnableBurnableOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20BurnableOwnableOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20BurnableRolesOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20BurnableOwnableOptions(state.contractName || 'MyToken')
      }
      return erc20.erc20BurnableOnlyOptions(state.contractName || 'MyToken')
    }
    else if (state.contractOptions.pausable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSOwnablePausableOptions(state.contractName || 'MyToken')
        }
      } else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20PausableRolesOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc20.erc20UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc20.erc20PausableOwnableOptions(state.contractName || 'MyToken')
      }
    }
    return erc20.erc20DefaultNoOptions(state.contractName || 'MyToken')
  }
}

export function getErc721ContractCode (contractType: 'erc721', state: ContractTypeStrategy) {

  if (state.contractType === contractType) {
    if (state.contractOptions.mintable && state.contractOptions.burnable && state.contractOptions.pausable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSOwnableFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721BurnableMintablePausableOwnableOnlyOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721MintableBurnablePausableRolesOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721MintableBurnablePausableManagedOptions(state.contractName || 'MyToken')
      }
      return erc721.erc721MintableBurnablePausableOwnbaleOptions(state.contractName || 'MyToken')
    } else if (state.contractOptions.mintable && state.contractOptions.burnable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSOwnableFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721MintableBurnableOwnableOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721MintableBurnableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721MintableBurnableManagedOptions(state.contractName || 'MyToken')
      }
    } else if (state.contractOptions.mintable && state.contractOptions.pausable) { //Mintable and Pausable
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSMintablePausableOwnableOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721MintablePausableOwnableOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721MintablePausableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721MintablePausableManagedOptions(state.contractName || 'MyToken')
      }
    } else if (state.contractOptions.burnable && state.contractOptions.pausable) { // Burnable and Pausable
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSOwnableFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721BurnablePausableOwnableOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721BurnablePausableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721BurnablePausableManagedOptions(state.contractName || 'MyToken')
      }
    } else if (state.contractOptions.mintable) { // Mintable
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSOwnableFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721MintableOwnableOptions(state.contractName || 'MyToken')
      }

      else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721MintableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721MintableManagedOptions(state.contractName || 'MyToken')
      }
    } else if (state.contractOptions.burnable) { // Burnable
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSOwnableFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721BurnableOwnableOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721BurnableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721BurnableManagedOptions(state.contractName || 'MyToken')
      }
      return erc721.erc721BurnableOnlyOptions(state.contractName || 'MyToken')
    } else if (state.contractOptions.pausable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSOwnableFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721PausableOwnableOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721PausableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc721.erc721UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc721.erc721PausableManagedOptions(state.contractName || 'MyToken')
      }
    }
  }
  return erc721.erc721DefaultNoOptions(state.contractName || 'MyToken')
}

export function getErc1155ContractCode (contractType: 'erc1155', state: ContractTypeStrategy) {

  if (state.contractType === contractType) {
    if (state.contractOptions.mintable && state.contractOptions.burnable && state.contractOptions.pausable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSOwnableMintableBurnablePausableOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintableBurnablePausable(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintablePausableBurnableRolesOptions(state.contractName || 'MyToken')
      } else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintablePausableBurnableManagedOptions(state.contractName || 'MyToken')
      }
    } else if (state.contractOptions.mintable && state.contractOptions.burnable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSMintableBurnableOnlyOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintableBurnable(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintableBurnableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintableBurnableManagedOptions(state.contractName || 'MyToken')
      }
    } else if (state.contractOptions.mintable && state.contractOptions.pausable) { // Mintable and Pausable
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSOwnableFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintablePausableOwnableOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintablePausableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintablePausableManagedOptions(state.contractName || 'MyToken')
      }
    } else if (state.contractOptions.mintable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSOwnableFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintableOwnableOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155MintableManagedOptions(state.contractName || 'MyToken')
      }
    } else if (state.contractOptions.burnable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSOwnableFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155BurnableOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155BurnableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155BurnableManagedOptions(state.contractName || 'MyToken')
      }
    } else if (state.contractOptions.pausable) {
      if (state.contractAccessControl === 'ownable') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSOwnableFullOptions(state.contractName || 'MyToken')
        }
      } else if (state.contractAccessControl === 'roles') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSRolesFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155PausableRolesOptions(state.contractName || 'MyToken')
      }
      else if (state.contractAccessControl === 'managed') {
        if (state.contractUpgradability.uups) {
          return erc1155.erc1155UUPSManagedFullOptions(state.contractName || 'MyToken')
        }
        return erc1155.erc1155PausableManagedOptions(state.contractName || 'MyToken')
      }
    }
    return erc1155.erc1155DefaultOptions(state.contractName || 'MyToken')
  }
  return erc1155.erc1155DefaultOptions(state.contractName || 'MyToken')
}
