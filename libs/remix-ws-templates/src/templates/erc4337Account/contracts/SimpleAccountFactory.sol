// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./SimpleAccount.sol";

/**
 * @title SimpleAccountFactory
 * @dev Deploys SimpleAccount proxies using CREATE2 for deterministic addresses.
 *
 * The factory generates a unique wallet address for each (owner, salt) pair
 * before the wallet is deployed. This enables "counterfactual" wallet addresses:
 * users can receive funds at their wallet address before ever paying gas to deploy.
 *
 * The Bundler calls getAddress() to predict the address, then includes the
 * initCode (factory address + createAccount calldata) in the UserOperation.
 * The EntryPoint deploys the wallet on first use if it doesn't exist yet.
 */
contract SimpleAccountFactory {
    SimpleAccount public immutable accountImplementation;

    event AccountCreated(address indexed account, address indexed owner, uint256 salt);

    constructor() {
        accountImplementation = new SimpleAccount();
    }

    /**
     * @dev Deploy a new SimpleAccount proxy for the given owner and salt.
     * If already deployed at the predicted address, return the existing one.
     */
    function createAccount(address owner, uint256 salt) external returns (SimpleAccount) {
        address addr = getAddress(owner, salt);
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(addr)
        }
        if (codeSize > 0) {
            return SimpleAccount(payable(addr));
        }

        bytes memory initData = abi.encodeCall(SimpleAccount.initialize, (owner));
        ERC1967Proxy proxy = new ERC1967Proxy{salt: bytes32(salt)}(
            address(accountImplementation),
            initData
        );
        emit AccountCreated(address(proxy), owner, salt);
        return SimpleAccount(payable(address(proxy)));
    }

    /**
     * @dev Compute the deterministic address for a (owner, salt) pair.
     * This address can receive funds before the wallet is deployed.
     */
    function getAddress(address owner, uint256 salt) public view returns (address) {
        bytes memory initData = abi.encodeCall(SimpleAccount.initialize, (owner));
        bytes memory proxyBytecode = abi.encodePacked(
            type(ERC1967Proxy).creationCode,
            abi.encode(address(accountImplementation), initData)
        );
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                bytes32(salt),
                keccak256(proxyBytecode)
            )
        );
        return address(uint160(uint256(hash)));
    }
}
