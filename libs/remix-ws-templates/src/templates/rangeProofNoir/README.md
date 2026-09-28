# Range Proof in Noir

Proves that a private value lies within public bounds [min_bound, max_bound] without revealing the value.

## Use Cases
- Prove age >= 18 without revealing exact age
- Prove balance >= threshold without revealing balance
- Prove a score is within a valid range

## Inputs
- **Private**: `value` — the secret number to range-check
- **Public**: `min_bound`, `max_bound` — the inclusive range boundaries

## Steps
1. Open `tests/range_proof.test.ts`
2. Click **Run** in the Noir plugin
