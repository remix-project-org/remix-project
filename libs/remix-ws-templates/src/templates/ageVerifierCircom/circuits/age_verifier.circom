pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

// Proves age >= minAge without revealing the actual age.
// A Poseidon commitment binds the prover to a specific age value.
template AgeVerifier() {
    signal input age;        // private: the prover's actual age
    signal input secret;     // private: blinding factor
    signal input minAge;     // public: minimum required age (e.g., 18)
    signal input commitment; // public: Poseidon(age, secret)

    // 1. Verify commitment to age (proves we are not lying about age)
    component hasher = Poseidon(2);
    hasher.inputs[0] <== age;
    hasher.inputs[1] <== secret;
    commitment === hasher.out;

    // 2. Prove age >= minAge (8 bits covers ages 0-255)
    component gte = GreaterEqThan(8);
    gte.in[0] <== age;
    gte.in[1] <== minAge;
    gte.out === 1;
}

component main {public [minAge, commitment]} = AgeVerifier();
