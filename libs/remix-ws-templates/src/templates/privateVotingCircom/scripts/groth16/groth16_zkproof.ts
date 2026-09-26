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
    const r1csBuffer = await remix.call('fileManager', 'readFile', 'circuits/.bin/private_voting.r1cs', { encoding: null });
    // @ts-ignore
    const r1cs = new Uint8Array(r1csBuffer);
    // @ts-ignore
    await remix.call('circuit-compiler', 'compile', 'circuits/private_voting.circom');
    // @ts-ignore
    const wasmBuffer = await remix.call('fileManager', 'readFile', 'circuits/.bin/private_voting_js/private_voting.wasm', { encoding: null });
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

    const voterSecret = BigInt('123456789')
    const voteOption = '1'
    const proposalId = '1'
    const zeroHash = poseidon([BigInt(0)])

    // Compute identity commitment
    const identityCommitment = poseidon([voterSecret])

    // Build a simple tree where this identity is leaf 0
    const pathElements = Array(20).fill(zeroHash.toString())
    const pathIndices = Array(20).fill('0')

    let currentHash = identityCommitment
    for (let i = 0; i < 20; i++) {
      currentHash = poseidon([currentHash, zeroHash])
    }
    const root = currentHash

    // Compute nullifier hash
    const nullifierHash = poseidon([voterSecret, BigInt(proposalId)])

    const signals = {
      voterSecret: voterSecret.toString(),
      voteOption,
      pathElements,
      pathIndices,
      root: root.toString(),
      nullifierHash: nullifierHash.toString(),
      proposalId
    }

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
