pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";

// Checks all 9 values are distinct and in range [1, 9]
template OneToNine() {
    signal input values[9];

    // Range check: each value in [1, 9]
    component gte[9];
    component lte[9];
    for (var i = 0; i < 9; i++) {
        gte[i] = GreaterEqThan(4);
        gte[i].in[0] <== values[i];
        gte[i].in[1] <== 1;
        gte[i].out === 1;

        lte[i] = LessEqThan(4);
        lte[i].in[0] <== values[i];
        lte[i].in[1] <== 9;
        lte[i].out === 1;
    }

    // Uniqueness: no two values are equal
    component eq[36];
    var k = 0;
    for (var i = 0; i < 9; i++) {
        for (var j = i + 1; j < 9; j++) {
            eq[k] = IsZero();
            eq[k].in <== values[i] - values[j];
            eq[k].out === 0;
            k++;
        }
    }
}

// Proves knowledge of a valid 9x9 Sudoku solution
template Sudoku() {
    signal input solution[9][9];  // private: complete valid solution
    signal input puzzle[9][9];    // public:  given cells (0 = empty)

    // Check all rows
    component rows[9];
    for (var r = 0; r < 9; r++) {
        rows[r] = OneToNine();
        for (var c = 0; c < 9; c++) {
            rows[r].values[c] <== solution[r][c];
        }
    }

    // Check all columns
    component cols[9];
    for (var c = 0; c < 9; c++) {
        cols[c] = OneToNine();
        for (var r = 0; r < 9; r++) {
            cols[c].values[r] <== solution[r][c];
        }
    }

    // Check all 3x3 boxes
    component boxes[9];
    for (var br = 0; br < 3; br++) {
        for (var bc = 0; bc < 3; bc++) {
            boxes[br * 3 + bc] = OneToNine();
            var idx = 0;
            for (var r = 0; r < 3; r++) {
                for (var c = 0; c < 3; c++) {
                    boxes[br * 3 + bc].values[idx] <== solution[br * 3 + r][bc * 3 + c];
                    idx++;
                }
            }
        }
    }

    // Enforce puzzle constraints: given cells must match solution
    // puzzle[r][c] * (solution[r][c] - puzzle[r][c]) === 0
    for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
            puzzle[r][c] * (solution[r][c] - puzzle[r][c]) === 0;
        }
    }
}

component main {public [puzzle]} = Sudoku();
