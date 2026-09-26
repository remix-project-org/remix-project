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
    const r1csBuffer = await remix.call('fileManager', 'readFile', 'circuits/.bin/sudoku.r1cs', { encoding: null });
    // @ts-ignore
    const r1cs = new Uint8Array(r1csBuffer);
    // @ts-ignore
    await remix.call('circuit-compiler', 'compile', 'circuits/sudoku.circom');
    // @ts-ignore
    const wasmBuffer = await remix.call('fileManager', 'readFile', 'circuits/.bin/sudoku_js/sudoku.wasm', { encoding: null });
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

    // Valid 9x9 Sudoku solution and puzzle
    const solution = [
      [5,3,4,6,7,8,9,1,2],
      [6,7,2,1,9,5,3,4,8],
      [1,9,8,3,4,2,5,6,7],
      [8,5,9,7,6,1,4,2,3],
      [4,2,6,8,5,3,7,9,1],
      [7,1,3,9,2,4,8,5,6],
      [9,6,1,5,3,7,2,8,4],
      [2,8,7,4,1,9,6,3,5],
      [3,4,5,2,8,6,1,7,9]
    ]
    const puzzle = [
      [5,3,0,0,7,0,0,0,0],
      [6,0,0,1,9,5,0,0,0],
      [0,9,8,0,0,0,0,6,0],
      [8,0,0,0,6,0,0,0,3],
      [4,0,0,8,0,3,0,0,1],
      [7,0,0,0,2,0,0,0,6],
      [0,6,0,0,0,0,2,8,0],
      [0,0,0,4,1,9,0,0,5],
      [0,0,0,0,8,0,0,7,9]
    ]

    const signals = { solution, puzzle }

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
