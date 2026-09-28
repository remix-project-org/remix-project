fn all_different(values: [Field; 4]) {
    for i in 0..4 {
        let v: u8 = values[i] as u8;
        assert(v >= 1);
        assert(v <= 4);
    }
    assert(values[0] != values[1]);
    assert(values[0] != values[2]);
    assert(values[0] != values[3]);
    assert(values[1] != values[2]);
    assert(values[1] != values[3]);
    assert(values[2] != values[3]);
}

fn main(
    solution: [[Field; 4]; 4],     // private: complete valid 4x4 solution
    puzzle: pub [[Field; 4]; 4]    // public: given cells (0 = empty)
) {
    // Check rows
    for row in 0..4 {
        all_different(solution[row]);
    }

    // Check columns
    for col in 0..4 {
        all_different([solution[0][col], solution[1][col], solution[2][col], solution[3][col]]);
    }

    // Check 2x2 boxes
    all_different([solution[0][0], solution[0][1], solution[1][0], solution[1][1]]);
    all_different([solution[0][2], solution[0][3], solution[1][2], solution[1][3]]);
    all_different([solution[2][0], solution[2][1], solution[3][0], solution[3][1]]);
    all_different([solution[2][2], solution[2][3], solution[3][2], solution[3][3]]);

    // Enforce puzzle constraints: puzzle[r][c] != 0 => solution[r][c] == puzzle[r][c]
    for row in 0..4 {
        for col in 0..4 {
            assert(puzzle[row][col] * (solution[row][col] - puzzle[row][col]) == 0);
        }
    }
}
