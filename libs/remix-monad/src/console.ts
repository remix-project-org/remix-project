import { AbiCoder } from 'ethers'
import { ConsoleLogs } from '@remix-project/remix-lib'

/** Decode the console ABI shared by Remix's terminal and Solidity test runner. */
export function decodeConsoleCalls(calls: string[] = []): (string | boolean)[][] {
  const logs: (string | boolean)[][] = []
  for (const payload of calls) {
    const signature = ConsoleLogs[parseInt(payload.slice(2, 10), 16)]
    if (!signature) continue
    try {
      const types = signature.slice(1, -1).split(',').filter(Boolean)
      const args = AbiCoder.defaultAbiCoder().decode(types, '0x' + payload.slice(10))
      logs.push(args.map(value => typeof value === 'bigint' ? value.toString() : value))
    } catch {
      // An unknown or malformed diagnostic payload must not fail the transaction.
    }
  }
  return logs
}
