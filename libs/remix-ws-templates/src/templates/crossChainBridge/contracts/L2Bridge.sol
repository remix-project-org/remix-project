// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title L2Bridge
 * @dev Layer 2 side of a Lock-and-Mint cross-chain bridge.
 *
 * Manages the wrapped token on L2. When L1 locks are confirmed (by the relayer),
 * this contract mints wrapped tokens. When users want to return to L1, they
 * burn their wrapped tokens, which signals the relayer to release on L1.
 *
 * The wrapped token (WrappedToken) is deployed and owned by this contract.
 */
contract WrappedToken is ERC20, Ownable {
    constructor(string memory name, string memory symbol)
        ERC20(name, symbol)
        Ownable(msg.sender)
    {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}

contract L2Bridge is Ownable, ReentrancyGuard, Pausable {
    WrappedToken public immutable wrappedToken;
    address public relayer;
    uint256 public nonce;

    mapping(bytes32 => bool) public processedDeposits;

    event MintCompleted(
        bytes32 indexed depositId,
        address indexed recipient,
        uint256 amount
    );
    event WithdrawalInitiated(
        address indexed sender,
        address indexed l1Recipient,
        uint256 amount,
        uint256 nonce,
        bytes32 indexed withdrawalId
    );

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not relayer");
        _;
    }

    constructor(
        address _relayer,
        string memory tokenName,
        string memory tokenSymbol
    ) Ownable(msg.sender) {
        relayer = _relayer;
        wrappedToken = new WrappedToken(tokenName, tokenSymbol);
    }

    // ─── Mint (after L1 deposit confirmed) ───────────────────────────────────

    /**
     * @dev Called by the relayer after detecting a DepositInitiated event on L1.
     * Mints wrapped tokens to the L2 recipient.
     */
    function mint(
        address recipient,
        uint256 amount,
        bytes32 depositId
    ) external nonReentrant onlyRelayer whenNotPaused {
        require(!processedDeposits[depositId], "Already processed");
        require(recipient != address(0), "Zero recipient");

        processedDeposits[depositId] = true;
        wrappedToken.mint(recipient, amount);

        emit MintCompleted(depositId, recipient, amount);
    }

    // ─── Burn/Withdraw (L2 → L1) ─────────────────────────────────────────────

    /**
     * @dev Burn wrapped tokens to initiate a withdrawal to L1.
     * @param amount Amount to burn and bridge back
     * @param l1Recipient Address on L1 that will receive the unlocked tokens
     */
    function withdraw(uint256 amount, address l1Recipient)
        external
        nonReentrant
        whenNotPaused
    {
        require(amount > 0, "Amount must be > 0");
        require(l1Recipient != address(0), "Zero recipient");

        wrappedToken.burn(msg.sender, amount);

        bytes32 withdrawalId = keccak256(
            abi.encodePacked(msg.sender, l1Recipient, amount, nonce, block.chainid)
        );

        emit WithdrawalInitiated(msg.sender, l1Recipient, amount, nonce, withdrawalId);
        nonce++;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setRelayer(address _relayer) external onlyOwner {
        relayer = _relayer;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
