# Merkle Proof (Circom)

A zero-knowledge circuit that proves membership in a Merkle tree without revealing the leaf value or its position.

## Circuit: `merkle_proof.circom`

**Private inputs:** `leaf`, `pathElements[20]`, `pathIndices[20]`  
**Public inputs:** `root`

The circuit recomputes the Merkle root from the leaf and sibling path using Poseidon hash at each level, then asserts it equals the known `root`. The prover knows a leaf is in the tree without revealing which one.

## Workflow

### 1. Trusted Setup

Run **one** of:
- `scripts/groth16/groth16_trusted_setup.ts` — Groth16
- `scripts/plonk/plonk_trusted_setup.ts` — PLONK

### 2. Generate Proof

Run the matching zkproof script. It builds a depth-20 Merkle tree with a single real leaf (`Poseidon(42)`), all other nodes using `zeroHash = Poseidon(0)`.

### 3. Deploy & Verify On-Chain

Deploy `zk/build/zk_verifier.sol` and call `verifyProof` with the root and proof.

## Dependencies

- `circomlib` — `mux1.circom`, `poseidon.circom`
- `snarkjs` — witness calculation, proving, verification
- `circomlibjs` — Poseidon hash in JS
