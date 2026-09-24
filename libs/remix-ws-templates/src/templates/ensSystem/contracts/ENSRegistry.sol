// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ENSRegistry
 * @dev A simplified Ethereum Name Service (ENS) registry.
 *
 * ENS maps human-readable names (e.g., "alice.eth") to machine-readable
 * identifiers like Ethereum addresses, content hashes, and metadata.
 *
 * Architecture:
 * - Registry: Maps name hashes (nodes) to owner, resolver, TTL
 * - Resolver: Maps nodes to actual records (address, text, contenthash)
 * - Registrar: Controls how names in a TLD (.eth) are registered/renewed
 *
 * Name hashing (namehash):
 *   namehash('') = 0x0
 *   namehash('eth') = keccak256(namehash('') ++ keccak256('eth'))
 *   namehash('alice.eth') = keccak256(namehash('eth') ++ keccak256('alice'))
 *
 * This simplified version demonstrates core ENS concepts without the full
 * auction/registration mechanics.
 */
contract ENSRegistry {
    struct Record {
        address owner;
        address resolver;
        uint64 ttl;
    }

    // node (namehash) => Record
    mapping(bytes32 => Record) public records;
    // operator approvals: owner => operator => approved
    mapping(address => mapping(address => bool)) public operators;

    // The root node (namehash of '')
    bytes32 private constant ROOT_NODE = 0x0000000000000000000000000000000000000000000000000000000000000000;

    event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner);
    event Transfer(bytes32 indexed node, address owner);
    event NewResolver(bytes32 indexed node, address resolver);
    event NewTTL(bytes32 indexed node, uint64 ttl);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    modifier authorized(bytes32 node) {
        address nodeOwner = records[node].owner;
        require(
            msg.sender == nodeOwner || operators[nodeOwner][msg.sender],
            "Not authorized"
        );
        _;
    }

    constructor() {
        // Grant deployer ownership of the root node
        records[ROOT_NODE].owner = msg.sender;
    }

    // ─── Subnode Registration ─────────────────────────────────────────────────

    /**
     * @dev Register a subnode. E.g., register 'alice' under 'eth' root.
     * @param node The parent node (namehash of the parent domain)
     * @param label The keccak256 hash of the new subdomain label (e.g., keccak256('alice'))
     * @param owner Address that will own the new subnode
     */
    function setSubnodeOwner(
        bytes32 node,
        bytes32 label,
        address owner
    ) external authorized(node) returns (bytes32 subnode) {
        subnode = keccak256(abi.encodePacked(node, label));
        records[subnode].owner = owner;
        emit NewOwner(node, label, owner);
    }

    /**
     * @dev Register a subnode and set resolver + TTL in one call.
     */
    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64 ttl
    ) external authorized(node) {
        bytes32 subnode = keccak256(abi.encodePacked(node, label));
        records[subnode] = Record(owner, resolver, ttl);
        emit NewOwner(node, label, owner);
        emit NewResolver(subnode, resolver);
        emit NewTTL(subnode, ttl);
    }

    // ─── Record Management ────────────────────────────────────────────────────

    function setOwner(bytes32 node, address owner) external authorized(node) {
        records[node].owner = owner;
        emit Transfer(node, owner);
    }

    function setResolver(bytes32 node, address resolver) external authorized(node) {
        records[node].resolver = resolver;
        emit NewResolver(node, resolver);
    }

    function setTTL(bytes32 node, uint64 ttl) external authorized(node) {
        records[node].ttl = ttl;
        emit NewTTL(node, ttl);
    }

    function setApprovalForAll(address operator, bool approved) external {
        operators[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    function owner(bytes32 node) external view returns (address) {
        return records[node].owner;
    }

    function resolver(bytes32 node) external view returns (address) {
        return records[node].resolver;
    }

    function ttl(bytes32 node) external view returns (uint64) {
        return records[node].ttl;
    }

    function recordExists(bytes32 node) external view returns (bool) {
        return records[node].owner != address(0);
    }

    function isApprovedForAll(address nodeOwner, address operator)
        external
        view
        returns (bool)
    {
        return operators[nodeOwner][operator];
    }

    // ─── Utility: Compute namehash ────────────────────────────────────────────

    /**
     * @dev Compute ENS namehash for a single-label name under the root.
     * For multi-label names, chain: namehash(parent, label).
     */
    function namehash(bytes32 parentNode, string calldata label)
        external
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }
}
