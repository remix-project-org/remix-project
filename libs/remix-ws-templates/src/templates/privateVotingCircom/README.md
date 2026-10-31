# Private Voting (Circom)

A zero-knowledge voting circuit that lets registered voters cast ballots anonymously while preventing double-voting.

## Circuit: `private_voting.circom`

**Private inputs:** `voterSecret`, `pathElements[20]`, `pathIndices[20]`  
**Public inputs:** `root`, `nullifierHash`, `proposalId`, `voteOption`

The circuit:
1. Computes `identityCommitment = Poseidon(voterSecret)` and verifies it belongs to the voter registry Merkle tree
2. Computes `nullifierHash = Poseidon(voterSecret, proposalId)` to prevent double-voting without linking to identity
3. Exposes `voteOption` publicly so the vote can be counted on-chain

## Workflow

### 1. Trusted Setup

Run **one** of:
- `scripts/groth16/groth16_trusted_setup.ts` — Groth16
- `scripts/plonk/plonk_trusted_setup.ts` — PLONK

### 2. Generate Proof

Run the matching zkproof script. The nullifier prevents the same voter from voting twice on the same proposal.

### 3. Deploy & Verify On-Chain

The smart contract checks: proof validity, nullifier not already used, root matches current registry.

## Dependencies

- `circomlib` — `mux1.circom`, `poseidon.circom`
- `snarkjs` — witness calculation, proving, verification
- `circomlibjs` — Poseidon hash in JS
