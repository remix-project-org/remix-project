# Recursive Proof in Noir

Demonstrates Noir's native recursive proof feature, where the proof of one circuit
can be verified inside another circuit. This enables proof aggregation and compression.

## How It Works
1. This "inner" circuit is marked `#[recursive]`.
2. Generate a proof of this circuit: `nargo prove`
3. In an "outer" circuit, call `std::verify_proof(vk, proof, public_inputs, key_hash)`
   to verify the inner proof as part of a larger computation.

## Inner Circuit Inputs
- **Private**: `preimage` — a secret value
- **Public**: `expected_hash` — its Pedersen hash

## Recursion Pattern

```noir
// Outer circuit (separate Nargo project):
fn main(
    verification_key: [Field; 114],
    proof: [Field; 93],
    public_inputs: pub [Field; 1],
    key_hash: pub Field
) {
    dep::std::verify_proof(
        verification_key.as_slice(),
        proof.as_slice(),
        public_inputs.as_slice(),
        key_hash
    );
    // ... additional constraints on public_inputs ...
}
```

## Steps
1. Run `tests/recursive.test.ts` to generate and verify the inner proof
2. Use the output proof + vk to build an outer aggregation circuit
