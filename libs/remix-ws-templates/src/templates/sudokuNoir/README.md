# ZK Sudoku in Noir

Proves knowledge of a valid 4x4 Sudoku solution without revealing it.

## Rules
- Each row must contain {1, 2, 3, 4} exactly once
- Each column must contain {1, 2, 3, 4} exactly once
- Each 2x2 box must contain {1, 2, 3, 4} exactly once
- Given (non-zero) cells in the puzzle must match the solution

## Example Puzzle

```
Puzzle (0 = empty):      Solution:
1 0 | 3 0               1 2 | 3 4
0 4 | 0 2               3 4 | 1 2
---------               ---------
2 0 | 0 3               2 1 | 4 3
0 3 | 2 0               4 3 | 2 1
```

## Inputs
- **Private**: `solution` — the complete 4x4 grid
- **Public**: `puzzle` — the given cells (0 = empty, 1-4 = fixed)

## Steps
1. Open `tests/sudoku.test.ts` — it contains a working puzzle/solution pair
2. Run the test via the Noir plugin
