pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

// Computes commitment and nullifier hash from secret values
template CommitmentHasher() {
    signal input nullifier;      // private: random nullifier
    signal input secret;         // private: random secret
    signal output commitment;    // Poseidon(nullifier, secret) — stored on deposit
    signal output nullifierHash; // Poseidon(nullifier) — revealed on withdrawal

    component commitHasher = Poseidon(2);
    commitHasher.inputs[0] <== nullifier;
    commitHasher.inputs[1] <== secret;
    commitment <== commitHasher.out;

    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash <== nullifierHasher.out;
}

// Verifies a Merkle inclusion proof
template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    component hashers[levels];
    component muxL[levels];
    component muxR[levels];
    signal levelHash[levels + 1];
    levelHash[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        muxL[i] = Mux1();
        muxL[i].c[0] <== levelHash[i];
        muxL[i].c[1] <== pathElements[i];
        muxL[i].s <== pathIndices[i];

        muxR[i] = Mux1();
        muxR[i].c[0] <== pathElements[i];
        muxR[i].c[1] <== levelHash[i];
        muxR[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== muxL[i].out;
        hashers[i].inputs[1] <== muxR[i].out;

        levelHash[i + 1] <== hashers[i].out;
    }

    root <== levelHash[levels];
}

// Main withdrawal circuit (inspired by Tornado Cash)
// Proves a depositor can withdraw without revealing which deposit is theirs.
template Withdraw(levels) {
    // Private inputs
    signal input nullifier;            // random secret component
    signal input secret;               // random secret component
    signal input pathElements[levels]; // Merkle path siblings
    signal input pathIndices[levels];  // Merkle path directions

    // Public inputs
    signal input root;          // Merkle root of all deposits
    signal input nullifierHash; // revealed to prevent double withdrawal
    signal input recipient;     // who receives the funds
    signal input relayer;       // optional relayer address (0 if none)
    signal input fee;           // relayer fee amount
    signal input refund;        // ETH refund for gas

    // 1. Compute commitment and nullifier hash
    component hasher = CommitmentHasher();
    hasher.nullifier <== nullifier;
    hasher.secret <== secret;

    // 2. Verify the published nullifier hash is correct
    nullifierHash === hasher.nullifierHash;

    // 3. Verify commitment is in the Merkle tree (proves a deposit was made)
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== hasher.commitment;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
    root === tree.root;

    // 4. Dummy constraints prevent public inputs from being swapped out
    signal recipientSquare;
    signal feeSquare;
    signal relayerSquare;
    signal refundSquare;
    recipientSquare <== recipient * recipient;
    feeSquare <== fee * fee;
    relayerSquare <== relayer * relayer;
    refundSquare <== refund * refund;
}

component main {public [root, nullifierHash, recipient, relayer, fee, refund]} = Withdraw(20);
