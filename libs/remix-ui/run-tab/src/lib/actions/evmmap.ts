export type ChainInfo = {
  id: number | string
  name: string
}

export type ChainCompatibleInfo = {
  chain: ChainInfo
  minCompilerVersion: string
  evmVersion: HardFork
}

export type HardFork =
  | 'prague'
  | 'cancun'
  | 'shanghai'
  | 'paris'
  | 'london'
  | 'berlin'
  | 'istanbul'
  | 'petersburg'
  | 'constantinople'
  | 'byzantium'
  | 'spuriousDragon'
  | 'tangerineWhistle'
  | 'homestead'

export const evmMap: Map<HardFork, { chainId: ChainInfo[], minCompilerVersion: string }> = new Map([
  ['prague', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" },
      { id: 100, name: "Gnosis Chain" },
      // { id: 10, name: "Optimism" },
      // { id: 56, name: "BNB Smart Chain Mainnet" },
      // { id: 100, name: "Gnosis Chain" },
      // { id: 137, name: "Polygon Mainnet" },
      // { id: 250, name: "Fantom Opera" },
      // { id: 300, name: "zkSync Era Mainnet" },
      // { id: 42161, name: "Arbitrum One" },
      // { id: 42170, name: "Arbitrum Nova" },
      // { id: 43114, name: "Avalanche C-Chain" },
      // { id: 42220, name: "Celo Mainnet" },
      // { id: 44787, name: "Celo Alfajores Testnet" },
      // { id: 59144, name: "Linea Mainnet" },
      // { id: 59141, name: "Linea Testnet" },
      // { id: 421614, name: "Arbitrum Sepolia" },
      // { id: 534352, name: "Scroll" },
      // { id: 11155111, name: "Sepolia" }
    ],
    minCompilerVersion: "0.8.24+commit.e11b9ed9",
    evmVersion: 'prague'
  }],
  ['cancun', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" },
      // { id: 5, name: "Goerli" },
      // { id: 10, name: "Optimism" },
      // { id: 56, name: "BNB Smart Chain Mainnet" },
      // { id: 100, name: "Gnosis Chain" },
      // { id: 137, name: "Polygon Mainnet" },
      // { id: 250, name: "Fantom Opera" },
      // { id: 300, name: "zkSync Era Mainnet" },
      // { id: 42161, name: "Arbitrum One" },
      // { id: 42170, name: "Arbitrum Nova" },
      // { id: 43114, name: "Avalanche C-Chain" },
      // { id: 42220, name: "Celo Mainnet" },
      // { id: 44787, name: "Celo Alfajores Testnet" },
      // { id: 59144, name: "Linea Mainnet" },
      // { id: 59141, name: "Linea Testnet" },
      // { id: 421614, name: "Arbitrum Sepolia" },
      // { id: 534352, name: "Scroll" },
      // { id: 11155111, name: "Sepolia" }
    ],
    minCompilerVersion: "0.8.24+commit.e11b9ed9",
    evmVersion: 'cancun'
  }],
  ['shanghai', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" },
      // { id: 5, name: "Goerli" },
      // { id: 10, name: "Optimism" },
      // { id: 30, name: "Rootstock Mainnet" },
      // { id: 56, name: "BNB Smart Chain Mainnet" },
      // { id: 100, name: "Gnosis Chain" },
      // { id: 137, name: "Polygon Mainnet" },
      // { id: 250, name: "Fantom Opera" },
      // { id: 300, name: "zkSync Era Mainnet" },
      // { id: 302, name: "zkSync Era Testnet" },
      // { id: 314, name: "Filecoin - Mainnet" },
      // { id: 324, name: "zkSync Era Mainnet" },
      // { id: 369, name: "PulseChain" },
      // { id: 388, name: "HALO Mainnet" },
      // { id: 1101, name: "Polygon zkEVM" },
      // { id: 1088, name: "Metis Andromeda Mainnet" },
      // { id: 1284, name: "Moonbeam" },
      // { id: 2000, name: "Dogechain Mainnet" },
      // { id: 42161, name: "Arbitrum One" },
      // { id: 42170, name: "Arbitrum Nova" },
      // { id: 42220, name: "Celo Mainnet" },
      // { id: 44787, name: "Celo Alfajores Testnet" },
      // { id: 59144, name: "Linea Mainnet" },
      // { id: 59141, name: "Linea Testnet" },
      // { id: 59902, name: "Metis Sepolia Testnet" },
      // { id: 421614, name: "Arbitrum Sepolia" },
      // { id: 534352, name: "Scroll" },
      // { id: 11155111, name: "Sepolia" },
      // { id: 11155420, name: "Optimism Sepolia Testnet" },
      // { id: 1666600000, name: "Harmony Mainnet Shard 0" }
    ],
    minCompilerVersion: "0.8.20+commit.a1b79de6",
    evmVersion: 'shanghai'
  }],
  ['paris', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" },
      // { id: 5, name: "Goerli" },
      // { id: 10, name: "Optimism" },
      // { id: 30, name: "Rootstock Mainnet" },
      // { id: 56, name: "BNB Smart Chain Mainnet" },
      // { id: 100, name: "Gnosis Chain" },
      // { id: 137, name: "Polygon Mainnet" },
      // { id: 250, name: "Fantom Opera" },
      // { id: 300, name: "zkSync Era Mainnet" },
      // { id: 302, name: "zkSync Era Testnet" },
      // { id: 314, name: "Filecoin - Mainnet" },
      // { id: 324, name: "zkSync Era Mainnet" },
      // { id: 369, name: "PulseChain" },
      // { id: 388, name: "HALO Mainnet" },
      // { id: 1088, name: "Metis Andromeda Mainnet" },
      // { id: 1101, name: "Polygon zkEVM" },
      // { id: 1284, name: "Moonbeam" },
      // { id: 2000, name: "Dogechain Mainnet" },
      // { id: 42220, name: "Celo Mainnet" },
      // { id: 42161, name: "Arbitrum One" },
      // { id: 42170, name: "Arbitrum Nova" },
      // { id: 44787, name: "Celo Alfajores Testnet" },
      // { id: 59144, name: "Linea Mainnet" },
      // { id: 59141, name: "Linea Testnet" },
      // { id: 59902, name: "Metis Sepolia Testnet" },
      // { id: 421614, name: "Arbitrum Sepolia" },
      // { id: 534352, name: "Scroll" },
      // { id: 11155111, name: "Sepolia" },
      // { id: 11155420, name: "Optimism Sepolia Testnet" },
      // { id: 1666600000, name: "Harmony Mainnet Shard 0" }
    ],
    minCompilerVersion: "0.8.18+commit.87f61d96",
    evmVersion: 'paris'
  }],
  ['london', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" },
      // { id: 5, name: "Goerli" },
      // { id: 10, name: "Optimism" },
      // { id: 25, name: "Cronos Mainnet" },
      // { id: 30, name: "Rootstock Mainnet" },
      // { id: 56, name: "BNB Smart Chain Mainnet" },
      // { id: 137, name: "Polygon Mainnet" },
      // { id: 250, name: "Fantom Opera" },
      // { id: 1280, name: "HALO Mainnet" },
      // { id: 42161, name: "Arbitrum One" },
      // { id: 42170, name: "Arbitrum Nova" },
      // { id: 42220, name: "Celo Mainnet" },
      // { id: 59144, name: "Linea Mainnet" },
      // { id: 59141, name: "Linea Testnet" },
      // { id: 11155111, name: "Sepolia" },
    ],
    minCompilerVersion: "0.8.7+commit.e28d00a7",
    evmVersion: 'london'
  }],
  ['berlin', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" },
      // { id: 5, name: "Goerli" },
      // { id: 10, name: "Optimism" },
      // { id: 25, name: "Cronos Mainnet" },
      // { id: 30, name: "Rootstock Mainnet" },
      // { id: 56, name: "BNB Smart Chain Mainnet" },
      // { id: 137, name: "Polygon Mainnet" },
      // { id: 250, name: "Fantom Opera" },
      // { id: 1280, name: "HALO Mainnet" },
      // { id: 42161, name: "Arbitrum One" },
      // { id: 42170, name: "Arbitrum Nova" },
      // { id: 42220, name: "Celo Mainnet" },
      // { id: 59144, name: "Linea Mainnet" },
      // { id: 59141, name: "Linea Testnet" },
      // { id: 11155111, name: "Sepolia" }
    ],
    minCompilerVersion: "0.8.5+commit.a4f2e591",
    evmVersion: 'berlin'
  }],
  ['istanbul', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" },
      // { id: 5, name: "Goerli" },
      // { id: 10, name: "Optimism" },
      // { id: 25, name: "Cronos Mainnet" },
      // { id: 30, name: "Rootstock Mainnet" },
      // { id: 56, name: "BNB Smart Chain Mainnet" },
      // { id: 137, name: "Polygon Mainnet" },
      // { id: 250, name: "Fantom Opera" },
      // { id: 1280, name: "HALO Mainnet" },
      // { id: 42161, name: "Arbitrum One" },
      // { id: 42170, name: "Arbitrum Nova" },
      // { id: 42220, name: "Celo Mainnet" },
      // { id: 59144, name: "Linea Mainnet" },
      // { id: 59141, name: "Linea Testnet" },
      // { id: 11155111, name: "Sepolia" }
    ],
    minCompilerVersion: "0.5.14+commit.01f1aaa4",
    evmVersion: 'istanbul'
  }],
  ['petersburg', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" },
      { id: 5, name: "Goerli" },
      { id: 11155111, name: "Sepolia" }
    ],
    minCompilerVersion: "0.5.5+commit.47a71e8f",
    evmVersion: 'petersburg'
  }],
  ['constantinople', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" },
      { id: 5, name: "Goerli" },
      { id: 11155111, name: "Sepolia" }
    ],
    minCompilerVersion: "0.5.5+commit.47a71e8f",
    evmVersion: 'constantinople'
  }],
  ['byzantium', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" }
    ],
    minCompilerVersion: "0.4.21+commit.dfe3193c",
    evmVersion: 'byzantium'
  }],
  ['spuriousDragon', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" }
    ],
    minCompilerVersion: "0.4.9+commit.364da425",
    evmVersion: 'spuriousDragon'
  }],
  ['tangerineWhistle', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" }
    ],
    minCompilerVersion: "0.4.0+commit.acd334c9",
    evmVersion: 'tangerineWhistle'
  }],
  ['homestead', {
    chainId: [
      { id: 1, name: "Ethereum Mainnet" },
      { id: 5, name: "Goerli" },
      { id: 11155111, name: "Sepolia" }
    ],
    minCompilerVersion: "0.1.2+commit.d0d36e3",
    evmVersion: 'homestead'
  }],
])

export function getCompatibleChains(fork: HardFork): ChainInfo[] {
  const forkData = evmMap.get(fork)
  return forkData ? forkData.chainId : []
}

export function isChainCompatible(fork: HardFork, chainId: number): boolean {
  const compatibleChains = getCompatibleChains(fork)
  return compatibleChains.some(chain => chain.id === chainId)
}

export function isChainCompatibleWithAnyFork(chainId: number, forks: HardFork[]): boolean {
  return forks.some(fork => isChainCompatible(fork, chainId))
}

export function getCompatibleChain(
  fork: HardFork,
  chainId: number
): ChainCompatibleInfo | undefined {

  for (const [forkKey, forkData] of evmMap) {
    const compatibleChain = forkData.chainId.find(chain => chain.id === chainId)
    if (compatibleChain) {
      return {
        chain: compatibleChain,
        minCompilerVersion: forkData.minCompilerVersion,
        evmVersion: forkKey
      }
    }
  }

  return undefined;
}
