# ZK KYC (Know Your Customer) in Noir

Performs selective credential disclosure: proves you meet KYC requirements
(age, nationality) without revealing your actual personal data.

## How It Works
1. A trusted issuer creates a credential: `Pedersen(age, nationality_code, document_secret)`
2. The prover holds the private credential fields
3. The ZK proof selectively reveals only what is required (e.g., "age >= 18") —
   not the underlying data

## Inputs
- **Private**: `age`, `nationality_code`, `document_secret`
- **Public**: `credential_hash`, `min_age`, `required_nationality`, `check_nationality`

## Flexible Checks
- Set `check_nationality = 0` to skip the nationality check entirely
- Set `check_nationality = 1` and `required_nationality = <code>` to enforce it

## Steps
1. Compute `credential_hash = Pedersen([age, nationality_code, document_secret])[0]`
2. Fill in the test inputs in `tests/zk_kyc.test.ts`
3. Run the test via the Noir plugin
