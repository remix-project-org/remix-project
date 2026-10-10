import { ethers, BigNumber } from 'ethers'

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
    await remix.call('circuit-compiler', 'compile', 'circuits/sudoku.circom');
    // @ts-ignore
    const wasmBuffer = await remix.call('fileManager', 'readFile', 'circuits/.bin/sudoku_js/sudoku.wasm', { encoding: null });
    // @ts-ignore
    const wasm = new Uint8Array(wasmBuffer);
    const zkey_final = {
      type: "mem",
      // @ts-ignore
      data: new Uint8Array(JSON.parse(await remix.call('fileManager', 'readFile', 'scripts/plonk/zk/keys/zkey_final.txt')))
    }

    const wtns = { type: "mem" };

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
    await snarkjs.wtns.calculate(signals, wasm, wtns, logger);

    const { proof, publicSignals } = await snarkjs.plonk.prove(zkey_final, wtns);
    // @ts-ignore
    const vKey = JSON.parse(await remix.call('fileManager', 'readFile', 'scripts/plonk/zk/keys/verification_key.json'))
    const verified = await snarkjs.plonk.verify(vKey, publicSignals, proof);
    console.log('zk proof validity', verified);

    // @ts-ignore
    const templates = { plonk: await remix.call('fileManager', 'readFile', 'templates/plonk_verifier.sol.ejs') }
    const solidityContract = await snarkjs.zKey.exportSolidityVerifier(zkey_final, templates)
    // @ts-ignore
    await remix.call('fileManager', 'writeFile', 'scripts/plonk/zk/build/zk_verifier.sol', solidityContract)
    // @ts-ignore
    await remix.call('fileManager', 'writeFile', 'scripts/plonk/zk/build/input.json', JSON.stringify({
      _proof: [
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.A[0]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.A[1]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.B[0]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.B[1]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.C[0]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.C[1]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.Z[0]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.Z[1]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.T1[0]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.T1[1]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.T2[0]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.T2[1]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.T3[0]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.T3[1]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.Wxi[0]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.Wxi[1]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.Wxiw[0]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.Wxiw[1]).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.eval_a).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.eval_b).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.eval_c).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.eval_s1).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.eval_s2).toHexString(), 32),
        ethers.utils.hexZeroPad(ethers.BigNumber.from(proof.eval_zw).toHexString(), 32),
      ],
      _pubSignals: publicSignals
    }, null, 2))

    console.log('proof done.')
  } catch (e) {
    console.error(e.message)
  }
})()
