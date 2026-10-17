// eslint-disable-next-line @typescript-eslint/no-var-requires
const snarkjs = require('snarkjs');

const logger = {
  info: (...args) => console.log(...args),
  debug: (...args) => console.log(...args)
};

(async () => {
  try {
    // @ts-ignore
    await remix.call('circuit-compiler', 'generateR1cs', 'circuits/merkle_proof.circom');

    const ptau_final = "https://ipfs-cluster.ethdevops.io/ipfs/QmTiT4eiYz5KF7gQrDsgfCSTRv3wBPYJ4bRN1MmTRshpnW";
    // @ts-ignore
    const r1csBuffer = await remix.call('fileManager', 'readFile', 'circuits/.bin/merkle_proof.r1cs', { encoding: null });
    // @ts-ignore
    const r1cs = new Uint8Array(r1csBuffer);
    const zkey_0 = { type: "mem" };
    const zkey_1 = { type: "mem" };
    const zkey_final = { type: "mem" };

    console.log('newZkey')
    await snarkjs.zKey.newZKey(r1cs, ptau_final, zkey_0);
    console.log('contribute')
    await snarkjs.zKey.contribute(zkey_0, zkey_1, "p2_C1", "pa_Entropy1");
    console.log('beacon')
    await snarkjs.zKey.beacon(zkey_1, zkey_final, "B3", "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20", 10);
    console.log('verifyFromR1cs')
    const verifyFromR1csResult = await snarkjs.zKey.verifyFromR1cs(r1cs, ptau_final, zkey_final);
    console.assert(verifyFromR1csResult);
    console.log('verifyFromInit')
    const verifyFromInit = await snarkjs.zKey.verifyFromInit(zkey_0, ptau_final, zkey_final);
    console.assert(verifyFromInit);
    console.log('exportVerificationKey')
    const vKey = await snarkjs.zKey.exportVerificationKey(zkey_final)
    // @ts-ignore
    await remix.call('fileManager', 'writeFile', 'scripts/groth16/zk/keys/verification_key.json', JSON.stringify(vKey, null, 2))
    console.log('save zkey_final')
    // @ts-ignore
    await remix.call('fileManager', 'writeFile', 'scripts/groth16/zk/keys/zkey_final.txt', JSON.stringify(Array.from(((zkey_final as any).data))))
    console.log('setup done.')
  } catch (e) {
    console.error(e.message)
  }
})()
