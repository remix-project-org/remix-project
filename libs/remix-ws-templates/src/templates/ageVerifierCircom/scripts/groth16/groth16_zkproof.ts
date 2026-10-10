import { poseidon } from "circomlibjs" // v0.0.8

// eslint-disable-next-line @typescript-eslint/no-var-requires
const snarkjs = require('snarkjs');

const logger = {
  info: (...args) => console.log(...args),
  debug: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
};

(async () => {
  try {
    // @ts-ignore
    const r1csBuffer = await remix.call('fileManager', 'readFile', 'circuits/.bin/age_verifier.r1cs', { encoding: null });
    // @ts-ignore
    const r1cs = new Uint8Array(r1csBuffer);
    // @ts-ignore
    await remix.call('circuit-compiler', 'compile', 'circuits/age_verifier.circom');
    // @ts-ignore
    const wasmBuffer = await remix.call('fileManager', 'readFile', 'circuits/.bin/age_verifier_js/age_verifier.wasm', { encoding: null });
    // @ts-ignore
    const wasm = new Uint8Array(wasmBuffer);

    const zkey_final = {
      type: "mem",
      // @ts-ignore
      data: new Uint8Array(JSON.parse(await remix.call('fileManager', 'readFile', 'scripts/groth16/zk/keys/zkey_final.txt')))
    }
    const wtns = { type: "mem" };
    // @ts-ignore
    const vKey = JSON.parse(await remix.call('fileManager', 'readFile', 'scripts/groth16/zk/keys/verification_key.json'))

    // Prove: age 25 satisfies minAge 18
    const age = '25'
    const secret = '12345'
    const minAge = '18'
    const commitment = poseidon([age, secret])

    const signals = { age, secret, minAge, commitment }

    console.log('calculate witness')
    await snarkjs.wtns.calculate(signals, wasm, wtns);
    console.log('check witness')
    await snarkjs.wtns.check(r1cs, wtns, logger);
    console.log('prove')
    const { proof, publicSignals } = await snarkjs.groth16.prove(zkey_final, wtns);
    const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof, logger);
    console.log('zk proof validity', verified);

    // @ts-ignore
    const templates = { groth16: await remix.call('fileManager', 'readFile', 'templates/groth16_verifier.sol.ejs') }
    const solidityContract = await snarkjs.zKey.exportSolidityVerifier(zkey_final, templates)
    // @ts-ignore
    await remix.call('fileManager', 'writeFile', 'scripts/groth16/zk/build/zk_verifier.sol', solidityContract)
    // @ts-ignore
    await remix.call('fileManager', 'writeFile', 'scripts/groth16/zk/build/input.json', JSON.stringify({
      _pA: [proof.pi_a[0], proof.pi_a[1]],
      _pB: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
      _pC: [proof.pi_c[0], proof.pi_c[1]],
      _pubSignals: publicSignals,
    }, null, 2))
  } catch (e) {
    console.error(e.message)
  }
})()
