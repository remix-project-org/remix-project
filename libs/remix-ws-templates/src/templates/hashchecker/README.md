
## CIRCOM ZKP Hash Checker WORKSPACE

Welcome to the Remix Circom ZKP Hash Checker Workspace.

The workspace comprises two main directories:

### circuits: Contains sample Hash Checker contracts. These can be compiled to generate a witness using 'Circom ZKP Compiler' plugin.

### scripts: Provides a sample script designed for a trusted setup using snarkjs. This script also aids in generating Solidity code, which is essential for on-chain deployment. There are 2 script options to choose from: Groth16 and Plonk.

### first steps:

#### 1) compile the hash checker circuit using the remix circom compiler. This will generate artifacts.

#### 2) execute the file `groth16_trusted_setup.ts` found in `scripts/groth16` directory:

This step generates a verification key that can be used for generating proof, it will also generate a Solidity contract for on-chain verification.

Note that this section should only be used for development purposes as this way of running the setup is heavily centralized (although some pieces of this script can be used to achieve that).

This generates a verification key (`./zk/build/groth16/verification_key.json`) and a key for proof generation (`./zk/build/groth16/zkey_final.txt`).

#### 3) execute the file `groth16_zkproof.ts` found in `scripts/groth16`:

This script:

- generate a witness and a proof of execution. The input parameters of `snarkjs.wtns.calculate` are:

	- 4 values, that should remain private. We want to verify that we know a hash that satisfies these 4 values.
	- a hash, this is a public signal.

The witness will be generated only if the provided hash is the poseidon hash of these 4 values.

- verify that the proof is valid `(snarkjs.groth16.verify)`

#### The steps above for groth16 scripts also apply to plonk scripts.
