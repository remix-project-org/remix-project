# CIRCOM ZKP Hash Checker Workspace

Welcome to the Remix Circom ZKP Hash Checker Workspace.

The workspace comprises two main directories:

## Circuits

Contains sample Hash Checker circuits. These can be compiled to generate a witness using the **Circom ZKP Compiler** plugin.

## Scripts

Provides sample scripts for a trusted setup using snarkjs. The scripts also generate Solidity code for on-chain deployment. Two proving schemes are available: **Groth16** and **Plonk**.

## First Steps

### 1) Compile the Hash Checker Circuit

Use the Remix Circom compiler to compile the circuit. This will generate the required artifacts.

### 2) Run `groth16_trusted_setup.ts` (Found In `scripts/groth16`)

This step generates a verification key and a Solidity contract for on-chain verification.

> **Note:** This setup is intended for development purposes only, as it is heavily centralized.

Outputs:

- Verification key: `./zk/build/groth16/verification_key.json`
- Proof generation key: `./zk/build/groth16/zkey_final.txt`

### 3) Run `groth16_zkproof.ts` (Found In `scripts/groth16`)

This script:

- Generates a witness and a proof of execution. The input parameters of `snarkjs.wtns.calculate` are:
  - 4 private values — we want to prove knowledge of a hash satisfying these 4 values.
  - 1 public signal — the hash itself.

  The witness is generated only if the provided hash is the Poseidon hash of the 4 values.

- Verifies that the proof is valid using `snarkjs.groth16.verify`.

> The steps above for Groth16 also apply to the Plonk scripts in `scripts/plonk`.
