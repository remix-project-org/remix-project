import { ethers, BigNumber } from 'ethers'
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
    await remix.call('circuit-compiler', 'compile', 'circuits/tornado_cash.circom');
    // @ts-ignore
    const wasmBuffer = await remix.call('fileManager', 'readFile', 'circuits/.bin/tornado_cash_js/tornado_cash.wasm', { encoding: null });
    // @ts-ignore
    const wasm = new Uint8Array(wasmBuffer);
    const zkey_final = {
      type: "mem",
      // @ts-ignore
      data: new Uint8Array(JSON.parse(await remix.call('fileManager', 'readFile', 'scripts/plonk/zk/keys/zkey_final.txt')))
    }

    const wtns = { type: "mem" };

    const nullifier = BigInt('111222333444555')
    const secret = BigInt('999888777666555')
    const zeroHash = poseidon([BigInt(0)])
    const commitment = poseidon([nullifier, secret])
    const nullifierHash = poseidon([nullifier])
    const pathElements = Array(20).fill(zeroHash.toString())
    const pathIndices = Array(20).fill('0')
    let currentHash = commitment
    for (let i = 0; i < 20; i++) {
      currentHash = poseidon([currentHash, zeroHash])
    }
    const root = currentHash

    const signals = {
      nullifier: nullifier.toString(), secret: secret.toString(),
      pathElements, pathIndices, root: root.toString(),
      nullifierHash: nullifierHash.toString(),
      recipient: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      relayer: '0', fee: '0', refund: '0'
    }

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
