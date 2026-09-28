// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title YieldVault
 * @dev An auto-compounding yield aggregator vault (Yearn-style strategy vault).
 *
 * Users deposit an underlying asset (e.g., USDC). The vault deploys capital
 * to an external protocol (modeled here as a simple interest accrual). A keeper
 * calls harvest() periodically to claim rewards and compound them back into
 * the vault, increasing the share price for all depositors.
 *
 * Key DeFi concepts demonstrated:
 * - ERC-4626 as the vault standard
 * - Keeper-based auto-compounding
 * - Performance fees (charged on harvested yield)
 * - Strategy pattern (the "strategy" is abstracted to a simulated yield)
 *
 * Production examples: Yearn V3 vaults, Beefy Finance, Convex Finance
 */
contract YieldVault is ERC4626, Ownable, ReentrancyGuard {
    // Performance fee: 10% of yield goes to the treasury
    uint256 public constant PERFORMANCE_FEE_BPS = 1000;
    uint256 public constant BPS_DENOMINATOR = 10000;

    address public treasury;
    address public keeper;         // Authorized to call harvest()

    // Simulated strategy: tracks "deployed" assets earning yield
    uint256 public deployedAssets;
    uint256 public constant APY_BPS = 1000; // 10% APY (simulated)
    uint256 public lastHarvestTime;

    uint256 public totalHarvested;

    event Harvested(uint256 grossYield, uint256 performanceFee, uint256 netYield);
    event Deployed(uint256 amount);
    event Recalled(uint256 amount);

    modifier onlyKeeper() {
        require(msg.sender == keeper || msg.sender == owner(), "Not keeper");
        _;
    }

    constructor(
        IERC20 _asset,
        address _treasury,
        address _keeper
    )
        ERC20("Yield Vault Share", "yvSHARE")
        ERC4626(_asset)
        Ownable(msg.sender)
    {
        treasury = _treasury;
        keeper = _keeper;
        lastHarvestTime = block.timestamp;
    }

    // ─── Strategy: Deploy / Recall ────────────────────────────────────────────

    /**
     * @dev Deploy idle assets to the underlying strategy (off-chain yield source).
     * In production, this would call into an external protocol (Aave, Compound, etc.)
     */
    function deployToStrategy(uint256 amount) external onlyOwner nonReentrant {
        require(amount <= IERC20(asset()).balanceOf(address(this)), "Insufficient idle assets");
        deployedAssets += amount;
        emit Deployed(amount);
    }

    /**
     * @dev Recall assets from strategy back to the vault (for withdrawals).
     */
    function recallFromStrategy(uint256 amount) external onlyOwner nonReentrant {
        require(amount <= deployedAssets, "Exceeds deployed assets");
        deployedAssets -= amount;
        emit Recalled(amount);
    }

    // ─── Harvest ──────────────────────────────────────────────────────────────

    /**
     * @dev Harvest accrued yield and compound it back into the vault.
     * Called periodically by the keeper (e.g., every 24 hours).
     * Simulates yield accrual — in production, claim rewards from external protocols.
     */
    function harvest() external onlyKeeper nonReentrant {
        uint256 elapsed = block.timestamp - lastHarvestTime;
        if (elapsed == 0 || deployedAssets == 0) return;

        // Simulate yield: APY_BPS per year
        uint256 grossYield = (deployedAssets * APY_BPS * elapsed) / (BPS_DENOMINATOR * 365 days);

        // Performance fee goes to treasury
        uint256 performanceFee = (grossYield * PERFORMANCE_FEE_BPS) / BPS_DENOMINATOR;
        uint256 netYield = grossYield - performanceFee;

        // Increase deployed assets (compounding)
        deployedAssets += netYield;
        totalHarvested += grossYield;
        lastHarvestTime = block.timestamp;

        // In a real vault: transfer fee tokens to treasury
        // Here we just track it — the net yield is already "in the vault" via deployedAssets

        emit Harvested(grossYield, performanceFee, netYield);
    }

    // ─── ERC-4626 Overrides ────────────────────────────────────────────────────

    /**
     * @dev Total assets = idle assets in vault + deployed to strategy.
     */
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + deployedAssets;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }
}
