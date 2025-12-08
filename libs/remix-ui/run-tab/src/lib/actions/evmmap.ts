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
  | 'osaka'
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
  ['osaka', {
    chainId: [
    ],
    minCompilerVersion: "v0.8.31+commit.fd3a2265",
    evmVersion: 'osaka'
  }],
  ['prague', {
    chainId: [
    ],
    minCompilerVersion: "0.8.24+commit.e11b9ed9",
    evmVersion: 'prague'
  }],
  ['cancun', {
    chainId: [
      { id: 5, name: "Goerli" },
    ],
    minCompilerVersion: "0.8.24+commit.e11b9ed9",
    evmVersion: 'cancun'
  }],
  ['shanghai', {
    chainId: [
      { id: 5, name: "Goerli" },
    ],
    minCompilerVersion: "0.8.20+commit.a1b79de6",
    evmVersion: 'shanghai'
  }],
  ['paris', {
    chainId: [
      { id: 5, name: "Goerli" },
    ],
    minCompilerVersion: "0.8.18+commit.87f61d96",
    evmVersion: 'paris'
  }],
  ['london', {
    chainId: [
      { id: 5, name: "Goerli" },
    ],
    minCompilerVersion: "0.8.7+commit.e28d00a7",
    evmVersion: 'london'
  }],
  ['berlin', {
    chainId: [
      { id: 5, name: "Goerli" },
    ],
    minCompilerVersion: "0.8.5+commit.a4f2e591",
    evmVersion: 'berlin'
  }],
  ['istanbul', {
    chainId: [
      { id: 5, name: "Goerli" },
    ],
    minCompilerVersion: "0.5.14+commit.01f1aaa4",
    evmVersion: 'istanbul'
  }],
  ['petersburg', {
    chainId: [
      { id: 5, name: "Goerli" },
    ],
    minCompilerVersion: "0.5.5+commit.47a71e8f",
    evmVersion: 'petersburg'
  }],
  ['constantinople', {
    chainId: [
      { id: 5, name: "Goerli" },
    ],
    minCompilerVersion: "0.5.5+commit.47a71e8f",
    evmVersion: 'constantinople'
  }],
  ['byzantium', {
    chainId: [
      { id: 5, name: "Goerli" },
    ],
    minCompilerVersion: "0.4.21+commit.dfe3193c",
    evmVersion: 'byzantium'
  }],
  ['spuriousDragon', {
    chainId: [
      { id: 5, name: "Goerli" },
    ],
    minCompilerVersion: "0.4.9+commit.364da425",
    evmVersion: 'spuriousDragon'
  }],
  ['tangerineWhistle', {
    chainId: [
      { id: 5, name: "Goerli" },
    ],
    minCompilerVersion: "0.4.0+commit.acd334c9",
    evmVersion: 'tangerineWhistle'
  }],
  ['homestead', {
    chainId: [
      { id: 5, name: "Goerli" },
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
