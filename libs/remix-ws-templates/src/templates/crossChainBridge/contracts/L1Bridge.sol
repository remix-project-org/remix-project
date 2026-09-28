// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title L1Bridge
 * @dev Layer 1 side of a Lock-and-Mint cross-chain bridge.
 *
 * Lock-and-Mint pattern:
 * - L1: User locks tokens → emits DepositInitiated event
 * - Relayer (off-chain) detects the event and calls L2Bridge.mint()
 * - L2: Wrapped tokens are minted to the user
 *
 * Burn-and-Unlock (reverse):
 * - L2: User burns wrapped tokens → emits WithdrawalInitiated event
 * - Relayer detects the event and calls L1Bridge.release()
 * - L1: Original tokens are released to the user
 *
 * Real examples: Arbitrum/Optimism canonical bridges, Hop Protocol.
 * In production: add fraud proofs, optimistic challenge periods, or ZK proofs.
 */
contract L1Bridge is Ownable, ReentrancyGuard, Pausable {
    IERC20 public immutable token;
    address public relayer;        // Off-chain relayer authorized to release funds
    uint256 public nonce;

    mapping(bytes32 => bool) public processedWithdrawals;

    event DepositInitiated(
        address indexed sender,
        address indexed recipient,    // L2 recipient address
        uint256 amount,
        uint256 nonce,
        bytes32 indexed depositId
    );
    event WithdrawalCompleted(
        bytes32 indexed withdrawalId,
        address indexed recipient,
        uint256 amount
    );
    event RelayerChanged(address indexed oldRelayer, address indexed newRelayer);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not relayer");
        _;
    }

    constructor(address _token, address _relayer) Ownable(msg.sender) {
        token = IERC20(_token);
        relayer = _relayer;
    }

    // ─── Deposit (L1 → L2) ───────────────────────────────────────────────────

    /**
     * @dev Lock tokens on L1 to bridge them to L2.
     * @param amount Amount of tokens to lock
     * @param l2Recipient Address on L2 that will receive the minted tokens
     */
    function deposit(uint256 amount, address l2Recipient)
        external
        nonReentrant
        whenNotPaused
    {
        require(amount > 0, "Amount must be > 0");
        require(l2Recipient != address(0), "Zero recipient");

        token.transferFrom(msg.sender, address(this), amount);

        bytes32 depositId = keccak256(
            abi.encodePacked(msg.sender, l2Recipient, amount, nonce, block.chainid)
        );

        emit DepositInitiated(msg.sender, l2Recipient, amount, nonce, depositId);
        nonce++;
    }

    // ─── Release (L2 → L1) ───────────────────────────────────────────────────

    /**
     * @dev Called by the relayer after verifying a valid L2 burn.
     * Releases locked tokens to the L1 recipient.
     * @param recipient L1 address to receive tokens
     * @param amount Amount to release
     * @param withdrawalId Unique ID from the L2 burn event (prevents replay)
     */
    function release(
        address recipient,
        uint256 amount,
        bytes32 withdrawalId
    ) external nonReentrant onlyRelayer whenNotPaused {
        require(!processedWithdrawals[withdrawalId], "Already processed");
        require(recipient != address(0), "Zero recipient");

        processedWithdrawals[withdrawalId] = true;
        token.transfer(recipient, amount);

        emit WithdrawalCompleted(withdrawalId, recipient, amount);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setRelayer(address _relayer) external onlyOwner {
        emit RelayerChanged(relayer, _relayer);
        relayer = _relayer;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        token.transfer(to, amount);
    }
}
