# Stealth Drop Circuit (Noir)

This circuit implements a Stealth Drop mechanism using Elliptic Curve Recovery (ecrecover) and Merkle Proof Verification in Noir.

## Overview

This circuit allows a user to claim a drop while ensuring privacy and security using:

- Elliptic Curve Recovery (ecrecover): To verify the authenticity of a signature.
- Merkle Tree Verification: To prove inclusion in a list.
- Pedersen Hash: To generate a nullifier that prevents double claims.

[Source repository](https://github.com/noir-lang/noir-examples/tree/master/stealthdrop)
