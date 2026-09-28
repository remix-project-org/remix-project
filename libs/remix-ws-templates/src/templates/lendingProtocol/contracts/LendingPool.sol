// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LendingPool
 * @dev A simplified Compound/Aave-style lending and borrowing pool.
 *
 * Lenders deposit assets to earn interest. Borrowers provide collateral and
 * borrow against it. Interest accrues continuously using a linear rate model.
 *
 * Key DeFi concepts demonstrated:
 * - Supply/borrow with interest accrual
 * - Collateralization ratio and liquidation
 * - Exchange rate (cToken-style) for lenders
 * - Utilization-based interest rates
 *
 * NOTE: This is a single-asset pool for clarity. Production pools (Aave V3,
 * Compound V3) support multiple assets and more sophisticated risk management.
 */
contract LendingPool is ERC20, Ownable, ReentrancyGuard {
    IERC20 public immutable asset;

    // Interest rate model parameters
    uint256 public constant BASE_RATE = 2e16;          // 2% base APR
    uint256 public constant SLOPE = 20e16;              // 20% slope at 100% utilization
    uint256 public constant LIQUIDATION_THRESHOLD = 75; // 75% LTV before liquidation
    uint256 public constant LIQUIDATION_BONUS = 10;     // 10% bonus for liquidators
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    uint256 public totalBorrows;
    uint256 public totalReserves;
    uint256 public borrowIndex;       // Cumulative borrow interest index
    uint256 public lastAccrualTime;

    struct BorrowSnapshot {
        uint256 principal;    // Amount borrowed at last interaction
        uint256 interestIndex; // Borrow index at last interaction
    }

    mapping(address => uint256) public collateral; // Collateral deposited (in asset terms)
    mapping(address => BorrowSnapshot) public borrows;

    event Supplied(address indexed user, uint256 assets, uint256 shares);
    event Withdrawn(address indexed user, uint256 assets, uint256 shares);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event Liquidated(address indexed liquidator, address indexed borrower, uint256 repaid, uint256 seized);

    constructor(address _asset)
        ERC20("Lending Pool Share", "lpSHARE")
        Ownable(msg.sender)
    {
        asset = IERC20(_asset);
        borrowIndex = 1e18;
        lastAccrualTime = block.timestamp;
    }

    // ─── Interest Accrual ────────────────────────────────────────────────────

    /**
     * @dev Accrues interest since last call. Must be called before any state-
     *      changing operation to keep accounting correct.
     */
    function accrueInterest() public {
        uint256 elapsed = block.timestamp - lastAccrualTime;
        if (elapsed == 0) return;

        uint256 rate = borrowRatePerSecond();
        uint256 interestFactor = rate * elapsed;
        uint256 interestAccumulated = (totalBorrows * interestFactor) / 1e18;

        totalBorrows += interestAccumulated;
        // 10% of interest goes to protocol reserves
        totalReserves += interestAccumulated / 10;

        // Update cumulative index for per-user interest tracking
        borrowIndex = borrowIndex + (borrowIndex * interestFactor) / 1e18;
        lastAccrualTime = block.timestamp;
    }

    // ─── Supply / Withdraw ───────────────────────────────────────────────────

    /**
     * @dev Deposit assets and receive pool shares (like cTokens in Compound).
     */
    function supply(uint256 amount) external nonReentrant {
        accrueInterest();
        require(amount > 0, "Amount must be > 0");

        uint256 shares = _toShares(amount);
        asset.transferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, shares);

        emit Supplied(msg.sender, amount, shares);
    }

    /**
     * @dev Burn pool shares and receive underlying assets plus accrued interest.
     */
    function withdraw(uint256 shares) external nonReentrant {
        accrueInterest();
        require(shares > 0 && shares <= balanceOf(msg.sender), "Invalid shares");

        uint256 amount = _toAssets(shares);
        require(amount <= _availableLiquidity(), "Insufficient liquidity");

        _burn(msg.sender, shares);
        asset.transfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, shares);
    }

    // ─── Collateral ──────────────────────────────────────────────────────────

    function depositCollateral(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        asset.transferFrom(msg.sender, address(this), amount);
        collateral[msg.sender] += amount;
        emit CollateralDeposited(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external nonReentrant {
        accrueInterest();
        require(amount <= collateral[msg.sender], "Insufficient collateral");
        collateral[msg.sender] -= amount;
        require(_isHealthy(msg.sender), "Would be under-collateralized");
        asset.transfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    // ─── Borrow / Repay ──────────────────────────────────────────────────────

    /**
     * @dev Borrow assets against deposited collateral.
     */
    function borrow(uint256 amount) external nonReentrant {
        accrueInterest();
        require(amount > 0, "Amount must be > 0");
        require(amount <= _availableLiquidity(), "Insufficient liquidity");

        _updateBorrowBalance(msg.sender);
        borrows[msg.sender].principal += amount;
        borrows[msg.sender].interestIndex = borrowIndex;
        totalBorrows += amount;

        require(_isHealthy(msg.sender), "Under-collateralized");

        asset.transfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    /**
     * @dev Repay borrowed assets. Pass type(uint256).max to repay full balance.
     */
    function repay(uint256 amount) external nonReentrant {
        accrueInterest();
        _updateBorrowBalance(msg.sender);

        uint256 owed = borrows[msg.sender].principal;
        if (amount > owed) amount = owed;

        asset.transferFrom(msg.sender, address(this), amount);
        borrows[msg.sender].principal -= amount;
        totalBorrows -= amount;

        emit Repaid(msg.sender, amount);
    }

    // ─── Liquidation ─────────────────────────────────────────────────────────

    /**
     * @dev Liquidate an under-collateralized borrower. The liquidator repays
     *      part of their debt and receives collateral + a bonus.
     */
    function liquidate(address borrower, uint256 repayAmount) external nonReentrant {
        accrueInterest();
        _updateBorrowBalance(borrower);

        require(!_isHealthy(borrower), "Borrower is healthy");
        require(repayAmount > 0, "Amount must be > 0");

        uint256 owed = borrows[borrower].principal;
        require(repayAmount <= owed, "Repay exceeds debt");

        // Seized collateral = repayAmount * (100 + bonus) / 100
        uint256 seized = (repayAmount * (100 + LIQUIDATION_BONUS)) / 100;
        require(seized <= collateral[borrower], "Insufficient collateral to seize");

        asset.transferFrom(msg.sender, address(this), repayAmount);
        borrows[borrower].principal -= repayAmount;
        totalBorrows -= repayAmount;
        collateral[borrower] -= seized;

        asset.transfer(msg.sender, seized);
        emit Liquidated(msg.sender, borrower, repayAmount, seized);
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    function borrowRatePerSecond() public view returns (uint256) {
        uint256 utilization = _utilization();
        return (BASE_RATE + (SLOPE * utilization) / 1e18) / SECONDS_PER_YEAR;
    }

    function getBorrowBalance(address user) external view returns (uint256) {
        if (borrows[user].interestIndex == 0) return 0;
        return (borrows[user].principal * borrowIndex) / borrows[user].interestIndex;
    }

    function getSupplyBalance(address user) external view returns (uint256) {
        return _toAssets(balanceOf(user));
    }

    function exchangeRate() public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e18;
        return ((_totalPoolAssets()) * 1e18) / supply;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _utilization() internal view returns (uint256) {
        uint256 poolAssets = _totalPoolAssets();
        if (poolAssets == 0) return 0;
        return (totalBorrows * 1e18) / poolAssets;
    }

    function _totalPoolAssets() internal view returns (uint256) {
        return asset.balanceOf(address(this)) - totalReserves + totalBorrows;
    }

    function _availableLiquidity() internal view returns (uint256) {
        return asset.balanceOf(address(this)) - totalReserves;
    }

    function _toShares(uint256 amount) internal view returns (uint256) {
        uint256 rate = exchangeRate();
        return (amount * 1e18) / rate;
    }

    function _toAssets(uint256 shares) internal view returns (uint256) {
        return (shares * exchangeRate()) / 1e18;
    }

    function _isHealthy(address user) internal view returns (bool) {
        uint256 debt = borrows[user].principal;
        if (debt == 0) return true;
        // Health: collateral * LIQUIDATION_THRESHOLD / 100 >= debt
        return (collateral[user] * LIQUIDATION_THRESHOLD) / 100 >= debt;
    }

    function _updateBorrowBalance(address user) internal {
        if (borrows[user].interestIndex == 0) return;
        borrows[user].principal =
            (borrows[user].principal * borrowIndex) / borrows[user].interestIndex;
        borrows[user].interestIndex = borrowIndex;
    }
}
