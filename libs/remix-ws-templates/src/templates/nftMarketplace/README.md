# NFT Marketplace

A fixed-price **NFT marketplace** with EIP-2981 royalty support. Sellers list NFTs at a fixed price; buyers fulfill listings. Protocol fee: 2.5%, creator royalties: up to 10%.

## Contracts

| Contract | Description |
|---|---|
| `NFTMarketplace.sol` | Marketplace with listing, cancellation, purchase, and royalty distribution |
| `MintableNFT.sol` | ERC-721 collection with native EIP-2981 royalties and enumerable extension |
| `RoyaltyRegistry.sol` | Standalone registry for royalty overrides (covers pre-EIP-2981 collections) |

## Key Features

- **Escrow-free listings**: NFTs stay in seller's wallet until purchased (approval-based)
- **EIP-2981 royalties**: Creator receives a percentage of every secondary sale
- **Protocol fees**: 2.5% of each sale goes to the fee recipient
- **Pausable**: Owner can pause the marketplace in emergencies

## Sale Distribution

```
Sale price: 1 ETH
  → Protocol fee (2.5%): 0.025 ETH → feeRecipient
  → Creator royalty (5%): 0.05 ETH → royaltyRecipient
  → Seller proceeds: 0.925 ETH → seller
```

## Getting Started

```solidity
// 1. Mint an NFT
nft.mint(yourAddress, {value: mintPrice})

// 2. Approve marketplace
nft.setApprovalForAll(marketplace.address, true)

// 3. List for sale
bytes32 listingId = marketplace.list(nft.address, tokenId, 1 ether)

// 4. Buy (from another account)
marketplace.buy(listingId, {value: 1 ether})
```

## Royalty Registry

Many NFT collections were deployed before EIP-2981 existed. The `RoyaltyRegistry` lets collection owners register royalty overrides so any marketplace can honour creator fees — even for legacy contracts.

**Lookup priority** (marketplaces should follow this order):
1. `RoyaltyRegistry.getRoyaltyInfo(collection, tokenId, salePrice)` — registry override
2. EIP-2981 `royaltyInfo()` on the NFT contract itself
3. No royalty

```solidity
// Register a royalty for a legacy collection (call from collection authority)
registry.setRoyaltyOverride(collectionAddress, creatorAddress, 500) // 5%

// Marketplace lookup
(address recipient, uint256 amount) = registry.getRoyaltyInfo(collection, tokenId, salePrice)
```

This is the pattern used by the [Manifold Royalty Registry](https://royaltyregistry.xyz), which OpenSea, Blur, and Foundation consult as a fallback.

## Production Examples

- **OpenSea Seaport** — advanced order book with offer signing
- **Blur** — MEV-aware marketplace with order pools
- **LooksRare** — community-owned marketplace
- **Foundation** — curated creator marketplace
