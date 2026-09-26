# Sudoku Verifier (Circom)

A zero-knowledge circuit that proves knowledge of a valid 9×9 Sudoku solution without revealing the solution.

## Circuit: `sudoku.circom`

**Private inputs:** `solution[9][9]`  
**Public inputs:** `puzzle[9][9]`

The circuit verifies:
1. Each cell is in range [1, 9]
2. All cells in each row are distinct
3. All cells in each column are distinct
4. All cells in each 3×3 box are distinct
5. Solution is consistent with the given puzzle (`puzzle[r][c] == 0` or `puzzle[r][c] == solution[r][c]`)

Uses `IsZero`, `GreaterEqThan`, and `LessEqThan` from circomlib.

## Workflow

### 1. Trusted Setup

Run **one** of:
- `scripts/groth16/groth16_trusted_setup.ts` — Groth16
- `scripts/plonk/plonk_trusted_setup.ts` — PLONK

### 2. Generate Proof

Run the matching zkproof script with a hardcoded valid puzzle/solution pair.

### 3. Deploy & Verify On-Chain

Deploy `zk/build/zk_verifier.sol` and call `verifyProof`.

## Dependencies

- `circomlib` — `comparators.circom`
- `snarkjs` — witness calculation, proving, verification
