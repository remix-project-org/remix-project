# ENS — Ethereum Name Service

A simplified implementation of the **Ethereum Name Service** registry and resolver. Maps human-readable names (e.g., `alice.eth`) to Ethereum addresses and other records.

## Contracts

| Contract | Description |
|---|---|
| `ENSRegistry.sol` | Core registry mapping namehashes to owners, resolvers, and TTL |
| `PublicResolver.sol` | Resolver supporting address, multi-coin, text, and contenthash records |

## How ENS Names Work

ENS uses **namehash** to convert human-readable names to 32-byte identifiers:

```
namehash('')       = 0x0000...0000  (root)
namehash('eth')    = keccak256(namehash('') + keccak256('eth'))
namehash('alice.eth') = keccak256(namehash('eth') + keccak256('alice'))
```

## Architecture

```
ENSRegistry
  └── Records: node → { owner, resolver, ttl }
      
PublicResolver (pointed to by Registry)
  └── addr(node) → Ethereum address
  └── addr(node, coinType) → Bitcoin, Solana, etc. addresses
  └── text(node, key) → avatar, url, email, twitter, github
  └── contenthash(node) → IPFS/Swarm website hash
```

## Getting Started

```solidity
bytes32 ROOT = bytes32(0);
bytes32 ethLabel = keccak256("eth");
bytes32 ethNode = keccak256(abi.encodePacked(ROOT, ethLabel));

// 1. Register .eth TLD
registry.setSubnodeOwner(ROOT, ethLabel, registrar);

// 2. Register alice.eth
bytes32 aliceNode = registry.setSubnodeOwner(ethNode, keccak256("alice"), alice);

// 3. Set resolver
registry.setResolver(aliceNode, resolver.address);

// 4. Set address record
resolver.setAddr(aliceNode, alice);

// 5. Lookup
resolver.addr(aliceNode) // returns alice's address
```

## Production Examples

- **ENS (ens.domains)** — the live Ethereum naming system
- **Unstoppable Domains** — similar naming on Polygon
- **Space ID** — multi-chain naming (.bnb, .arb, etc.)
