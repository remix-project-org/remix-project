use dep::std;

fn main(
    voter_secret: Field,
    vote_option: pub Field,
    nonce: Field,
    nullifier: pub Field,
    commitment: pub Field
) {
    // Commitment binds the vote to a specific voter_secret without revealing it
    let commitment_parts = std::hash::pedersen_hash([voter_secret, vote_option, nonce]);
    assert(commitment_parts == commitment);

    // Nullifier lets the contract detect double-voting without revealing who voted
    let nullifier_parts = std::hash::pedersen_hash([voter_secret]);
    assert(nullifier_parts == nullifier);
}
