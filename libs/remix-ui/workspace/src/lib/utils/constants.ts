import { TemplateType } from '../types'
export const ROOT_PATH = '/'

export const TEMPLATE_NAMES = {
  'remixDefault': 'Basic',
  'blank': 'Blank',
  'ozerc20': 'OpenZeppelin ERC20',
  'ozerc721': 'OpenZeppelin ERC721',
  'ozerc1155': 'OpenZeppelin ERC1155',
  'zeroxErc20': '0xProject ERC20',
  'gnosisSafeMultisig': 'Gnosis Safe',
  'playground': 'Playground',
  'semaphore': 'Semaphore',
  'hashchecker': 'Hash Checker',
  'rln': 'Rate-Limiting Nullifier',
  'multNr': 'Simple Multiplier',
  'stealthDropNr': 'Stealth Drop',
  'breakthroughLabsUniswapv4Hooks': 'Breakthrough-Labs Uniswapv4Hooks',
  'uniswapV4Template': 'Uniswap v4 Template',
  'uniswapV4HookBookMultiSigSwapHook': 'Uniswap V4 HookBook MultiSigSwapHook',
  'accountAbstraction': 'Account Abstraction Template',
  'introToEIP7702': 'Intro to EIP-7702',
  'circles': 'About Circles'
}

export const TEMPLATE_METADATA: Record<string, TemplateType> = {
  'breakthroughLabsUniswapv4Hooks': {
    type: 'git',
    url: 'https://github.com/Breakthrough-Labs/Uniswapv4Hooks',
    branch: 'foundry_pure',
    forceCreateNewWorkspace: true
  },
  'accountAbstraction': {
    type: 'git',
    url: 'https://github.com/eth-infinitism/account-abstraction',
    branch: 'releases/v0.8',
    forceCreateNewWorkspace: true
  },
  'uniswapV4Template': {
    type: 'git',
    url: 'https://github.com/Breakthrough-Labs/v4-template',
    branch: 'main',
    forceCreateNewWorkspace: true
  },
  'uniswapV4HookBookMultiSigSwapHook': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openPattern',
    params: ['Uniswap-V4-HookBook-MultiSigSwapHook', true],
    forceCreateNewWorkspace: true,
    desktopCompatible: false,
    disabled: true
  },
  'token-sale': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openContract',
    params: ['token-sale'],
    desktopCompatible: false
  },
  'simple-nft-sale': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openContract',
    params: ['simple-nft-sale'],
    desktopCompatible: false
  },
  'Azuki-ERC721A-NFT-Sale': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openContract',
    params: ['Azuki-ERC721A-NFT-Sale'],
    desktopCompatible: false
  },
  'Azuki-ERC721A-NFT-Sale-basic': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openContract',
    params: ['Azuki-ERC721A-NFT-Sale-basic'],
    desktopCompatible: false
  },
  'Azuki-ERC721A-ERC721A': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openContract',
    params: ['Azuki-ERC721A-ERC721A'],
    desktopCompatible: false
  },
  'token-staking-with-infinite-rewards': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openContract',
    params: ['token-staking-with-infinite-rewards'],
    desktopCompatible: false
  },
  'nft-staking-with-infinite-rewards': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openContract',
    params: ['nft-staking-with-infinite-rewards'],
    desktopCompatible: false
  },
  'basic-dao': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openContract',
    params: ['basic-dao'],
    desktopCompatible: false
  },
  'soulbound-nft': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openContract',
    params: ['soulbound-nft'],
    desktopCompatible: false
  },
  'multi-collection-nft-with-burnable-nfts-and-pausable-transfers': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openContract',
    params: ['multi-collection-nft-with-burnable-nfts-and-pausable-transfers'],
    desktopCompatible: false
  },
  'OpenSea-Seaport': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openProtocol',
    params: ['OpenSea-Seaport'],
    desktopCompatible: false
  },
  'Ethereum-Name-Service': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openProtocol',
    params: ['Ethereum-Name-Service'],
    desktopCompatible: false
  },
  'Umbra-Cash': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openProtocol',
    params: ['Umbra-Cash'],
    desktopCompatible: false
  },
  'Aave-V3': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openProtocol',
    params: ['Aave-V3'],
    desktopCompatible: false
  },
  'ChainLink': {
    type: 'plugin',
    name: 'cookbookdev',
    endpoint: 'openProtocol',
    params: ['ChainLink'],
    desktopCompatible: false
  }
}

export type TemplateOption = {
  mintable?: boolean
  burnable?: boolean
  pausable?: boolean
  upgradeable?: 'uups' | 'transparent' | 'uupds'
}

export type Template = {
  value: string
  displayName: string
  opts?: TemplateOption
  templateType?: TemplateType
  tagList?: string[],
  IsArtefact?: boolean
  description?: string
  name?: string
}

export type TemplateGroup = {
  name: string
  items: Array<Template>
  tooltip?: string
  onClick?: () => void
  onClickLabel?: string
  description?: string
  IsArtefact?: boolean
  hasOptions?: boolean
}

