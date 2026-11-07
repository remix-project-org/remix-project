use dep::std;

// Marks this circuit as recursive: its proof can be verified by another Noir circuit
// using std::verify_proof(). Use this as the "inner" circuit in a proof aggregation pipeline.
#[recursive]
fn main(
    preimage: Field,          // private: the secret preimage
    expected_hash: pub Field  // public: Pedersen hash of preimage
) {
    let computed = std::hash::pedersen([preimage]);
    assert(computed[0] == expected_hash);
}
