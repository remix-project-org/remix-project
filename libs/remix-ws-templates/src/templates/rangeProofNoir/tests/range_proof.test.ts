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

describe('Range Proof', () => {
  it('proves a value is within bounds without revealing it', async () => {
    const noir_program = await getCircuit()
    // Prove: 25 is in [18, 100] — e.g., age-of-majority check
    const inputs = { value: '25', min_bound: '18', max_bound: '100' }
    const program = new Noir(noir_program)
    const { witness } = await program.execute(inputs)
    const backend = new UltraPlonkBackend(noir_program.bytecode)
    const proof = await backend.generateProof(witness)
    const verified = await backend.verifyProof(proof)
    expect(verified, 'Proof fails verification in JS').to.be.true
  })

  it('rejects a value below the minimum bound', async () => {
    const noir_program = await getCircuit()
    const inputs = { value: '17', min_bound: '18', max_bound: '100' }
    const program = new Noir(noir_program)
    let threw = false
    try {
      await program.execute(inputs)
    } catch (_) {
      threw = true
    }
    expect(threw, 'Should reject value below min_bound').to.be.true
  })
})
