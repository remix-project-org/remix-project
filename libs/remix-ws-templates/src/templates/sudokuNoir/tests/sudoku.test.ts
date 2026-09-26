// eslint-disable-next-line @typescript-eslint/no-var-requires
const { expect } = require('chai')
import { compile, createFileManager } from '@noir-lang/noir_wasm'
import { Noir } from '@noir-lang/noir_js'
import { UltraPlonkBackend } from '@aztec/bb.js'

async function getCircuit() {
  const fm = createFileManager('/')
  const circuit = await remix.call('fileManager', 'readFile', 'src/main.nr')
  const nargoToml = await remix.call('fileManager', 'readFile', 'Nargo.toml')
  await fm.writeFile('./src/main.nr', new Blob([new TextEncoder().encode(circuit)]).stream())
  await fm.writeFile('Nargo.toml', new Blob([new TextEncoder().encode(nargoToml)]).stream())
  const result = await compile(fm)
  if (!('program' in result)) throw new Error('Compilation failed')
  return result.program
}

describe('ZK Sudoku', () => {
  it('proves a valid 4x4 Sudoku solution without revealing it', async () => {
    const noir_program = await getCircuit()

    // Valid 4x4 Sudoku solution
    const solution = [
      ['1', '2', '3', '4'],
      ['3', '4', '1', '2'],
      ['2', '1', '4', '3'],
      ['4', '3', '2', '1'],
    ]
    // Puzzle: 0 = empty, non-zero = fixed given cell
    const puzzle = [
      ['1', '0', '3', '0'],
      ['0', '4', '0', '2'],
      ['2', '0', '0', '3'],
      ['0', '3', '2', '0'],
    ]

    const inputs = { solution, puzzle }
    const program = new Noir(noir_program)
    const { witness } = await program.execute(inputs)
    const backend = new UltraPlonkBackend(noir_program.bytecode)
    const proof = await backend.generateProof(witness)
    const verified = await backend.verifyProof(proof)
    expect(verified, 'Proof fails verification in JS').to.be.true
  })

  it('rejects a wrong solution', async () => {
    const noir_program = await getCircuit()
    // Invalid: row 0 has duplicate values
    const solution = [
      ['1', '1', '3', '4'],
      ['3', '4', '1', '2'],
      ['2', '1', '4', '3'],
      ['4', '3', '2', '1'],
    ]
    const puzzle = [
      ['0', '0', '0', '0'],
      ['0', '0', '0', '0'],
      ['0', '0', '0', '0'],
      ['0', '0', '0', '0'],
    ]
    const program = new Noir(noir_program)
    let threw = false
    try {
      await program.execute({ solution, puzzle })
    } catch (_) {
      threw = true
    }
    expect(threw, 'Should reject invalid solution').to.be.true
  })
})
