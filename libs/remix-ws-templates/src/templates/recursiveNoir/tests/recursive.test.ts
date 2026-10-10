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

describe('Recursive Proof (Inner Circuit)', () => {
  it('compiles, proves, and verifies the inner circuit', async () => {
    const noir_program = await getCircuit()

    // Provide a preimage and its corresponding Pedersen hash.
    // Compute expected_hash with: nargo execute --show-output
    const inputs = {
      preimage: '42',
      expected_hash: '', // <-- replace with pedersen([42])[0]
    }

    const program = new Noir(noir_program)
    const { witness } = await program.execute(inputs)
    const backend = new UltraPlonkBackend(noir_program.bytecode)
    const proof = await backend.generateProof(witness)

    // This proof can be passed to an outer circuit for aggregation
    console.log('Inner proof generated. Use proof + vk to build a recursive outer circuit.')

    const verified = await backend.verifyProof(proof)
    expect(verified, 'Inner proof fails verification').to.be.true
  })
})
