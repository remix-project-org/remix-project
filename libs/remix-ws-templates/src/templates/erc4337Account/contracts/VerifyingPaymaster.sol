// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title VerifyingPaymaster
 * @dev An ERC-4337 Paymaster that sponsors gas for users whose UserOperations
 *      are signed off by a trusted verifier (the owner/backend).
 *
 * Flow:
 * 1. User creates a UserOperation
 * 2. Backend (verifier) signs a hash of key op fields + validity window
 * 3. User includes this signature in paymasterAndData
 * 4. EntryPoint calls validatePaymasterUserOp → we verify the signature
 * 5. EntryPoint calls postOp → we can optionally charge the user in ERC-20
 *
 * Use cases: gasless onboarding, gas subsidies, subscriptions paid in ERC-20.
 */
contract VerifyingPaymaster is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address public verifier; // Signs off on which UserOps to sponsor

    struct PackedUserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        bytes32 accountGasLimits;
        uint256 preVerificationGas;
        bytes32 gasFees;
        bytes paymasterAndData;
        bytes signature;
    }

    event VerifierChanged(address indexed oldVerifier, address indexed newVerifier);

    constructor(address _verifier) Ownable(msg.sender) {
        verifier = _verifier;
    }

    receive() external payable {}

    function setVerifier(address _verifier) external onlyOwner {
        emit VerifierChanged(verifier, _verifier);
        verifier = _verifier;
    }

    /**
     * @dev Called by EntryPoint. Validates that the verifier has approved this op.
     * The paymasterAndData encodes: paymaster address (20 bytes) + validUntil (6 bytes)
     *                               + validAfter (6 bytes) + verifier signature (65 bytes)
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external view returns (bytes memory context, uint256 validationData) {
        (uint48 validUntil, uint48 validAfter, bytes memory sig) =
            _parsePaymasterData(userOp.paymasterAndData);

        bytes32 hash = keccak256(abi.encode(userOpHash, address(this), validUntil, validAfter))
            .toEthSignedMessageHash();

        bool valid = hash.recover(sig) == verifier;

        // Pack validationData: sigFailed (1 bit) | validUntil (48 bits) | validAfter (48 bits)
        validationData = _packValidationData(!valid, validUntil, validAfter);
        context = "";
    }

    function _parsePaymasterData(bytes calldata data)
        internal
        pure
        returns (uint48 validUntil, uint48 validAfter, bytes memory sig)
    {
        // Skip first 20 bytes (paymaster address)
        validUntil = uint48(bytes6(data[20:26]));
        validAfter = uint48(bytes6(data[26:32]));
        sig = data[32:];
    }

    function _packValidationData(bool sigFailed, uint48 validUntil, uint48 validAfter)
        internal
        pure
        returns (uint256)
    {
        return (sigFailed ? 1 : 0) | (uint256(validUntil) << 160) | (uint256(validAfter) << 208);
    }

    /**
     * @dev Called by EntryPoint after execution. Can charge the user in ERC-20 here.
     */
    function postOp(uint8 mode, bytes calldata context, uint256 actualGasCost, uint256 actualUserOpFeePerGas) external {
        // In a real implementation: charge user's ERC-20 balance for gas
    }

    function withdrawTo(address payable to, uint256 amount) external onlyOwner {
        to.transfer(amount);
    }
}
