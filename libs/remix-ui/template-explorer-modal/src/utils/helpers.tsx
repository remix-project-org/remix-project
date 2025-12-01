// import { TEMPLATE_METADATA } from "@remix-ui/workspace"

export const templatesRepository = [
  {
    name: "Generic",
    items: [
      { value: "remixDefault", tagList: ["Solidity"],
        displayName: 'Basic',
        description: 'The default project',
      },
      { value: "blank",
        displayName: 'Blank',
        IsArtefact: true, description: 'A blank project',
      },
      { value: "simpleEip7702", displayName: 'Simple EIP 7702', IsArtefact: true, description: 'Pectra upgrade allowing externally owned accounts (EOAs) to run contract code.',
      },
      { value: "accountAbstraction", displayName: 'Account Abstraction', IsArtefact: true, description: 'A repo about ERC-4337 and EIP-7702',
      },
      { value: 'remixAiTemplate', tagList: ['AI'], displayName: 'RemixAI Template Generation', IsArtefact: true, description: 'AI generated workspace.',
      },
      { value: "introToEIP7702", displayName: 'Intro to EIP-7702', IsArtefact: true, description: 'A contract for demoing EIP-7702',
      },
    ]
  },
  {
    name: "OpenZeppelin",
    hasOptions: true,
    items: [
      {
        value: "ozerc20",
        displayName: "ERC20",
        tagList: ["ERC20", "Solidity"],
        description: 'A customizable fungible token contract',
      },
      {
        value: "ozerc20",
        displayName: "ERC20",
        description: "An ERC20 contract with:",
        tagList: ["ERC20", "Solidity"],
        opts: {
          mintable: true
        },
      },
      {
        value: "ozerc20",
        displayName: "ERC20",
        description: "An ERC20 contract with:",
        tagList: ["ERC20", "Solidity"],
        opts: {
          mintable: true,
          burnable: true
        },
      },
      {
        value: "ozerc20",
        displayName: "ERC20",
        description: "An ERC20 contract with:",
        opts: {
          mintable: true,
          pausable: true
        },
        tagList: ["ERC20", "Solidity"],
      },
      {
        value: "ozerc721",
        displayName: "ERC721 (NFT)",
        tagList: ["ERC721", "Solidity"],
        description: 'A customizable non-fungible token (NFT) contract',
      },
      {
        value: "ozerc721",
        displayName: "ERC721 (NFT)",
        description: "An ERC721 contract with:",
        tagList: ["ERC721", "Solidity"],
        opts: {
          mintable: true
        },
      },
      {
        value: "ozerc721",
        displayName: "ERC721 (NFT)",
        description: "An ERC721 contract with:",
        opts: {
          mintable: true,
          burnable: true
        },
        tagList: ["ERC721", "Solidity"],
      },
      {
        value: "ozerc721",
        displayName: "ERC721 (NFT)",
        description: "An ERC721 contract with:",
        opts: {
          mintable: true,
          pausable: true
        },
        tagList: ["ERC721", "Solidity"],
      },
      {
        value: "ozerc1155",
        tagList: ["ERC1155", "Solidity"],
        displayName: "ERC1155",
        description: 'A customizable multi token contract',
      },
      {
        value: "ozerc1155",
        displayName: "ERC1155",
        tagList: ["ERC1155", "Solidity"],
        description: "An ERC1155 contract with:",
        opts: {
          mintable: true
        },
      },
      {
        value: "ozerc1155",
        displayName: "ERC1155",
        description: "An ERC1155 contract with:",
        opts: {
          mintable: true,
          burnable: true
        },
        tagList: ["ERC1155", "Solidity"],
      },
      {
        value: "ozerc1155",
        displayName: "ERC1155",
        description: "An ERC1155 contract with:",
        tagList: ["ERC1155", "Solidity"],
        opts: {
          mintable: true,
          pausable: true
        },
      }
    ]
  },
  {
    name: "OpenZeppelin Proxy",
    items: [
      {
        value: "ozerc20",
        displayName: "UUPS ERC20",
        description: "A simple ERC20 contract using the Universal Upgradeable Proxy Standard (UUPS) pattern",
        opts: {
          upgradeable: 'uups'
        },
        tagList: ["ERC20", "Solidity"],
      },
      {
        value: "ozerc20",
        displayName: "UUPS ERC20",
        description: "UUPS ERC20 contract with:",
        opts: {
          upgradeable: 'uups',
          mintable: true
        },
        tagList: ["ERC20", "Solidity"],
      },
      {
        value: "ozerc20",
        displayName: "UUPS ERC20",
        description: "UUPS ERC20 contract with:",
        opts: {
          upgradeable: 'uups',
          mintable: true,
          burnable: true
        },
        tagList: ["ERC20", "Solidity"],
      },
      {
        value: "ozerc20",
        displayName: "UUPS ERC20",
        description: "UUPS ERC20 contract with:",
        opts: {
          upgradeable: 'uups',
          mintable: true,
          pausable: true
        },
        tagList: ["ERC20", "Solidity"],
      },
      {
        value: "ozerc721",
        displayName: "UUPS ERC721 (NFT)",
        description: "A simple UUPS ERC721 contract",
        opts: {
          upgradeable: 'uups'
        },
        tagList: ["ERC721", "Solidity"],
      },
      {
        value: "ozerc721",
        displayName: "UUPS ERC721 (NFT)",
        description: "UUPS ERC721 contract with:",
        opts: {
          upgradeable: 'uups',
          mintable: true
        },
        tagList: ["ERC721", "Solidity"],
      },
      {
        value: "ozerc721",
        displayName: "UUPS ERC721 (NFT)",
        description: "UUPS ERC721 contract with:",
        opts: {
          upgradeable: 'uups',
          mintable: true,
          burnable: true
        },
        tagList: ["ERC721", "Solidity"],
      },
      {
        value: "ozerc721",
        displayName: "UUPS ERC721 (NFT)",
        description: "UUPS ERC721 contract with:",
        opts: {
          upgradeable: 'uups',
          mintable: true,
          pausable: true
        },
        tagList: ["ERC721", "Solidity"],
      },
      {
        value: "ozerc1155",
        displayName: "UUPS ERC1155",
        description: "A simple multi token contract using the UUPS pattern",
        opts: {
          upgradeable: 'uups'
        },
        tagList: ["ERC1155", "Solidity"],
      },
      {
        value: "ozerc1155",
        displayName: "UUPS ERC1155",
        description: "UUPS ERC1155 with:",
        opts: {
          upgradeable: 'uups',
          mintable: true
        },
        tagList: ["ERC1155", "Solidity"],
      },
      {
        value: "ozerc1155",
        displayName: "UUPS ERC1155",
        description: "UUPS ERC1155 with:",
        opts: {
          upgradeable: 'uups',
          mintable: true,
          burnable: true
        },
        tagList: ["ERC1155", "Solidity"],
      },
      {
        value: "ozerc1155",
        displayName: "UUPS ERC1155",
        description: "UUPS ERC1155 with:",
        opts: {
          upgradeable: 'uups',
          mintable: true,
          pausable: true
        },
        tagList: ["ERC1155", "Solidity"],
      },
      {
        value: "ozerc1155",
        displayName: "UUPS ERC1155",
        description: "UUPS ERC1155 with:",
        opts: {
          upgradeable: 'uups',
          mintable: true,
          burnable: true,
          pausable: true
        },
        tagList: ["ERC1155", "Solidity"],
      }
    ]
  },
  {
    name: "Cookbook",
    tooltip: "Cookbook is a Smart Contract Search Tool. Click here to open Cookbook and browse Contracts.",
    onClick: async () => {
      // await pluginCall('manager', 'activatePlugin', 'cookbookdev')
      // await pluginCall('sidePanel', 'focus', 'cookbookdev')
    },
    onClickLabel: 'Open Cookbook Plugin',
    // description: 'Discover more templates!',
    items: [
      {
        value: "cookbook",
        displayName: "Cookbook",
        tagList: ['Cookbook'],
        description: 'Discover more templates!',
      }
    ],
  },
  {
    name: "0xProject",
    items: [
      { value: "zeroxErc20", displayName: "ERC20", tagList: ["ERC20", "Solidity"], description: "A fungible token contract by 0xProject",
      }
    ]
  },
  {
    name: "Gnosis Safe",
    items: [
      { value: "gnosisSafeMultisig", tagList: ["Solidity"],
        displayName: 'MultiSig Wallet',
        description: 'Deploy or customize the Gnosis Safe MultiSig Wallet',
      }
    ]
  },
  {
    name: "Circom ZKP",
    items: [
      { value: "semaphore", tagList: ["ZKP", "Circom"],
        displayName: 'Semaphore',
        description: 'Semaphore protocol for casting a message as a provable group member',
      },
      { value: "hashchecker", tagList: ["ZKP", "Circom"],
        displayName: 'Hash Checker',
        description: 'Hash checker Circom circuit',
      },
      { value: "rln", tagList: ["ZKP", "Circom"],
        displayName: 'Rate-Limiting Nullifier',
        description: 'Rate Limiting Nullifier Circom circuit',
      }
    ]
  },
  {
    name: "Noir ZKP",
    items: [
      { value: "multNr", tagList: ["ZKP", "Noir"],
        displayName: 'Simple Multiplier',
        description: 'A simple multiplier circuit',
      },
      { value: "stealthDropNr", tagList: ["ZKP", "Noir"], displayName: 'Stealth Drop' }
    ]
  },
  {
    name: "Generic ZKP",
    items: [
      {
        value: "sindriScripts",
        tagList: ["ZKP"],
        displayName: 'Add Sindri ZK scripts',
        description: 'Use the Sindri API to compile and generate proofs',

      },
    ],
  },
  {
    name: "Uniswap V4",
    items: [
      { value: "uniswapV4Template",
        displayName: 'Uniswap v4 Template',
        description: 'Use a Uniswap hook',
      },
      {
        value: "breakthroughLabsUniswapv4Hooks",
        displayName: 'Breakthrough-Labs Hooks',
        description: 'Use a Uniswap hook developed by Breakthrough Labs',
      },
      {
        value: "uniswapV4HookBookMultiSigSwapHook",
        displayName: 'HookBook MultiSigSwapHook',
        description: 'Use a MultiSigSwapHook developed by Breakthrough Labs',
      }
    ]
  },
  {
    name: "Solidity CREATE2",
    items: [
      {
        value: "contractCreate2Factory",
        displayName: 'Add Create2 Solidity factory',
        description: 'Factory for deploying a contract using the CREATE2 opcode',
      },
      {
        value: "contractDeployerScripts",
        displayName: 'Add contract deployer scripts',
        description: 'Script for deploying a contract using the CREATE2 opcode',
      }
    ]
  },
  {
    name: "Contract Verification",
    items: [
      {
        value: "etherscanScripts",
        displayName: 'Add Etherscan scripts',
        description: 'Script for verifying a Contract in Etherscan',
      },
    ],
  },
  {
    name: 'GitHub Actions',
    items: [
      { value: "runJsTestAction",
        displayName: 'Mocha Chai Test Workflow',
        description: 'Add files to run Mocha Chai test workflow in GitHub CI',
      },
      { value: "runSolidityUnittestingAction",
        displayName: 'Solidity Test Workflow',
        description: 'Add files to run Solidity unit test workflow in GitHub CI',
      },
      {
        value: "runSlitherAction",
        displayName: 'Slither Workflow',
        description: 'Add files to run Slither security analysis in GitHub CI',
      }
    ],
    IsArtefact: true
  }
]

export const metadata = {
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

