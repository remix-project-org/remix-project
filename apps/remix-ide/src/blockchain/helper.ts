const transactionDetailsLinks = {
  Main: 'https://www.etherscan.io/tx/',
  Sepolia: 'https://sepolia.etherscan.io/tx/'
}

export function etherScanLink (network: string, hash: string): string {
  if (transactionDetailsLinks[network]) {
    return transactionDetailsLinks[network] + hash
  }
}

/**
 * Get the block scout url for a given chain id and tx hash
 * @param chainId - The chain id
 * @param txHash - The tx hash
 * @returns The block scout url
 */
export async function getBlockScoutUrl(chainId: number, txHash: string) {
  const chain = await fetch('https://raw.githubusercontent.com/blockscout/chainscout/refs/heads/main/data/chains.json')
  const response = await chain.json()
  const data = response[chainId]
  return data ? `${data.explorers[0].url}/tx/${txHash}` : null
}
