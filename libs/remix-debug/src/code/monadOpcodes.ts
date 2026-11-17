// Match monad-evm2's MonadHardfork::into_eth_spec: Eight uses Prague; Nine and later use Osaka.
// This selects standard debugger opcode metadata. The original Monad fork controls
// extension decoding; execution and gas accounting remain in monad-evm2js.
export const MONAD_OPCODE_BASE_HARDFORKS = new Map([
  ['monad-eight', 'prague'],
  ['monad-nine', 'osaka'],
  ['monad-ten', 'osaka'],
  ['monad-next', 'osaka']
])

export function isMonadFork(fork: unknown): boolean {
  return typeof fork === 'string' && MONAD_OPCODE_BASE_HARDFORKS.has(fork)
}

/** MIP-18 instructions using the MIP-7 prefix, active only in MonadNext. */
const MONAD_OPCODES = [
  { name: 'CALLSTACKDEPTH', in: 0, out: 1 },
  { name: 'CALLERN', in: 1, out: 1 }
]

export function monadOpcodeAt (raw: ArrayLike<number>, pc: number, hardfork: string) {
  if (hardfork !== 'monad-next' || raw[pc] !== 0xae) return undefined
  return MONAD_OPCODES[raw[pc + 1]]
}

export function monadOpcodeByName (name: string) {
  return MONAD_OPCODES.find(opcode => opcode.name === name)
}
