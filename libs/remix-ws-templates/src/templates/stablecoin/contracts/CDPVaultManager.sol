// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Stablecoin.sol";

/**
 * @title CDPVaultManager
 * @dev A MakerDAO-style Collateralized Debt Position (CDP) system.
 *
 * Users deposit ETH as collateral into Vaults (CDPs) and mint a stablecoin
 * (USDX) against it. The system maintains price stability by requiring
 * over-collateralization and allowing liquidation of under-collateralized vaults.
 *
 * Key DeFi concepts demonstrated:
 * - Collateralized Debt Positions (CDPs / Vaults)
 * - Stability fees (interest on minted stablecoin)
 * - Liquidation mechanics and the liquidation ratio
 * - Oracle price feeds for collateral valuation
 *
 * Inspired by: MakerDAO's Vat + CDP contracts, Liquity Protocol
 */
contract CDPVaultManager is Ownable, ReentrancyGuard {
    Stablecoin public immutable stablecoin;

    // Collateralization ratios (basis points: 15000 = 150%)
    uint256 public constant MIN_COLLATERAL_RATIO = 15000; // 150% minimum
    uint256 public constant LIQUIDATION_RATIO = 13000;    // 130% triggers liquidation
    uint256 public constant LIQUIDATION_PENALTY = 1300;   // 13% penalty on liquidation
    uint256 public constant STABILITY_FEE = 2e16;         // 2% annual stability fee
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    // ETH/USD price oracle (set by owner; in production use Chainlink)
    uint256 public ethPriceUSD; // 18 decimals: 2000e18 = $2000 per ETH

    struct Vault {
        uint256 collateral;    // ETH deposited (wei)
        uint256 debt;          // USDX minted
        uint256 lastFeeUpdate; // Timestamp of last stability fee accrual
    }

    mapping(address => Vault) public vaults;

    event VaultOpened(address indexed owner, uint256 collateral, uint256 debt);
    event CollateralAdded(address indexed owner, uint256 amount);
    event CollateralWithdrawn(address indexed owner, uint256 amount);
    event DebtMinted(address indexed owner, uint256 amount);
    event DebtRepaid(address indexed owner, uint256 amount);
    event VaultLiquidated(
        address indexed liquidator,
        address indexed owner,
        uint256 collateralSeized,
        uint256 debtRepaid
    );
    event PriceUpdated(uint256 newPrice);

    constructor(address _stablecoin, uint256 _initialEthPrice) Ownable(msg.sender) {
        stablecoin = Stablecoin(_stablecoin);
        ethPriceUSD = _initialEthPrice;
    }

    // ─── Oracle ──────────────────────────────────────────────────────────────

    /**
     * @dev Update ETH/USD price. In production, replace with a Chainlink oracle.
     */
    function setEthPrice(uint256 _priceUSD) external onlyOwner {
        require(_priceUSD > 0, "Price must be > 0");
        ethPriceUSD = _priceUSD;
        emit PriceUpdated(_priceUSD);
    }

    // ─── Vault Operations ────────────────────────────────────────────────────

    /**
     * @dev Deposit ETH collateral into the caller's vault.
     */
    function depositCollateral() external payable nonReentrant {
        require(msg.value > 0, "Must deposit ETH");
        _accrueStabilityFee(msg.sender);
        vaults[msg.sender].collateral += msg.value;
        if (vaults[msg.sender].lastFeeUpdate == 0) {
            vaults[msg.sender].lastFeeUpdate = block.timestamp;
        }
        emit CollateralAdded(msg.sender, msg.value);
    }

    /**
     * @dev Withdraw ETH collateral from vault (vault must remain healthy).
     */
    function withdrawCollateral(uint256 amount) external nonReentrant {
        _accrueStabilityFee(msg.sender);
        require(vaults[msg.sender].collateral >= amount, "Insufficient collateral");
        vaults[msg.sender].collateral -= amount;
        require(_isHealthy(msg.sender), "Would breach collateral ratio");
        payable(msg.sender).transfer(amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    /**
     * @dev Mint USDX stablecoin against deposited collateral.
     * @param amount Amount of USDX to mint (18 decimals)
     */
    function mintDebt(uint256 amount) external nonReentrant {
        _accrueStabilityFee(msg.sender);
        require(amount > 0, "Amount must be > 0");
        vaults[msg.sender].debt += amount;
        require(_isHealthy(msg.sender), "Would breach collateral ratio");
        stablecoin.mint(msg.sender, amount);
        emit DebtMinted(msg.sender, amount);
    }

    /**
     * @dev Repay minted USDX to reduce vault debt.
     */
    function repayDebt(uint256 amount) external nonReentrant {
        _accrueStabilityFee(msg.sender);
        require(amount <= vaults[msg.sender].debt, "Exceeds debt");
        stablecoin.burnFrom(msg.sender, amount);
        vaults[msg.sender].debt -= amount;
        emit DebtRepaid(msg.sender, amount);
    }

    // ─── Liquidation ─────────────────────────────────────────────────────────

    /**
     * @dev Liquidate an under-collateralized vault. The liquidator repays
     *      the debt and receives the collateral plus a penalty bonus.
     */
    function liquidate(address vaultOwner) external nonReentrant {
        _accrueStabilityFee(vaultOwner);
        require(!_isHealthy(vaultOwner), "Vault is healthy");

        Vault memory v = vaults[vaultOwner];
        require(v.debt > 0, "No debt to liquidate");

        // Collateral to seize: debt value in ETH + penalty
        uint256 debtInEth = (v.debt * 1e18) / ethPriceUSD;
        uint256 penalty = (debtInEth * LIQUIDATION_PENALTY) / 10000;
        uint256 seized = debtInEth + penalty;
        if (seized > v.collateral) seized = v.collateral;

        // Liquidator repays the debt
        stablecoin.burnFrom(msg.sender, v.debt);

        delete vaults[vaultOwner];

        payable(msg.sender).transfer(seized);

        emit VaultLiquidated(msg.sender, vaultOwner, seized, v.debt);
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    function getCollateralRatio(address vaultOwner) public view returns (uint256) {
        Vault memory v = vaults[vaultOwner];
        if (v.debt == 0) return type(uint256).max;
        uint256 collateralValue = (v.collateral * ethPriceUSD) / 1e18;
        return (collateralValue * 10000) / v.debt;
    }

    function getMaxMintable(address vaultOwner) external view returns (uint256) {
        Vault memory v = vaults[vaultOwner];
        uint256 collateralValue = (v.collateral * ethPriceUSD) / 1e18;
        uint256 maxDebt = (collateralValue * 10000) / MIN_COLLATERAL_RATIO;
        return maxDebt > v.debt ? maxDebt - v.debt : 0;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _isHealthy(address user) internal view returns (bool) {
        return getCollateralRatio(user) >= LIQUIDATION_RATIO;
    }

    function _accrueStabilityFee(address user) internal {
        Vault storage v = vaults[user];
        if (v.debt == 0 || v.lastFeeUpdate == 0) {
            v.lastFeeUpdate = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - v.lastFeeUpdate;
        uint256 fee = (v.debt * STABILITY_FEE * elapsed) / (1e18 * SECONDS_PER_YEAR);
        v.debt += fee;
        v.lastFeeUpdate = block.timestamp;
    }
}
