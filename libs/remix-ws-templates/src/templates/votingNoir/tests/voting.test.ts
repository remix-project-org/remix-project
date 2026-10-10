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

describe('Anonymous Voting', () => {
  it('should compile, execute, prove, and verify', async () => {
    const noir_program = await getCircuit()

    // Pre-compute commitment and nullifier using nargo or the Noir stdlib:
    //   commitment = pedersen([voter_secret, vote_option, nonce])[0]
    //   nullifier  = pedersen([voter_secret])[0]
    // Replace the placeholder strings below with the computed Field values.
    const inputs = {
      voter_secret: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      vote_option: '1',
      nonce: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      nullifier: '', // <-- replace with pedersen([voter_secret])[0]
      commitment: '', // <-- replace with pedersen([voter_secret, vote_option, nonce])[0]
    }

    const program = new Noir(noir_program)
    const { witness } = await program.execute(inputs)
    const backend = new UltraPlonkBackend(noir_program.bytecode)
    const proof = await backend.generateProof(witness)
    const verified = await backend.verifyProof(proof)
    expect(verified, 'Proof fails verification in JS').to.be.true
  })
})
