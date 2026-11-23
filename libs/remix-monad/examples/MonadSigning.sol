// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "hardhat/console.sol";

contract MonadSigning {
    uint256 public value;
    uint256 public nonce;

    function storeSigned(uint256 newValue, uint8 v, bytes32 r, bytes32 s) external {
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("Monad signing"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
        bytes32 messageHash = keccak256(abi.encode(
            keccak256("Store(uint256 value,uint256 nonce)"), newValue, nonce
        ));
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", domainSeparator, messageHash));
        address signer = ecrecover(digest, v, r, s);
        require(signer == msg.sender, "Invalid signature");

        nonce++;
        value = newValue;
        console.log("Stored value", newValue);
        console.log("Signer", signer);
    }
}
