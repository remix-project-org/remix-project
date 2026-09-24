import { TemplateGroup } from "@remix-ui/workspace"
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
    },
    {
      name: 'Chainlink CRE',
      items: [
        {
          value: "creAIPredictionMarket",
          displayName: 'AI Prediction Market',
          tagList: ["Solidity", "Chainlink"],
          description: 'A Yes/No prediction market using Chainlink CRE'
        },
        {
          value: "creWorldCupPredictionMarket",
          displayName: 'World Cup Prediction Market',
          tagList: ["Solidity", "Chainlink"],
          description: 'A 1X2 sports prediction market using Chainlink CRE'
        }
      ]
    },
    {
      name: 'DeFi Protocols',
      items: [
        {
          value: "erc4626Vault",
          displayName: 'ERC-4626 Tokenized Vault',
          tagList: ["DeFi", "ERC4626", "Solidity"],
          description: 'Yield-bearing vault following the ERC-4626 standard (Yearn, Aave aTokens)'
        },
        {
          value: "ammDex",
          displayName: 'AMM / DEX Pool',
          tagList: ["DeFi", "AMM", "Solidity"],
          description: 'Constant-product AMM (x*y=k) with LP tokens and 0.3% swap fee (Uniswap V2 style)'
        },
        {
          value: "lendingProtocol",
          displayName: 'Lending & Borrowing Pool',
          tagList: ["DeFi", "Lending", "Solidity"],
          description: 'Utilization-based lending pool with collateral and liquidation (Compound/Aave style)'
        },
        {
          value: "stablecoin",
          displayName: 'Collateralized Stablecoin (CDP)',
          tagList: ["DeFi", "Stablecoin", "Solidity"],
          description: 'Collateralized Debt Position system that mints a USD-pegged stablecoin (MakerDAO style)'
        },
        {
          value: "derivativesProtocol",
          displayName: 'Derivatives & Synthetics',
          tagList: ["DeFi", "Derivatives", "Solidity"],
          description: 'Perpetual futures with funding rates + European options with cash settlement (dYdX, GMX, Opyn style)'
        },
        {
          value: "yieldAggregator",
          displayName: 'Yield Aggregator Vault',
          tagList: ["DeFi", "Yield", "Solidity"],
          description: 'Auto-compounding ERC-4626 vault with keeper-based harvesting (Yearn style)'
        }
      ]
    },
    {
      name: 'Governance & Identity',
      items: [
        {
          value: "daoGovernance",
          displayName: 'DAO Governance',
          tagList: ["DAO", "Governance", "Solidity"],
          description: 'On-chain Governor with timelock: propose, vote, queue, and execute (OpenZeppelin Governor)'
        },
        {
          value: "ensSystem",
          displayName: 'ENS Registry & Resolver',
          tagList: ["ENS", "Identity", "Solidity"],
          description: 'Ethereum Name Service registry and public resolver for human-readable names'
        }
      ]
    },
    {
      name: 'Account Abstraction & Proxies',
      items: [
        {
          value: "erc4337Account",
          displayName: 'ERC-4337 Smart Wallet',
          tagList: ["AA", "ERC4337", "Solidity"],
          description: 'Account abstraction wallet, factory, and paymaster following ERC-4337'
        },
        {
          value: "proxyPatterns",
          displayName: 'Proxy & Upgradeability Patterns',
          tagList: ["Proxy", "Upgradeable", "Solidity"],
          description: 'All three proxy patterns: Transparent, UUPS, and Beacon proxies with example implementations'
        }
      ]
    },
    {
      name: 'NFT & Bridges',
      items: [
        {
          value: "nftMarketplace",
          displayName: 'NFT Marketplace',
          tagList: ["NFT", "Marketplace", "Solidity"],
          description: 'Fixed-price NFT marketplace with EIP-2981 royalties and protocol fees (Seaport inspired)'
        },
        {
          value: "crossChainBridge",
          displayName: 'Cross-Chain Bridge',
          tagList: ["Bridge", "L2", "Solidity"],
          description: 'Lock-and-mint bridge connecting L1 and L2 (Arbitrum/Optimism canonical bridge pattern)'
        }
      ]
    }
  ]
}
