# CIRCOM ZKP RLN Workspace

Welcome to the Remix Circom ZKP RLN Workspace.

RLN is a zero-knowledge gadget that enables spam prevention in anonymous environments.
To learn more about RLN and how it works, check out the [documentation](https://rate-limiting-nullifier.github.io/rln-docs/).

The workspace comprises two main directories:

## Circuits

Contains sample RLN circuits. These can be compiled to generate a witness using the **Circom ZKP Compiler** plugin.

## Scripts

Provides a sample script for a trusted setup using snarkjs. The script also generates Solidity code for on-chain deployment.

## First Steps

### 1) Compile the RLN Circuit

Use the Remix Circom compiler to compile the circuit. This will generate the required artifacts.

### 2) Run `run_setup.ts`

This step generates a verification key and a Solidity contract for on-chain verification.

> **Note:** This setup is intended for development purposes only, as it is heavily centralized.

Outputs:

- Verification key: `./zk/build/verification_key.json`
- ZK setup file: `./zk/build/zk_setup.txt`

### 3) Run `run_verification.ts`

This script:

- Creates a list of identity commitments and adds them to an `IncrementalMerkleTree`. The tree is used to generate a Merkle proof that a specified identity is in the tree (see `tree.createProof(0)`).
- Generates a witness and a proof of execution with `messageId` equal to `0`.
- Generates 2 proofs (two different messages) with the same `messageId`, which reveals the two points of the polynomial needed to deduce the `identitySecret` (using `shamirRecovery`).
