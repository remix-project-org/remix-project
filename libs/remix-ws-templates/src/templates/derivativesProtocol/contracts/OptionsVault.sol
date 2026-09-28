// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OptionsVault
 * @dev A simplified options protocol for cash-settled European call and put options.
 *
 * Options give buyers the right (but not obligation) to buy (call) or sell (put)
 * an underlying asset at a fixed strike price on a specific expiry date.
 *
 * This vault uses a covered approach:
 * - Writers lock collateral to back the options they sell
 * - At expiry, the option is cash-settled: payout = max(0, payoff) in USDC
 * - European style: can only be exercised at expiry, not before
 *
 * Key DeFi concepts demonstrated:
 * - Option writing (selling) with collateral locking
 * - Cash settlement using an oracle price at expiry
 * - Call payoff: max(0, spotPrice - strikePrice) * size
 * - Put payoff:  max(0, strikePrice - spotPrice) * size
 *
 * Inspired by: Opyn, Lyra Finance, Hegic, Dopex
 */
contract OptionsVault is Ownable, ReentrancyGuard {
    IERC20 public immutable usdc; // Collateral and settlement token

    enum OptionType { Call, Put }

    struct Option {
        address writer;       // Seller who locked collateral
        address buyer;        // Buyer who paid the premium
        OptionType optionType;
        uint256 strikePrice;  // USD price (18 decimals)
        uint256 expiry;       // Unix timestamp
        uint256 size;         // Notional in USD (18 decimals)
        uint256 premium;      // Premium paid by buyer (USDC, 18 decimals)
        uint256 collateral;   // Collateral locked by writer (USDC, 18 decimals)
        bool exercised;
        bool settled;
    }

    mapping(uint256 => Option) public options;
    uint256 public nextOptionId;

    // Settlement price set by oracle at or after expiry
    mapping(uint256 => uint256) public settlementPrices; // optionId => price

    event OptionWritten(uint256 indexed optionId, address indexed writer, OptionType optionType, uint256 strike, uint256 expiry, uint256 size, uint256 premium);
    event OptionBought(uint256 indexed optionId, address indexed buyer);
    event OptionSettled(uint256 indexed optionId, uint256 settlementPrice, uint256 payout);
    event CollateralReclaimed(uint256 indexed optionId, address indexed writer, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    // ─── Write (Sell) ─────────────────────────────────────────────────────────

    /**
     * @dev Writer creates an option by locking collateral.
     * For calls: collateral = size (covers the worst case if spot >> strike)
     * For puts:  collateral = strike * size / 1e18 (covers the worst case if spot = 0)
     *
     * @param optionType Call or Put
     * @param strikePrice Strike price in USD (18 decimals)
     * @param expiry Expiry timestamp (must be in the future)
     * @param size Notional size in USD (18 decimals)
     * @param premium Premium charged to the buyer (18 decimals)
     */
    function writeOption(
        OptionType optionType,
        uint256 strikePrice,
        uint256 expiry,
        uint256 size,
        uint256 premium
    ) external nonReentrant returns (uint256 optionId) {
        require(expiry > block.timestamp, "Expiry must be in the future");
        require(strikePrice > 0 && size > 0, "Invalid parameters");

        // Required collateral: full coverage for maximum loss
        uint256 collateral = optionType == OptionType.Call
            ? size                              // Call: full notional (worst case: spot = ∞)
            : (strikePrice * size) / 1e18;      // Put: strike × size (worst case: spot = 0)

        usdc.transferFrom(msg.sender, address(this), collateral);

        optionId = nextOptionId++;
        options[optionId] = Option({
            writer: msg.sender,
            buyer: address(0),
            optionType: optionType,
            strikePrice: strikePrice,
            expiry: expiry,
            size: size,
            premium: premium,
            collateral: collateral,
            exercised: false,
            settled: false
        });

        emit OptionWritten(optionId, msg.sender, optionType, strikePrice, expiry, size, premium);
    }

    // ─── Buy ──────────────────────────────────────────────────────────────────

    /**
     * @dev Buyer purchases an unowned option by paying the premium to the writer.
     */
    function buyOption(uint256 optionId) external nonReentrant {
        Option storage opt = options[optionId];
        require(opt.buyer == address(0), "Already sold");
        require(opt.expiry > block.timestamp, "Option expired");
        require(msg.sender != opt.writer, "Writer cannot buy own option");

        usdc.transferFrom(msg.sender, opt.writer, opt.premium);
        opt.buyer = msg.sender;

        emit OptionBought(optionId, msg.sender);
    }

    // ─── Settle ───────────────────────────────────────────────────────────────

    /**
     * @dev After expiry, anyone can trigger settlement. The owner provides the
     * settlement price (in production: use a Chainlink oracle or TWAP).
     * Payout (if ITM) goes to the buyer; remainder of collateral returns to writer.
     */
    function settle(uint256 optionId, uint256 settlementPrice) external nonReentrant {
        Option storage opt = options[optionId];
        require(!opt.settled, "Already settled");
        require(block.timestamp >= opt.expiry, "Not yet expired");
        require(msg.sender == owner() || msg.sender == opt.buyer, "Not authorized");

        opt.settled = true;
        settlementPrices[optionId] = settlementPrice;

        uint256 payout = _calculatePayout(opt, settlementPrice);

        if (payout > 0 && opt.buyer != address(0)) {
            uint256 actualPayout = payout > opt.collateral ? opt.collateral : payout;
            usdc.transfer(opt.buyer, actualPayout);
            // Remaining collateral back to writer
            if (opt.collateral > actualPayout) {
                usdc.transfer(opt.writer, opt.collateral - actualPayout);
            }
        } else {
            // OTM: full collateral back to writer
            usdc.transfer(opt.writer, opt.collateral);
        }

        emit OptionSettled(optionId, settlementPrice, payout);
    }

    // ─── Reclaim (if never sold) ──────────────────────────────────────────────

    /**
     * @dev Writer reclaims collateral if the option was never bought and has expired.
     */
    function reclaimCollateral(uint256 optionId) external nonReentrant {
        Option storage opt = options[optionId];
        require(msg.sender == opt.writer, "Not writer");
        require(opt.buyer == address(0), "Option was sold");
        require(block.timestamp >= opt.expiry, "Not yet expired");
        require(!opt.settled, "Already settled");

        opt.settled = true;
        usdc.transfer(opt.writer, opt.collateral);

        emit CollateralReclaimed(optionId, opt.writer, opt.collateral);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /**
     * @dev Returns the cash payout for an option at a given settlement price.
     * Call: max(0, settlementPrice - strikePrice) * size / 1e18
     * Put:  max(0, strikePrice - settlementPrice) * size / 1e18
     */
    function getPayoutAtPrice(uint256 optionId, uint256 price) external view returns (uint256) {
        return _calculatePayout(options[optionId], price);
    }

    function isInTheMoney(uint256 optionId, uint256 currentPrice) external view returns (bool) {
        Option memory opt = options[optionId];
        if (opt.optionType == OptionType.Call) return currentPrice > opt.strikePrice;
        return currentPrice < opt.strikePrice;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _calculatePayout(Option memory opt, uint256 settlementPrice) internal pure returns (uint256) {
        if (opt.optionType == OptionType.Call) {
            if (settlementPrice <= opt.strikePrice) return 0;
            return ((settlementPrice - opt.strikePrice) * opt.size) / 1e18;
        } else {
            if (settlementPrice >= opt.strikePrice) return 0;
            return ((opt.strikePrice - settlementPrice) * opt.size) / 1e18;
        }
    }
}
