use dep::std;

fn main(
    age: Field,                       // private: actual age
    nationality_code: Field,          // private: numeric country code (e.g. 840 = USA)
    document_secret: Field,           // private: blinding factor
    credential_hash: pub Field,       // public: Pedersen(age, nationality_code, document_secret)
    min_age: pub Field,               // public: minimum required age
    required_nationality: pub Field,  // public: required country code (ignored when 0)
    check_nationality: pub Field      // public: 1 = enforce nationality check, 0 = skip
) {
    // 1. Verify the credential is authentic (proves ownership of a valid document)
    let parts = std::hash::pedersen([age, nationality_code, document_secret]);
    assert(parts[0] == credential_hash);

    // 2. Prove age meets the minimum requirement
    let age_val: u64 = age as u64;
    let min_val: u64 = min_age as u64;
    assert(age_val >= min_val);

    // 3. Optionally enforce nationality without revealing it
    //    (check_nationality == 0) OR (nationality_code == required_nationality)
    assert(check_nationality * (nationality_code - required_nationality) == 0);
}
