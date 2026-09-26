// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RoyaltyRegistry
 * @dev A standalone registry that maps NFT collections to their royalty
 *      configuration, independent of the on-chain EIP-2981 implementation.
 *
 * Why a separate registry?
 * Many NFT collections were deployed before EIP-2981 existed and have no
 * royaltyInfo() function. The registry lets collection owners (or a governance
 * body) register royalty overrides so that any marketplace querying the
 * registry will honour creator royalties — even for legacy contracts.
 *
 * This is the pattern used by Manifold's Royalty Registry (deployed on mainnet)
 * which OpenSea, Blur, Foundation, and others consult as a fallback.
 *
 * Lookup priority (for a compliant marketplace):
 *   1. Registry override (this contract) — highest priority
 *   2. EIP-2981 on the NFT contract itself
 *   3. No royalty
 */
contract RoyaltyRegistry is Ownable {
    struct RoyaltyConfig {
        address recipient;  // Who receives the royalty
        uint96  feeBps;     // Fee in basis points (e.g. 500 = 5%)
    }

    // collection address => RoyaltyConfig
    mapping(address => RoyaltyConfig) private _overrides;

    // collection address => who is allowed to update the override
    // (defaults to collection owner; can be a multisig or DAO)
    mapping(address => address) public royaltyAuthority;

    uint96 public constant MAX_ROYALTY_BPS = 1000; // 10% hard cap

    event RoyaltyOverrideSet(
        address indexed collection,
        address indexed recipient,
        uint96 feeBps
    );
    event RoyaltyOverrideCleared(address indexed collection);
    event AuthorityUpdated(address indexed collection, address indexed authority);

    constructor() Ownable(msg.sender) {}

    // ─── Registration ─────────────────────────────────────────────────────────

    /**
     * @dev Set or update a royalty override for a collection.
     *      Caller must be the registered authority for the collection, or the
     *      registry owner (for collections with no authority set yet).
     *
     * @param collection NFT contract address
     * @param recipient  Address that will receive royalty payments
     * @param feeBps     Royalty percentage in basis points (max 1000 = 10%)
     */
    function setRoyaltyOverride(
        address collection,
        address recipient,
        uint96 feeBps
    ) external {
        require(_isAuthorized(collection), "Not authorized for this collection");
        require(feeBps <= MAX_ROYALTY_BPS, "Exceeds max royalty");
        require(recipient != address(0), "Zero recipient");

        _overrides[collection] = RoyaltyConfig({ recipient: recipient, feeBps: feeBps });

        emit RoyaltyOverrideSet(collection, recipient, feeBps);
    }

    /**
     * @dev Remove the royalty override for a collection (falls back to EIP-2981).
     */
    function clearRoyaltyOverride(address collection) external {
        require(_isAuthorized(collection), "Not authorized for this collection");
        delete _overrides[collection];
        emit RoyaltyOverrideCleared(collection);
    }

    /**
     * @dev Assign a custom authority address for a collection.
     *      The authority can then update royalties without registry owner involvement.
     *      Only callable by registry owner (initial bootstrap) or current authority.
     */
    function setAuthority(address collection, address authority) external {
        require(
            msg.sender == owner() || msg.sender == royaltyAuthority[collection],
            "Not authorized"
        );
        royaltyAuthority[collection] = authority;
        emit AuthorityUpdated(collection, authority);
    }

    // ─── Lookup ───────────────────────────────────────────────────────────────

    /**
     * @dev Returns royalty info for a collection, checking:
     *   1. Registry override (this contract)
     *   2. EIP-2981 on the NFT contract
     *   3. (0, 0) if neither is set
     *
     * Marketplaces should call this instead of querying the NFT contract directly.
     *
     * @param collection  NFT contract address
     * @param tokenId     Token ID (used for per-token EIP-2981 lookups)
     * @param salePrice   Sale price used to compute the royalty amount
     * @return recipient  Address to pay the royalty to
     * @return amount     Royalty amount in the same units as salePrice
     */
    function getRoyaltyInfo(
        address collection,
        uint256 tokenId,
        uint256 salePrice
    ) external view returns (address recipient, uint256 amount) {
        // 1. Registry override takes precedence
        RoyaltyConfig memory cfg = _overrides[collection];
        if (cfg.recipient != address(0)) {
            return (cfg.recipient, (salePrice * cfg.feeBps) / 10000);
        }

        // 2. Fall back to EIP-2981 on the collection contract
        try IERC2981(collection).royaltyInfo(tokenId, salePrice) returns (
            address r, uint256 a
        ) {
            // Honour the registry's hard cap even for native EIP-2981
            uint256 cap = (salePrice * MAX_ROYALTY_BPS) / 10000;
            return (r, a > cap ? cap : a);
        } catch {
            return (address(0), 0);
        }
    }

    /**
     * @dev Convenience: returns only whether a registry override exists.
     */
    function hasOverride(address collection) external view returns (bool) {
        return _overrides[collection].recipient != address(0);
    }

    function getOverride(address collection) external view returns (address recipient, uint96 feeBps) {
        RoyaltyConfig memory cfg = _overrides[collection];
        return (cfg.recipient, cfg.feeBps);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _isAuthorized(address collection) internal view returns (bool) {
        address authority = royaltyAuthority[collection];
        // If no authority is set, only registry owner can bootstrap it
        if (authority == address(0)) return msg.sender == owner();
        return msg.sender == authority || msg.sender == owner();
    }
}

interface IERC2981 {
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external view returns (address receiver, uint256 royaltyAmount);
}
