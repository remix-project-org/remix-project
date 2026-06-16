export const PLACEHOLDER_STAMP = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

export function encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

export function decode(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

export function remove0x(hex: string): string {
  return (hex.startsWith('0x') ? hex.slice(2) : hex).toLowerCase()
}

export async function retryAwaitableAsync<T>(fn: () => Promise<T>, retries = 3, delay = 250): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (retries <= 0) throw err
    await new Promise(r => setTimeout(r, delay))
    return retryAwaitableAsync(fn, retries - 1, delay)
  }
}

export function indexStrToBigint(indexStr?: string): bigint | undefined {
  if (!indexStr) return undefined
  const isHex = /[a-fA-F]/.test(indexStr) || indexStr.startsWith('0') || indexStr.length > 10
  return isHex ? BigInt(parseInt(indexStr, 16)) : BigInt(parseInt(indexStr, 10))
}
