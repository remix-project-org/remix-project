# Age Verifier (Circom)

A zero-knowledge circuit that proves a user's age satisfies a minimum requirement without revealing the actual age.

## Circuit: `age_verifier.circom`

**Private inputs:** `age`, `secret`  
**Public inputs:** `minAge`, `commitment`

The circuit uses Poseidon hash to bind `age` to a commitment (`Poseidon(age, secret)`), then proves `age >= minAge` using `GreaterEqThan` from circomlib — without revealing `age` itself.

## Workflow

### 1. Trusted Setup

Run **one** of:
- `scripts/groth16/groth16_trusted_setup.ts` — Groth16 (requires per-circuit ceremony)
- `scripts/plonk/plonk_trusted_setup.ts` — PLONK (universal setup, no ceremony)

This generates the proving/verification keys in `zk/keys/`.

### 2. Generate Proof

Run the matching zkproof script:
- `scripts/groth16/groth16_zkproof.ts`
- `scripts/plonk/plonk_zkproof.ts`

Outputs a Solidity verifier (`zk/build/zk_verifier.sol`) and proof inputs (`zk/build/input.json`).

### 3. Deploy & Verify On-Chain

Deploy the generated `zk_verifier.sol` and call `verifyProof` with the proof inputs from `input.json`.

## Dependencies

- `circomlib` — `comparators.circom`, `poseidon.circom`
- `snarkjs` — witness calculation, proving, verification
- `circomlibjs` — Poseidon hash in JS for witness generation
