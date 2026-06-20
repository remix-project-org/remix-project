// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";

/// @title WorldCupPredictionMarket
/// @notice Non official and study only 1X2 prediction market for FIFA World Cup matches, settled via Chainlink CRE.
/// @dev Stakes are held in native Sepolia ETH. One market per match enforced via matchHasMarket.
///      Settlement only allowed after settledAfter. CRE workflow writes results via onReport().
contract WorldCupPredictionMarket is ReceiverTemplate {
    // ========== EVENTS ==========

    event MarketCreated(
        uint256 indexed marketId,
        uint256 indexed externalMatchId,
        string team1,
        string team2,
        uint256 kickoff,
        uint256 settledAfter
    );
    event SettlementRequested(uint256 indexed marketId, uint256 indexed externalMatchId);
    event MarketSettled(uint256 indexed marketId, Outcome outcome);
    event TestModeUpdated(bool enabled);

    // ========== ENUMS ==========

    /// @notice Match outcome: Team1Win (home), Draw, Team2Win (away), or Cancelled.
    enum Outcome { None, Team1Win, Draw, Team2Win, Cancelled }

    enum Status { Open, SettlementRequested, Settled }

    // ========== ERRORS ==========

    error MatchAlreadyHasMarket(uint256 externalMatchId);
    error SettlementNotAllowedYet(uint256 nowTs, uint256 settledAfter);
    error StatusNotOpen(Status current);
    error SettlementNotRequested(Status current);
    error InvalidOutcome();
    error BettingClosed(uint256 nowTs, uint256 kickoff);
    error AlreadyPredicted();
    error AmountZero();
    error NotSettledYet(Status current);
    error AlreadyClaimed();
    error IncorrectPrediction();
    error NoWinners();
    error MarketCancelled();
    error TransferFailed();

    // ========== STRUCTS ==========

    struct Market {
        uint256 externalMatchId; // football-data.org match ID
        string team1;            // home team
        string team2;            // away team
        uint256 kickoff;         // match start unix ts — betting closes here
        uint256 settledAfter;    // match finish unix ts — settlement can be requested after this
        Status status;
        Outcome outcome;
        uint256[3] predTotals;   // [0]=Team1Win, [1]=Draw, [2]=Team2Win staked ETH (wei)
        uint256[3] predCounts;
    }

    struct Prediction {
        uint256 amount;  // ETH staked in wei
        Outcome pred;
        bool claimed;
    }

    // ========== STATE ==========

    uint256 public nextMarketId;

    /// @notice When true, the time checks in makePrediction (kickoff) and requestSettlement
    ///         (settledAfter) are bypassed, allowing bets and settlement on started/past
    ///         markets — as long as the market is still Open (not settlement-requested or
    ///         settled). For testing only. Owner-controlled.
    bool public testMode;

    mapping(uint256 => Market) public markets;
    /// @notice Enforces one market per external match ID.
    mapping(uint256 => uint256) public matchMarketId;
    mapping(uint256 => bool) public matchHasMarket;
    mapping(uint256 => mapping(address => Prediction)) public predictions;

    // ========== CONSTRUCTOR ==========

    constructor(address forwarderAddress)
        ReceiverTemplate(forwarderAddress)
    {
        testMode = true;
    }

    // ========== MARKET CREATION ==========

    /// @notice Create a market for a match. One market per match.
    /// @param externalMatchId football-data.org numeric match ID.
    /// @param team1 Home team name.
    /// @param team2 Away team name.
    /// @param kickoff Unix timestamp of match start. Betting closes at this time.
    /// @param settledAfter Unix timestamp the match should be finished. Settlement can be
    ///        requested after this. Set to kickoff + expected match duration (e.g. ~3 hours).
    function createMarket(
        uint256 externalMatchId,
        string calldata team1,
        string calldata team2,
        uint256 kickoff,
        uint256 settledAfter
    ) external onlyOwner returns (uint256 marketId) {
        if (matchHasMarket[externalMatchId]) revert MatchAlreadyHasMarket(externalMatchId);

        marketId = nextMarketId++;
        Market storage m = markets[marketId];
        m.externalMatchId = externalMatchId;
        m.team1 = team1;
        m.team2 = team2;
        m.kickoff = kickoff;
        m.settledAfter = settledAfter;
        m.status = Status.Open;

        matchMarketId[externalMatchId] = marketId;
        matchHasMarket[externalMatchId] = true;

        emit MarketCreated(marketId, externalMatchId, team1, team2, kickoff, settledAfter);
    }

    // ========== TEST MODE ==========

    /// @notice Toggle test mode. When enabled, makePrediction skips the settledAfter
    ///         time check, allowing bets on past (but still Open) markets. Testing only.
    function updateTestMode(bool enabled) external onlyOwner {
        testMode = enabled;
        emit TestModeUpdated(enabled);
    }

    // ========== BETTING ==========

    /// @notice Place a 1X2 prediction with native ETH. Allowed while the market is Open.
    /// @dev Normally betting closes at kickoff (match start). When testMode is true, that
    ///      time check is bypassed so bets can be placed on started/past markets still Open.
    function makePrediction(uint256 marketId, Outcome outcome) external payable {
        Market storage m = markets[marketId];
        if (!testMode && block.timestamp >= m.kickoff)
            revert BettingClosed(block.timestamp, m.kickoff);
        if (m.status != Status.Open) revert StatusNotOpen(m.status);
        if (predictions[marketId][msg.sender].pred != Outcome.None) revert AlreadyPredicted();
        if (outcome != Outcome.Team1Win && outcome != Outcome.Draw && outcome != Outcome.Team2Win)
            revert InvalidOutcome();
        if (msg.value == 0) revert AmountZero();

        predictions[marketId][msg.sender] = Prediction({
            amount: msg.value,
            pred: outcome,
            claimed: false
        });

        uint8 idx = uint8(outcome) - 1; // maps 1->0, 2->1, 3->2
        m.predTotals[idx] += msg.value;
        m.predCounts[idx]++;
    }

    // ========== SETTLEMENT REQUEST ==========

    /// @notice Emit SettlementRequested so the CRE workflow picks it up.
    ///         Only callable after settledAfter — ensures the match has ended.
    function requestSettlement(uint256 marketId) external {
        Market storage m = markets[marketId];
        if (!testMode && block.timestamp < m.settledAfter)
            revert SettlementNotAllowedYet(block.timestamp, m.settledAfter);
        if (m.status != Status.Open) revert StatusNotOpen(m.status);

        m.status = Status.SettlementRequested;
        emit SettlementRequested(marketId, m.externalMatchId);
    }

    // ========== CRE REPORT HANDLER ==========

    /// @notice Called by CRE forwarder after node consensus. Decodes and settles the market.
    /// @param report ABI-encoded (uint256 marketId, uint8 outcome).
    function _processReport(bytes calldata report) internal override {
        (uint256 marketId, uint8 outcome) = abi.decode(report, (uint256, uint8));
        _settle(marketId, Outcome(outcome));
    }

    function _settle(uint256 marketId, Outcome outcome) internal {
        Market storage m = markets[marketId];
        if (m.status != Status.SettlementRequested) revert SettlementNotRequested(m.status);
        m.outcome = outcome;
        m.status = Status.Settled;
        emit MarketSettled(marketId, outcome);
    }

    // ========== CLAIM WINNINGS ==========

    /// @notice Claim proportional share of the ETH pool. Only callable after settlement.
    function claimPrediction(uint256 marketId) external {
        Market storage m = markets[marketId];
        Prediction storage p = predictions[marketId][msg.sender];

        if (m.status != Status.Settled) revert NotSettledYet(m.status);
        if (m.outcome == Outcome.Cancelled) revert MarketCancelled();
        if (p.claimed) revert AlreadyClaimed();
        if (m.outcome != p.pred) revert IncorrectPrediction();

        uint8 outcomeIdx = uint8(m.outcome) - 1;
        uint256 totalPool = m.predTotals[0] + m.predTotals[1] + m.predTotals[2];
        uint256 winningTotal = m.predTotals[outcomeIdx];
        if (winningTotal == 0) revert NoWinners();

        uint256 payout = (p.amount * totalPool) / winningTotal;
        p.claimed = true;
        _sendEth(msg.sender, payout);
    }

    /// @notice Refund original ETH stake if match was Cancelled.
    function refundPrediction(uint256 marketId) external {
        Market storage m = markets[marketId];
        Prediction storage p = predictions[marketId][msg.sender];

        if (m.status != Status.Settled) revert NotSettledYet(m.status);
        if (m.outcome != Outcome.Cancelled) revert InvalidOutcome();
        if (p.claimed) revert AlreadyClaimed();
        if (p.amount == 0) revert AmountZero();

        uint256 refund = p.amount;
        p.claimed = true;
        _sendEth(msg.sender, refund);
    }

    function _sendEth(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ========== VIEWS ==========

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    function getPrediction(uint256 marketId, address user) external view returns (Prediction memory) {
        return predictions[marketId][user];
    }

    function getMarketByMatchId(uint256 externalMatchId)
        external
        view
        returns (uint256 marketId, Market memory market)
    {
        marketId = matchMarketId[externalMatchId];
        market = markets[marketId];
    }
}
