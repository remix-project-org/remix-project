pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

// Proves a leaf is included in a Merkle tree with a known root.
// Uses Poseidon hashing for ZK-friendly efficiency.
template MerkleProof(depth) {
    signal input leaf;                 // private: the leaf value
    signal input pathElements[depth];  // private: sibling hashes along the path
    signal input pathIndices[depth];   // private: 0 = current is left, 1 = current is right
    signal input root;                 // public:  the expected Merkle root

    component hashers[depth];
    component muxL[depth];
    component muxR[depth];

    signal levelHash[depth + 1];
    levelHash[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        // pathIndices must be binary
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        // When pathIndices[i] == 0: current is left child, sibling is right
        // When pathIndices[i] == 1: current is right child, sibling is left
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

    root === levelHash[depth];
}

component main {public [root]} = MerkleProof(20);
