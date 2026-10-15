import { isAddress, isHexString } from 'ethers'

export interface AbiInput {
  name: string
  type: string
  components?: AbiInput[]
}

export interface ParsedArgs {
  values: any[]
  /** error message per input index */
  errors: Record<number, string>
}

function parseValue (type: string, raw: string): any {
  const value = raw.trim()
  if (type.endsWith(']') || type.startsWith('tuple')) {
    try {
      return JSON.parse(value)
    } catch (e) {
      throw new Error('Expected JSON, e.g. ["0x…", "0x…"] or [1, 2]')
    }
  }
  if (type === 'bool') {
    if (value === 'true') return true
    if (value === 'false') return false
    throw new Error('Expected true or false')
  }
  if (type === 'address') {
    if (!isAddress(value)) throw new Error('Not a valid address')
    return value
  }
  if (/^u?int\d*$/.test(type)) {
    if (!/^-?(\d+|0x[0-9a-fA-F]+)$/.test(value)) throw new Error('Expected an integer')
    const n = BigInt(value)
    if (type.startsWith('uint') && n < BigInt(0)) throw new Error('Expected a positive integer')
    return n.toString()
  }
  if (/^bytes\d+$/.test(type)) {
    const size = parseInt(type.substring(5))
    if (!isHexString(value, size)) throw new Error(`Expected ${size} bytes in hex (0x…)`)
    return value
  }
  if (type === 'bytes') {
    if (!isHexString(value)) throw new Error('Expected hex (0x…)')
    return value
  }
  return raw // string
}

/** Parses the constructor inputs typed in the panel into values for the ABI encoder. */
export function parseConstructorArgs (inputs: AbiInput[], raw: string[]): ParsedArgs {
  const result: ParsedArgs = { values: [], errors: {} }
  inputs.forEach((input, index) => {
    const value = raw[index] ?? ''
    if (value.trim() === '' && input.type !== 'string') {
      result.errors[index] = 'Required'
      return
    }
    try {
      result.values.push(parseValue(input.type, value))
    } catch (e) {
      result.errors[index] = e.message
    }
  })
  return result
}

export function getConstructorInputs (abi: any[]): AbiInput[] {
  return (abi || []).find((item) => item.type === 'constructor')?.inputs || []
}
