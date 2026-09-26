// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title SimpleAccount
 * @dev A minimal ERC-4337 smart contract wallet (account abstraction).
 *
 * ERC-4337 introduces "account abstraction" — smart contracts that behave like
 * externally owned accounts (EOAs). Instead of private keys signing transactions
 * directly, users sign UserOperations which are validated here and bundled by
 * a third-party Bundler into a single transaction sent to the EntryPoint.
 *
 * Key concepts:
 * - UserOperation: the ERC-4337 equivalent of a transaction
 * - EntryPoint: the singleton contract that orchestrates all AA calls
 * - Paymaster: optional contract that sponsors gas fees for users
 * - Bundler: off-chain node that batches UserOperations
 *
 * This contract validates signatures and executes calls on behalf of the owner.
 * It is designed to be deployed as a proxy via SimpleAccountFactory.
 */
contract SimpleAccount is Initializable, UUPSUpgradeable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ERC-4337 EntryPoint (singleton deployed on all major networks)
    address public constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    address public owner;

    // Packed user operation struct (matches ERC-4337 spec)
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

    event Executed(address indexed target, uint256 value, bytes data);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwnerOrEntryPoint() {
        require(
            msg.sender == owner || msg.sender == ENTRY_POINT,
            "Not owner or EntryPoint"
        );
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner) external initializer {
        require(_owner != address(0), "Zero address");
        owner = _owner;
    }

    receive() external payable {}

    // ─── ERC-4337 Validation ──────────────────────────────────────────────────

    /**
     * @dev Called by EntryPoint to validate this account's UserOperation.
     * Returns 0 for valid, 1 for invalid (signature mismatch / expired deadline).
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        require(msg.sender == ENTRY_POINT, "Not EntryPoint");

        // Pay the EntryPoint for gas if we have insufficient prefund
        if (missingAccountFunds > 0) {
            payable(ENTRY_POINT).transfer(missingAccountFunds);
        }

        // Validate owner signature over the UserOperation hash
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        address recovered = hash.recover(userOp.signature);

        // Return 0 = valid, 1 = invalid
        validationData = (recovered == owner) ? 0 : 1;
    }

    // ─── Execution ────────────────────────────────────────────────────────────

    /**
     * @dev Execute a single call. Called by EntryPoint after validation.
     */
    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyOwnerOrEntryPoint {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        emit Executed(target, value, data);
    }

    /**
     * @dev Execute multiple calls atomically (batch transactions).
     */
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata data
    ) external onlyOwnerOrEntryPoint {
        require(
            targets.length == values.length && targets.length == data.length,
            "Length mismatch"
        );
        for (uint256 i = 0; i < targets.length; i++) {
            (bool success, bytes memory result) = targets[i].call{value: values[i]}(data[i]);
            if (!success) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
            emit Executed(targets[i], values[i], data[i]);
        }
    }

    // ─── Owner Management ─────────────────────────────────────────────────────

    function changeOwner(address newOwner) external onlyOwnerOrEntryPoint {
        require(newOwner != address(0), "Zero address");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    // ─── Upgrade ──────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwnerOrEntryPoint {}

    // ─── Deposit / Withdraw from EntryPoint ───────────────────────────────────

    /**
     * @dev Deposit ETH into EntryPoint to prefund gas for future UserOps.
     */
    function addDeposit() external payable {
        (bool ok, ) = ENTRY_POINT.call{value: msg.value}("");
        require(ok, "Deposit failed");
    }
}
