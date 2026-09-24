// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IConstantProductAMM {
    function token0() external view returns (IERC20);
    function token1() external view returns (IERC20);
    function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut);
    function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256);
    function addLiquidity(uint256 amount0, uint256 amount1) external returns (uint256 lpTokens);
    function removeLiquidity(uint256 lpTokens) external returns (uint256 amount0, uint256 amount1);
}

/**
 * @title Router
 * @dev Entry-point contract for interacting with ConstantProductAMM pools.
 *
 * The Router adds three capabilities the raw pool doesn't have:
 *
 * 1. **Deadline** — transactions that sit in the mempool too long revert,
 *    protecting users from stale price execution (sandwich / front-running).
 *
 * 2. **Multi-hop swaps** — swap A→B→C in a single transaction by chaining
 *    pools. The router holds no funds; tokens flow pool-to-pool via transferFrom.
 *
 * 3. **Liquidity helpers** — add/remove liquidity with deadline protection and
 *    a minimum LP token guarantee.
 *
 * This mirrors the role of the Uniswap V2 Router02 contract: users never call
 * pools directly — they call the router, which enforces safety invariants.
 */
contract Router {
    // ─── Errors ───────────────────────────────────────────────────────────────

    error Expired();
    error InsufficientOutput(uint256 got, uint256 min);
    error InsufficientLiquidity(uint256 got, uint256 min);
    error InvalidPath();

    modifier ensure(uint256 deadline) {
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    // ─── Single-Hop Swap ──────────────────────────────────────────────────────

    /**
     * @dev Swap an exact amount of tokenIn for as many tokenOut as possible,
     *      enforcing a minimum output (slippage guard) and a deadline.
     *
     * @param pool         The AMM pool to use
     * @param tokenIn      Token being sold
     * @param amountIn     Exact amount to sell
     * @param amountOutMin Minimum output; reverts if pool gives less
     * @param to           Recipient of the output tokens
     * @param deadline     Unix timestamp after which the tx reverts
     */
    function swapExactTokensForTokens(
        address pool,
        address tokenIn,
        uint256 amountIn,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountOut) {
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).approve(pool, amountIn);

        amountOut = IConstantProductAMM(pool).swap(tokenIn, amountIn, amountOutMin);

        // Determine which token came out and forward to recipient
        IConstantProductAMM amm = IConstantProductAMM(pool);
        address tokenOut = tokenIn == address(amm.token0())
            ? address(amm.token1())
            : address(amm.token0());

        IERC20(tokenOut).transfer(to, amountOut);

        if (amountOut < amountOutMin) revert InsufficientOutput(amountOut, amountOutMin);
    }

    // ─── Multi-Hop Swap ───────────────────────────────────────────────────────

    /**
     * @dev Swap through a sequence of pools in a single transaction.
     *      path = [tokenA, tokenB, tokenC]
     *      pools = [poolAB, poolBC]
     *
     * The router pulls tokenA from the sender, swaps A→B in poolAB, then B→C
     * in poolBC, and delivers tokenC to the recipient. Intermediate tokens
     * never leave the router.
     *
     * @param pools        Ordered list of AMM pools (length = path.length - 1)
     * @param path         Ordered list of token addresses
     * @param amountIn     Amount of path[0] to sell
     * @param amountOutMin Minimum amount of path[last] to receive
     * @param to           Recipient of output tokens
     * @param deadline     Expiry timestamp
     */
    function swapExactTokensForTokensMultiHop(
        address[] calldata pools,
        address[] calldata path,
        uint256 amountIn,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (path.length < 2) revert InvalidPath();
        if (pools.length != path.length - 1) revert InvalidPath();

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;

        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);

        for (uint256 i = 0; i < pools.length; i++) {
            IERC20(path[i]).approve(pools[i], amounts[i]);
            amounts[i + 1] = IConstantProductAMM(pools[i]).swap(path[i], amounts[i], 0);
        }

        uint256 finalAmount = amounts[path.length - 1];
        if (finalAmount < amountOutMin) revert InsufficientOutput(finalAmount, amountOutMin);

        IERC20(path[path.length - 1]).transfer(to, finalAmount);
    }

    // ─── Price Quote ──────────────────────────────────────────────────────────

    /**
     * @dev Compute the expected output for a multi-hop path without executing.
     *      Useful for UI price display and slippage calculation.
     */
    function getAmountsOut(
        address[] calldata pools,
        address[] calldata path,
        uint256 amountIn
    ) external view returns (uint256[] memory amounts) {
        if (path.length < 2 || pools.length != path.length - 1) revert InvalidPath();

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;

        for (uint256 i = 0; i < pools.length; i++) {
            amounts[i + 1] = IConstantProductAMM(pools[i]).getAmountOut(path[i], amounts[i]);
        }
    }

    // ─── Liquidity ────────────────────────────────────────────────────────────

    /**
     * @dev Add liquidity to a pool with a deadline and minimum LP token guarantee.
     */
    function addLiquidity(
        address pool,
        uint256 amount0,
        uint256 amount1,
        uint256 minLpTokens,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 lpTokens) {
        IConstantProductAMM amm = IConstantProductAMM(pool);

        IERC20(amm.token0()).transferFrom(msg.sender, address(this), amount0);
        IERC20(amm.token1()).transferFrom(msg.sender, address(this), amount1);
        IERC20(amm.token0()).approve(pool, amount0);
        IERC20(amm.token1()).approve(pool, amount1);

        lpTokens = amm.addLiquidity(amount0, amount1);
        if (lpTokens < minLpTokens) revert InsufficientLiquidity(lpTokens, minLpTokens);

        // Forward LP tokens to recipient
        IERC20(pool).transfer(to, lpTokens);
    }

    /**
     * @dev Remove liquidity with deadline protection.
     */
    function removeLiquidity(
        address pool,
        uint256 lpTokens,
        uint256 minAmount0,
        uint256 minAmount1,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amount0, uint256 amount1) {
        IERC20(pool).transferFrom(msg.sender, address(this), lpTokens);
        IERC20(pool).approve(pool, lpTokens);

        (amount0, amount1) = IConstantProductAMM(pool).removeLiquidity(lpTokens);

        if (amount0 < minAmount0) revert InsufficientOutput(amount0, minAmount0);
        if (amount1 < minAmount1) revert InsufficientOutput(amount1, minAmount1);

        IConstantProductAMM amm = IConstantProductAMM(pool);
        IERC20(amm.token0()).transfer(to, amount0);
        IERC20(amm.token1()).transfer(to, amount1);
    }
}
