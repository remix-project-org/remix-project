// Build-time values only: never place private keys in NX_* variables.
export const ensSepolia = process.env.NX_ENS_NETWORK === 'sepolia'
export const ensParentName = process.env.NX_ENS_PARENT_NAME || 'remixcontract.eth'
export const ensDappParentName = process.env.NX_ENS_DAPP_PARENT_NAME || 'remixdapp.eth'

export function validateEnsEnvironment(baseUrl: string): void {
  if (!ensSepolia) return
  const base = new URL(baseUrl)
  if (!['http:', 'https:'].includes(base.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    throw new Error('ENS test mode requires a loopback API URL')
  }
  for (const name of [ensParentName, ensDappParentName]) {
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth$/.test(name) ||
        ['remixcontract.eth', 'remixdapp.eth'].some(root => name === root || name.endsWith(`.${root}`))) {
      throw new Error('ENS test mode requires explicit, non-production parent names')
    }
  }
}

/** Public eth.limo only serves mainnet names. */
export function ensWebsiteUrl(name: string): string {
  return ensSepolia ? '' : `https://${name}.limo`
}

export function ensTransactionUrl(hash: string, dapp = false): string {
  const host = dapp ? (ensSepolia ? 'sepolia.arbiscan.io' : 'arbiscan.io') : (ensSepolia ? 'sepolia.etherscan.io' : 'etherscan.io')
  return `https://${host}/tx/${hash}`
}
