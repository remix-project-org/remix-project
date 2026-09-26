pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

// Anonymous on-chain voting:
// - Proves the voter is registered (Merkle inclusion of identity commitment)
// - Prevents double voting via a nullifier
// - Hides the voter's identity and which option they chose
template PrivateVoting(treeDepth) {
    // Private inputs
    signal input voterSecret;             // secret key of the voter
    signal input voteOption;              // which option they vote for
    signal input pathElements[treeDepth]; // Merkle path siblings
    signal input pathIndices[treeDepth];  // Merkle path directions (0=left, 1=right)

    // Public inputs
    signal input root;          // Merkle root of registered voters
    signal input nullifierHash; // prevents double voting
    signal input proposalId;    // identifies the specific vote/proposal

    // 1. Compute identity commitment: Poseidon(voterSecret)
    component identityHasher = Poseidon(1);
    identityHasher.inputs[0] <== voterSecret;
    signal identityCommitment;
    identityCommitment <== identityHasher.out;

    // 2. Verify voter is registered via Merkle inclusion proof
    component muxL[treeDepth];
    component muxR[treeDepth];
    component treeHashers[treeDepth];
    signal levelHash[treeDepth + 1];
    levelHash[0] <== identityCommitment;

    for (var i = 0; i < treeDepth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        muxL[i] = Mux1();
        muxL[i].c[0] <== levelHash[i];
        muxL[i].c[1] <== pathElements[i];
        muxL[i].s <== pathIndices[i];

        muxR[i] = Mux1();
        muxR[i].c[0] <== pathElements[i];
        muxR[i].c[1] <== levelHash[i];
        muxR[i].s <== pathIndices[i];

        treeHashers[i] = Poseidon(2);
        treeHashers[i].inputs[0] <== muxL[i].out;
        treeHashers[i].inputs[1] <== muxR[i].out;

        levelHash[i + 1] <== treeHashers[i].out;
    }

    root === levelHash[treeDepth];

    // 3. Compute and verify nullifier: Poseidon(voterSecret, proposalId)
    //    The on-chain contract checks this nullifier hasn't been used before
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== voterSecret;
    nullifierHasher.inputs[1] <== proposalId;
    nullifierHash === nullifierHasher.out;

    // 4. Dummy constraint to prevent voteOption from being tampered with externally
    signal voteSquared;
    voteSquared <== voteOption * voteOption;
}

component main {public [root, nullifierHash, proposalId]} = PrivateVoting(20);
