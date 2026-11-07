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

describe('ZK KYC', () => {
  it('should compile, execute, prove, and verify', async () => {
    const noir_program = await getCircuit()

    // Pre-compute credential_hash = pedersen([age, nationality_code, document_secret])[0]
    // using nargo or the Noir stdlib, then replace the placeholder below.
    const inputs = {
      age: '25',
      nationality_code: '840',           // e.g., 840 = USA
      document_secret: '0xdeadbeef',
      credential_hash: '',               // <-- replace with pedersen([25, 840, 0xdeadbeef])[0]
      min_age: '18',
      required_nationality: '840',
      check_nationality: '1',            // 1 = enforce nationality, 0 = skip
    }

    const program = new Noir(noir_program)
    const { witness } = await program.execute(inputs)
    const backend = new UltraPlonkBackend(noir_program.bytecode)
    const proof = await backend.generateProof(witness)
    const verified = await backend.verifyProof(proof)
    expect(verified, 'Proof fails verification in JS').to.be.true
  })
})
