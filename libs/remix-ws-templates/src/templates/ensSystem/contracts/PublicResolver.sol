// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PublicResolver
 * @dev A simplified ENS resolver that stores address and text records.
 *
 * Resolvers translate ENS nodes (name hashes) into actual values.
 * This resolver supports:
 * - addr(node): The primary Ethereum address for a name
 * - addr(node, coinType): Multi-coin address (ENSIP-9, e.g., BTC, SOL)
 * - text(node, key): Arbitrary text records (avatar, url, email, twitter, etc.)
 * - contenthash(node): IPFS/Swarm hash for a decentralized website
 *
 * To use: set a name's resolver in ENSRegistry to this contract's address,
 * then call setAddr/setText/setContenthash from the name's owner.
 */

interface IENSRegistry {
    function owner(bytes32 node) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

contract PublicResolver {
    IENSRegistry public immutable registry;

    // node => address
    mapping(bytes32 => address) private _addresses;
    // node => coinType => bytes (for multi-chain addresses)
    mapping(bytes32 => mapping(uint256 => bytes)) private _coinAddresses;
    // node => key => value (text records)
    mapping(bytes32 => mapping(string => string)) private _texts;
    // node => contenthash bytes
    mapping(bytes32 => bytes) private _contenthashes;

    event AddrChanged(bytes32 indexed node, address addr);
    event AddressChanged(bytes32 indexed node, uint256 coinType, bytes newAddress);
    event TextChanged(bytes32 indexed node, string indexed key, string value);
    event ContenthashChanged(bytes32 indexed node, bytes hash);

    modifier authorised(bytes32 node) {
        address nodeOwner = registry.owner(node);
        require(
            msg.sender == nodeOwner || registry.isApprovedForAll(nodeOwner, msg.sender),
            "Not authorised"
        );
        _;
    }

    constructor(address _registry) {
        registry = IENSRegistry(_registry);
    }

    // ─── Address Records ──────────────────────────────────────────────────────

    function setAddr(bytes32 node, address addr) external authorised(node) {
        _addresses[node] = addr;
        emit AddrChanged(node, addr);
    }

    function addr(bytes32 node) external view returns (address) {
        return _addresses[node];
    }

    function setAddr(bytes32 node, uint256 coinType, bytes calldata newAddress)
        external
        authorised(node)
    {
        _coinAddresses[node][coinType] = newAddress;
        emit AddressChanged(node, coinType, newAddress);
    }

    function addr(bytes32 node, uint256 coinType) external view returns (bytes memory) {
        return _coinAddresses[node][coinType];
    }

    // ─── Text Records ─────────────────────────────────────────────────────────

    /**
     * @dev Set a text record. Common keys: "avatar", "url", "email",
     *      "description", "com.twitter", "com.github"
     */
    function setText(bytes32 node, string calldata key, string calldata value)
        external
        authorised(node)
    {
        _texts[node][key] = value;
        emit TextChanged(node, key, value);
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return _texts[node][key];
    }

    // ─── Content Hash ─────────────────────────────────────────────────────────

    /**
     * @dev Set the contenthash for a decentralized website (IPFS, Swarm, Onion).
     * Format: use contenthash-encoded bytes (see ENSIP-7).
     */
    function setContenthash(bytes32 node, bytes calldata hash) external authorised(node) {
        _contenthashes[node] = hash;
        emit ContenthashChanged(node, hash);
    }

    function contenthash(bytes32 node) external view returns (bytes memory) {
        return _contenthashes[node];
    }

    // ─── Interface Detection ──────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x3b3b57de || // addr(bytes32)
            interfaceId == 0xf1cb7e06 || // addr(bytes32, uint256)
            interfaceId == 0x59d1d43c || // text(bytes32, string)
            interfaceId == 0xbc1c58d1;   // contenthash(bytes32)
    }
}
