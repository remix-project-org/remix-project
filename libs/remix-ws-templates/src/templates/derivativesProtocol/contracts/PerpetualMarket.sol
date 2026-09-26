// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PerpetualMarket
 * @dev A simplified perpetual futures market with funding rates.
 *
 * Perpetuals are derivative contracts with no expiry date. Traders deposit
 * collateral and open leveraged long/short positions. A periodic funding rate
 * keeps the perpetual price anchored to the spot price:
 *   - If perp price > spot: longs pay shorts (funding rate > 0)
 *   - If perp price < spot: shorts pay longs (funding rate < 0)
 *
 * Key DeFi concepts demonstrated:
 * - Leveraged long/short positions with isolated margin
 * - Mark price vs. index price (oracle price)
 * - Funding rate mechanism for price anchoring
 * - Liquidation when margin ratio falls below maintenance margin
 *
 * Inspired by: dYdX, GMX, Perpetual Protocol, Drift Protocol
 */
contract PerpetualMarket is Ownable, ReentrancyGuard {
    IERC20 public immutable collateralToken; // e.g. USDC

    uint256 public constant MAINTENANCE_MARGIN_BPS = 500;  // 5%
    uint256 public constant LIQUIDATION_FEE_BPS = 100;     // 1% to liquidator
    uint256 public constant MAX_LEVERAGE = 10;              // 10x max leverage
    uint256 public constant FUNDING_PERIOD = 8 hours;
    uint256 public constant BPS = 10000;

    // Oracle price: set by owner (use Chainlink in production)
    uint256 public indexPrice;   // 18 decimals
    uint256 public markPrice;    // 18 decimals (virtual AMM price)

    uint256 public lastFundingTime;
    int256  public cumulativeFundingRate; // 18 decimals, signed

    // Open interest tracking
    uint256 public totalLongSize;
    uint256 public totalShortSize;

    enum Side { Long, Short }

    struct Position {
        Side side;
        uint256 size;          // Notional size in USD (18 decimals)
        uint256 collateral;    // Margin deposited (in collateral token, 18 decimals)
        uint256 entryPrice;    // Price at open (18 decimals)
        int256  fundingAccrued; // Cumulative funding at entry
    }

    mapping(address => Position) public positions;

    event PositionOpened(address indexed trader, Side side, uint256 size, uint256 collateral, uint256 price);
    event PositionClosed(address indexed trader, int256 pnl, uint256 collateral);
    event PositionLiquidated(address indexed liquidator, address indexed trader, uint256 collateralSeized);
    event FundingSettled(int256 fundingRate, uint256 timestamp);
    event IndexPriceUpdated(uint256 newPrice);

    constructor(address _collateralToken, uint256 _initialPrice) Ownable(msg.sender) {
        collateralToken = IERC20(_collateralToken);
        indexPrice = _initialPrice;
        markPrice = _initialPrice;
        lastFundingTime = block.timestamp;
    }

    // ─── Oracle ──────────────────────────────────────────────────────────────

    function setIndexPrice(uint256 _price) external onlyOwner {
        indexPrice = _price;
        emit IndexPriceUpdated(_price);
    }

    // ─── Funding Rate ─────────────────────────────────────────────────────────

    /**
     * @dev Settle funding payments. Must be called before any position change.
     * Funding rate = (markPrice - indexPrice) / indexPrice / fundingPeriodsPerDay
     * Longs pay shorts when mark > index; shorts pay longs when mark < index.
     */
    function settleFunding() public {
        uint256 elapsed = block.timestamp - lastFundingTime;
        if (elapsed < FUNDING_PERIOD) return;

        uint256 periods = elapsed / FUNDING_PERIOD;
        // Funding rate per period (can be negative)
        int256 priceDiff = int256(markPrice) - int256(indexPrice);
        int256 fundingRate = (priceDiff * int256(periods)) / int256(indexPrice);

        cumulativeFundingRate += fundingRate;
        lastFundingTime = block.timestamp;
        emit FundingSettled(fundingRate, block.timestamp);
    }

    // ─── Open Position ────────────────────────────────────────────────────────

    /**
     * @dev Open a leveraged long or short position.
     * @param side Long or Short
     * @param collateralAmount Margin to deposit (in collateral token units)
     * @param leverage Leverage multiplier (1–MAX_LEVERAGE)
     */
    function openPosition(Side side, uint256 collateralAmount, uint256 leverage)
        external
        nonReentrant
    {
        require(positions[msg.sender].size == 0, "Position already open");
        require(collateralAmount > 0, "No collateral");
        require(leverage >= 1 && leverage <= MAX_LEVERAGE, "Invalid leverage");

        settleFunding();

        collateralToken.transferFrom(msg.sender, address(this), collateralAmount);

        uint256 size = collateralAmount * leverage;

        if (side == Side.Long) {
            totalLongSize += size;
            // Buying pressure moves mark price up slightly
            markPrice = markPrice + (markPrice * size) / (totalLongSize * 100 + 1);
        } else {
            totalShortSize += size;
            // Selling pressure moves mark price down slightly
            markPrice = markPrice - (markPrice * size) / (totalShortSize * 100 + 1);
        }

        positions[msg.sender] = Position({
            side: side,
            size: size,
            collateral: collateralAmount,
            entryPrice: markPrice,
            fundingAccrued: cumulativeFundingRate
        });

        emit PositionOpened(msg.sender, side, size, collateralAmount, markPrice);
    }

    // ─── Close Position ───────────────────────────────────────────────────────

    /**
     * @dev Close an open position and settle PnL + funding.
     */
    function closePosition() external nonReentrant {
        Position memory pos = positions[msg.sender];
        require(pos.size > 0, "No open position");

        settleFunding();

        int256 pnl = _calculatePnl(pos);
        int256 fundingPayment = _calculateFunding(pos);
        int256 totalPnl = pnl - fundingPayment;

        if (pos.side == Side.Long) totalLongSize -= pos.size;
        else totalShortSize -= pos.size;

        delete positions[msg.sender];

        uint256 payout;
        if (totalPnl >= 0) {
            payout = pos.collateral + uint256(totalPnl);
        } else {
            uint256 loss = uint256(-totalPnl);
            payout = loss >= pos.collateral ? 0 : pos.collateral - loss;
        }

        if (payout > 0) {
            collateralToken.transfer(msg.sender, payout);
        }

        emit PositionClosed(msg.sender, totalPnl, payout);
    }

    // ─── Liquidation ─────────────────────────────────────────────────────────

    /**
     * @dev Liquidate an under-margined position.
     * A position is liquidatable when its margin ratio < MAINTENANCE_MARGIN_BPS.
     */
    function liquidate(address trader) external nonReentrant {
        Position memory pos = positions[trader];
        require(pos.size > 0, "No open position");

        settleFunding();

        require(!_isHealthy(pos), "Position is healthy");

        if (pos.side == Side.Long) totalLongSize -= pos.size;
        else totalShortSize -= pos.size;

        delete positions[trader];

        // Liquidator receives LIQUIDATION_FEE_BPS of remaining collateral
        uint256 liquidatorFee = (pos.collateral * LIQUIDATION_FEE_BPS) / BPS;
        if (liquidatorFee > 0) {
            collateralToken.transfer(msg.sender, liquidatorFee);
        }

        emit PositionLiquidated(msg.sender, trader, liquidatorFee);
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    function getMarginRatio(address trader) external view returns (uint256) {
        Position memory pos = positions[trader];
        if (pos.size == 0) return type(uint256).max;
        int256 pnl = _calculatePnl(pos);
        int256 equity = int256(pos.collateral) + pnl;
        if (equity <= 0) return 0;
        return (uint256(equity) * BPS) / pos.size;
    }

    function getUnrealizedPnl(address trader) external view returns (int256) {
        return _calculatePnl(positions[trader]);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _calculatePnl(Position memory pos) internal view returns (int256) {
        if (pos.size == 0) return 0;
        int256 priceDiff = int256(markPrice) - int256(pos.entryPrice);
        int256 rawPnl = (int256(pos.size) * priceDiff) / int256(pos.entryPrice);
        return pos.side == Side.Long ? rawPnl : -rawPnl;
    }

    function _calculateFunding(Position memory pos) internal view returns (int256) {
        int256 fundingDelta = cumulativeFundingRate - pos.fundingAccrued;
        int256 payment = (int256(pos.size) * fundingDelta) / 1e18;
        return pos.side == Side.Long ? payment : -payment;
    }

    function _isHealthy(Position memory pos) internal view returns (bool) {
        int256 pnl = _calculatePnl(pos);
        int256 equity = int256(pos.collateral) + pnl;
        if (equity <= 0) return false;
        return (uint256(equity) * BPS) / pos.size >= MAINTENANCE_MARGIN_BPS;
    }
}
