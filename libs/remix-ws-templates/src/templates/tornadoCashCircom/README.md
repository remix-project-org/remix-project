# Tornado Cash Circuit (Circom)

An educational implementation of the Tornado Cash privacy protocol circuit — deposit/withdraw with unlinkable transactions.

## Circuit: `tornado_cash.circom`

**Private inputs:** `nullifier`, `secret`, `pathElements[20]`, `pathIndices[20]`  
**Public inputs:** `root`, `nullifierHash`, `recipient`, `relayer`, `fee`, `refund`

The circuit:
1. Computes `commitment = Poseidon(nullifier, secret)` and verifies it is in the deposit Merkle tree
2. Exposes `nullifierHash = Poseidon(nullifier)` to prevent double-spending without linking to the deposit
3. Binds `recipient`, `relayer`, `fee`, `refund` into the proof to prevent front-running

This breaks the on-chain link between depositor and withdrawer.

## Workflow

### 1. Trusted Setup

Run **one** of:
- `scripts/groth16/groth16_trusted_setup.ts` — Groth16
- `scripts/plonk/plonk_trusted_setup.ts` — PLONK

### 2. Generate Proof

Run the matching zkproof script with a `nullifier` + `secret` pair. The script builds the Merkle tree with the commitment as a leaf.

### 3. Deploy & Verify On-Chain

The contract checks: proof validity, nullifier not spent, root is a known historical root.

## Note

This is an educational template demonstrating the ZK circuit pattern. It is not a production-ready mixer.

## Dependencies

- `circomlib` — `mux1.circom`, `poseidon.circom`
- `snarkjs` — witness calculation, proving, verification
- `circomlibjs` — Poseidon hash in JS
