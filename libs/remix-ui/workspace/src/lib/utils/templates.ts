import { Template, TemplateGroup } from "@remix-ui/workspace"
export const templates = (intl: any, plugin: any): TemplateGroup[] => {

  return [
    {
      name: "Generic",
      items: [
        { value: "remixDefault", tagList: ["Solidity"], displayName: intl.formatMessage({ id: 'filePanel.basic' }), description: 'The default project' },
        { value: "blank", displayName: intl.formatMessage({ id: 'filePanel.blank' }), IsArtefact: true, description: 'A blank project' },
        { value: "simpleEip7702", displayName: 'Simple EIP 7702', IsArtefact: true, description: 'Pectra upgrade allowing externally owned accounts (EOAs) to run contract code.' },
        { value: "accountAbstraction", displayName: 'Account Abstraction', IsArtefact: true, description: 'A repo about ERC-4337 and EIP-7702' },
        { value: 'remixAiTemplate', tagList: ['AI'], displayName: 'RemixAI Template Generation', IsArtefact: true, description: 'AI generated workspace. Workspace gets generated with a user prompt.' },
        { value: "introToEIP7702", displayName: 'Intro to EIP-7702', IsArtefact: true, description: 'A contract for demoing EIP-7702' },
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
          description: 'A customizable fungible token contract'
        },
        {
          value: "ozerc20",
          displayName: "ERC20",
          description: "An ERC20 contract with:",
          tagList: ["Solidity"],
          opts: {
            mintable: true
          }
        },
        {
          value: "ozerc20",
          displayName: "ERC20",
          description: "An ERC20 contract with:",
          tagList: ["Solidity", "ERC20"],
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
          tagList: ["ERC20", "Solidity"]
        },
        {
          value: "ozerc721",
          displayName: "ERC721 (NFT)",
          tagList: ["ERC721", "Solidity"],
          description: 'A customizable non-fungible token (NFT) contract'
        },
        {
          value: "ozerc721",
          displayName: "ERC721 (NFT)",
          description: "An ERC721 contract with:",
          tagList: ["Solidity", "ERC721"],
          opts: {
            mintable: true
          }
        },
        {
          value: "ozerc721",
          displayName: "ERC721 (NFT)",
          description: "An ERC721 contract with:",
          opts: {
            mintable: true,
            burnable: true
          },
          tagList: ["ERC721", "Solidity"]
        },
        {
          value: "ozerc721",
          displayName: "ERC721 (NFT)",
          description: "An ERC721 contract with:",
          opts: {
            mintable: true,
            pausable: true
          },
          tagList: ["ERC721", "Solidity"]
        },
        {
          value: "ozerc1155",
          tagList: ["Solidity"],
          displayName: "ERC1155",
          description: 'A customizable multi token contract'
        },
        {
          value: "ozerc1155",
          displayName: "ERC1155",
          tagList: ["Solidity"],
          description: "An ERC1155 contract with:",
          opts: {
            mintable: true
          }
        },
        {
          value: "ozerc1155",
          displayName: "ERC1155",
          description: "An ERC1155 contract with:",
          opts: {
            mintable: true,
            burnable: true
          },
          tagList: ["ERC1155", "Solidity"]
        },
        {
          value: "ozerc1155",
          displayName: "ERC1155",
          description: "An ERC1155 contract with:",
          tagList: ["ERC1155"],
          opts: {
            mintable: true,
            pausable: true
          }
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
          tagList: ["ERC20", "Solidity"]
        },
        {
          value: "ozerc20",
          displayName: "UUPS ERC20",
          description: "UUPS ERC20 contract with:",
          opts: {
            upgradeable: 'uups',
            mintable: true
          },
          tagList: ["ERC20", "Solidity"]
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
          tagList: ["ERC20", "Solidity"]
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
          tagList: ["ERC20", "Solidity"]
        },
        {
          value: "ozerc721",
          displayName: "UUPS ERC721 (NFT)",
          description: "A simple UUPS ERC721 contract",
          opts: {
            upgradeable: 'uups'
          },
          tagList: ["ERC721", "Solidity"]
        },
        {
          value: "ozerc721",
          displayName: "UUPS ERC721 (NFT)",
          description: "UUPS ERC721 contract with:",
          opts: {
            upgradeable: 'uups',
            mintable: true
          },
          tagList: ["ERC721", "Solidity"]
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
          tagList: ["ERC721", "Solidity"]
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
          tagList: ["ERC721", "Solidity"]
        },
        {
          value: "ozerc1155",
          displayName: "UUPS ERC1155",
          description: "A simple multi token contract using the UUPS pattern",
          opts: {
            upgradeable: 'uups'
          },
          tagList: ["ERC1155", "Solidity"]
        },
        {
          value: "ozerc1155",
          displayName: "UUPS ERC1155",
          description: "UUPS ERC1155 with:",
          opts: {
            upgradeable: 'uups',
            mintable: true
          },
          tagList: ["ERC1155", "Solidity"]
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
          tagList: ["ERC1155", "Solidity"]
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
          tagList: ["ERC1155", "Solidity"]
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
          tagList: ["ERC1155", "Solidity"]
        }
      ]
    },
    {
      name: "Cookbook",
      tooltip: "Cookbook is a Smart Contract Search Tool. Click here to open Cookbook and browse Contracts.",
      onClick: async () => {
        await plugin.call('manager', 'activatePlugin', 'cookbookdev')
        await plugin.call('sidePanel', 'focus', 'cookbookdev')
      },
      onClickLabel: 'Open Cookbook Plugin',
      description: 'Discover more templates!',
      items: [],
      /*         {
          value: "token-sale",
          displayName: 'Token Sale',
          description: "ERC20 token sale contact. Sell tokens for ETH"
        },
        {
          value: "simple-nft-sale",
          displayName: 'Simple Nft Sale',
          description: "ERC721 NFT with an adjustable price & to mint free NFTs"
        },
        {
          value: "Azuki-ERC721A-NFT-Sale-basic",
          displayName: 'Azuki ERC721A NFT Sale basic',
          description: "An implementation of the ERC721A standard"
        },
        {
          value: "Azuki-ERC721A-NFT-Sale",
          displayName: 'Azuki ERC721A NFT Sale',
          description: "An extension of the ERC721A standard with wallet limit"
        },
        {
          value: "token-staking-with-infinite-rewards",
          displayName: 'Token Staking with infinite rewards',
          description: "Token staking contract to reward ERC20 tokens for every token staked"
        },
        {
          value: "nft-staking-with-infinite-rewards",
          displayName: 'NFT Staking with infinite rewards',
          description: "NFT staking contract to reward exact number of ERC20 tokens per day"
        },
        {
          value: "basic-dao",
          displayName: 'Basic DAO',
          description: "A very simple implementation of a DAO"
        },
        {
          value: "soulbound-nft",
          displayName: 'Soulbound NFT',
          description: "ERC721 Soulbound NFT with no transfer capability"
        },
        { value: "multi-collection-nft-with-burnable-nfts-and-pausable-transfers",
          displayName: 'Multi collection NFT',
          description: "Multi collection NFT with:",
          opts: {
            burnable: true,
            pausable: true
          }, },
      ]*/
    },
    {
      name: "0xProject",
      items: [
        { value: "zeroxErc20", displayName: "ERC20", tagList: ["ERC20", "Solidity"], description: "A fungible token contract by 0xProject" }
      ]
    },
    {
      name: "Gnosis Safe",
      items: [
        { value: "gnosisSafeMultisig", tagList: ["Solidity"], displayName: intl.formatMessage({ id: 'filePanel.multiSigWallet' }), description: 'Deploy or customize the Gnosis Safe MultiSig Wallet' }
      ]
    },
    {
      name: "Circom ZKP",
      items: [
        { value: "semaphore", tagList: ["ZKP", "Circom"], displayName: intl.formatMessage({ id: 'filePanel.semaphore' }), description: 'Semaphore protocol for casting a message as a provable group member' },
        { value: "hashchecker", tagList: ["ZKP", "Circom"], displayName: intl.formatMessage({ id: 'filePanel.hashchecker' }), description: 'Hash checker Circom circuit' },
        { value: "rln", tagList: ["ZKP", "Circom"], displayName: intl.formatMessage({ id: 'filePanel.rln' }), description: 'Rate Limiting Nullifier Circom circuit' }
      ]
    },
    {
      name: "Noir ZKP",
      items: [
        { value: "multNr", tagList: ["ZKP", "Noir"], displayName: intl.formatMessage({ id: 'filePanel.multNr' }), description: 'A simple multiplier circuit' }
        // { value: "stealthDropNr", tagList: ["ZKP", "Noir"], displayName: intl.formatMessage({ id: 'filePanel.stealthDropNr' }), description: 'A stealth drop implementaion built in Noir' }
      ]
    },
    {
      name: "Generic ZKP",
      items: [
        {
          value: "sindriScripts",
          tagList: ["ZKP"],
          displayName: intl.formatMessage({ id: 'filePanel.addscriptsindri' }),
          description: 'Use the Sindri API to compile and generate proofs'
        },
      ],
    },
    {
      name: "Uniswap V4",
      items: [
        { value: "uniswapV4Template",
          displayName: intl.formatMessage({ id: 'filePanel.uniswapV4Template' }),
          description: 'Use a Uniswap hook'
        },
        {
          value: "breakthroughLabsUniswapv4Hooks",
          displayName: intl.formatMessage({ id: 'filePanel.breakthroughLabsUniswapv4Hooks' }),
          description: 'Use a Uniswap hook developed by Breakthrough Labs'
        },
        {
          value: "uniswapV4HookBookMultiSigSwapHook",
          displayName: intl.formatMessage({ id: 'filePanel.uniswapV4HookBookMultiSigSwapHook' }),
          description: 'Use a MultiSigSwapHook developed by Breakthrough Labs'
        }
      ]
    },
    {
      name: "Solidity CREATE2",
      items: [
        {
          value: "contractCreate2Factory",
          tagList: ["Solidity"],
          displayName: intl.formatMessage({ id: 'filePanel.addcreate2solidityfactory' }),
          description: 'Factory for deploying a contract using the CREATE2 opcode'
        },
        {
          value: "contractDeployerScripts",
          displayName: intl.formatMessage({ id: 'filePanel.addscriptdeployer' }),
          description: 'Script for deploying a contract using the CREATE2 opcode'
        }
      ]
    },
    {
      name: "Contract Verification",
      items: [
        {
          value: "etherscanScripts",
          displayName: intl.formatMessage({ id: 'filePanel.addscriptetherscan' }),
          description: 'Script for verifying a Contract in Etherscan'
        },
      ],
    },
    {
      name: 'GitHub Actions',
      items: [
        { value: "runJsTestAction",
          displayName: intl.formatMessage({ id: 'filePanel.tssoltestghaction' }),
          description: 'A Mocha Chai test workflow in a GitHub CI'
        },
        { value: "runSolidityUnittestingAction",
          displayName: intl.formatMessage({ id: 'filePanel.solghaction' }),
          description: 'Run a Solidity unit test workflow in a GitHub CI'
        },
        {
          value: "runSlitherAction",
          displayName: intl.formatMessage({ id: 'filePanel.slitherghaction' }),
          description: 'Run a Slither security analysis in a GitHub CI'
        }
      ],
      IsArtefact: true
    }
  ]
}
