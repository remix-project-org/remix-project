# Anonymous Voting in Noir

Proves a valid, unique vote without revealing the voter's identity or vote choice.

## How It Works
1. Each registered voter holds a `voter_secret`.
2. They compute:
   - `commitment = Pedersen(voter_secret, vote_option, nonce)` — submitted with their vote
   - `nullifier  = Pedersen(voter_secret)` — submitted to prevent double-voting
3. The ZK proof shows they know a valid preimage without revealing `voter_secret`.

## Inputs
- **Private**: `voter_secret`, `nonce`
- **Public**: `vote_option`, `nullifier`, `commitment`

## Steps
1. Compute `commitment` and `nullifier` using `std::hash::pedersen` (via `nargo execute`)
2. Fill in the values in `tests/voting.test.ts`
3. Run the test via the Noir plugin
