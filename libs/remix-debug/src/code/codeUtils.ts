'use strict'
import { util } from '@remix-project/remix-lib'
import { Common, Mainnet } from '@ethereumjs/common'
import { getOpcodesForHF, paramsEVM } from '@ethereumjs/evm'
import getOpcodes from './opcodes'
import { monadOpcodeAt, MONAD_OPCODE_BASE_HARDFORKS } from './monadOpcodes'

function getOpcodeTable (hardfork: string) {
  const opcodeBaseHardfork = MONAD_OPCODE_BASE_HARDFORKS.get(hardfork) ?? hardfork
  const common = new Common({ chain: Mainnet, hardfork: opcodeBaseHardfork, params: paramsEVM })
  return getOpcodesForHF(common).opcodes
}

export function nameOpCodes (raw, hardfork) {
  const opcodes = getOpcodeTable(hardfork)

  let pushData = ''
  const codeMap = {}
  const code = []

  for (let i = 0; i < raw.length; i++) {
    const pc = i
    let curOpCode
    const extension = monadOpcodeAt(raw, pc, hardfork)
    try {
      curOpCode = extension ? extension.name : opcodes.get(raw[pc]).fullName
    } catch (e) {
      curOpCode = 'INVALID'
    }
    codeMap[i] = code.length
    if (extension) i++
    // no destinations into the middle of PUSH
    if (curOpCode.slice(0, 4) === 'PUSH') {
      const jumpNum = raw[pc] - 0x5f
      pushData = raw.slice(pc + 1, pc + jumpNum + 1)
      i += jumpNum
    }
    const hexCode = pushData ? util.bytesToHex((pushData as any)) : ''
    // @ts-ignore
    const data = hexCode !== '' ? ' ' + hexCode : ''

    code.push(pad(pc, roundLog(raw.length, 10)) + ' ' + curOpCode + data)
    pushData = ''
  }
  return [code, codeMap]
}

type Opcode = {
  name: string,
  pushData?: Array<number>
  in?: number
  out?: number
}
/**
 * Parses code as a list of integers into a list of objects containing
 * information about the opcode.
 */
export function parseCode (raw, hardfork = 'osaka') {
  const opcodes = getOpcodeTable(hardfork)

  const code = []
  for (let i = 0; i < raw.length; i++) {
    const extension = monadOpcodeAt(raw, i, hardfork)
    if (extension) {
      code.push(extension)
      i++
      continue
    }
    const opcode: Opcode = { name: 'INVALID' }
    try {
      const code = opcodes.get(raw[i])
      const opcodeDetails = getOpcodes(raw[i], false)
      opcode.in = opcodeDetails.in
      opcode.out = opcodeDetails.out
      opcode.name = code.fullName
    } catch (e) {
      opcode.name = 'INVALID'
    }
    if (opcode.name.slice(0, 4) === 'PUSH') {
      const length = raw[i] - 0x5f
      opcode.pushData = raw.slice(i + 1, i + length + 1)
      // in case pushdata extends beyond code
      if (i + 1 + length > raw.length) {
        for (let j = opcode['pushData'].length; j < length; j++) {
          opcode['pushData'].push(0)
        }
      }
      i += length
    }
    code.push(opcode)
  }
  return code
}

export function pad (num, size) {
  let s = num + ''
  while (s.length < size) s = '0' + s
  return s
}

export function log (num, base) {
  return Math.log(num) / Math.log(base)
}

export function roundLog (num, base) {
  return Math.ceil(log(num, base))
}
