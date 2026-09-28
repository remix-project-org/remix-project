// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ConstantProductAMM
 * @dev A simplified Uniswap V2-style constant-product automated market maker.
 *
 * Invariant: x * y = k  (where x and y are token reserves)
 *
 * Liquidity providers deposit token pairs and receive LP tokens representing
 * their share of the pool. Swappers pay a 0.3% fee on each trade, which
 * accrues to LPs.
 *
 * Key DeFi concepts demonstrated:
 * - Constant-product formula for price discovery
 * - LP token minting/burning for liquidity management
 * - Slippage and price impact
 * - Protocol fees
 */
contract ConstantProductAMM is ERC20, ReentrancyGuard {
    IERC20 public immutable token0;
    IERC20 public immutable token1;

    uint256 public reserve0;
    uint256 public reserve1;

    uint256 private constant FEE_NUMERATOR = 997;   // 0.3% fee (997/1000)
    uint256 private constant FEE_DENOMINATOR = 1000;
    uint256 private constant MINIMUM_LIQUIDITY = 1000;

    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1, uint256 lpTokens);
    event LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1, uint256 lpTokens);
    event Swap(address indexed user, address tokenIn, uint256 amountIn, uint256 amountOut);

    constructor(address _token0, address _token1) ERC20("AMM-LP", "LP") {
        require(_token0 != _token1, "Identical tokens");
        require(_token0 != address(0) && _token1 != address(0), "Zero address");
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
    }

    /**
     * @dev Add liquidity to the pool. Returns LP tokens representing pool share.
     * @param amount0 Amount of token0 to deposit
     * @param amount1 Amount of token1 to deposit
     */
    function addLiquidity(uint256 amount0, uint256 amount1)
        external
        nonReentrant
        returns (uint256 lpTokens)
    {
        require(amount0 > 0 && amount1 > 0, "Amounts must be > 0");

        token0.transferFrom(msg.sender, address(this), amount0);
        token1.transferFrom(msg.sender, address(this), amount1);

        uint256 supply = totalSupply();
        if (supply == 0) {
            // First liquidity: geometric mean, minus minimum liquidity locked forever
            lpTokens = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0xdead), MINIMUM_LIQUIDITY); // lock minimum liquidity
        } else {
            // Proportional to existing pool
            uint256 lp0 = (amount0 * supply) / reserve0;
            uint256 lp1 = (amount1 * supply) / reserve1;
            lpTokens = lp0 < lp1 ? lp0 : lp1;
        }

        require(lpTokens > 0, "Insufficient liquidity minted");
        _mint(msg.sender, lpTokens);
        _updateReserves(reserve0 + amount0, reserve1 + amount1);

        emit LiquidityAdded(msg.sender, amount0, amount1, lpTokens);
    }

    /**
     * @dev Burn LP tokens and receive proportional token amounts.
     */
    function removeLiquidity(uint256 lpTokens)
        external
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        require(lpTokens > 0, "LP amount must be > 0");
        uint256 supply = totalSupply();

        amount0 = (lpTokens * reserve0) / supply;
        amount1 = (lpTokens * reserve1) / supply;

        require(amount0 > 0 && amount1 > 0, "Insufficient liquidity burned");

        _burn(msg.sender, lpTokens);
        _updateReserves(reserve0 - amount0, reserve1 - amount1);

        token0.transfer(msg.sender, amount0);
        token1.transfer(msg.sender, amount1);

        emit LiquidityRemoved(msg.sender, amount0, amount1, lpTokens);
    }

    /**
     * @dev Swap an exact amount of one token for the other.
     * @param tokenIn The token being sold
     * @param amountIn The amount of tokenIn to sell
     * @param minAmountOut Minimum output accepted (slippage protection)
     */
    function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        require(tokenIn == address(token0) || tokenIn == address(token1), "Invalid token");
        require(amountIn > 0, "Amount must be > 0");

        bool isToken0 = tokenIn == address(token0);
        (IERC20 tIn, IERC20 tOut, uint256 rIn, uint256 rOut) = isToken0
            ? (token0, token1, reserve0, reserve1)
            : (token1, token0, reserve1, reserve0);

        tIn.transferFrom(msg.sender, address(this), amountIn);

        // Apply 0.3% fee: amountInWithFee = amountIn * 997 / 1000
        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        // x*y=k → amountOut = (amountInWithFee * rOut) / (rIn * 1000 + amountInWithFee)
        amountOut = (amountInWithFee * rOut) / (rIn * FEE_DENOMINATOR + amountInWithFee);

        require(amountOut >= minAmountOut, "Slippage: insufficient output");
        require(amountOut < rOut, "Insufficient liquidity");

        tOut.transfer(msg.sender, amountOut);

        if (isToken0) {
            _updateReserves(reserve0 + amountIn, reserve1 - amountOut);
        } else {
            _updateReserves(reserve0 - amountOut, reserve1 + amountIn);
        }

        emit Swap(msg.sender, tokenIn, amountIn, amountOut);
    }

    /**
     * @dev Get the output amount for a given input (for UI price quoting).
     */
    function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256) {
        require(tokenIn == address(token0) || tokenIn == address(token1), "Invalid token");
        (uint256 rIn, uint256 rOut) = tokenIn == address(token0)
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
        uint256 amountInWithFee = amountIn * FEE_NUMERATOR;
        return (amountInWithFee * rOut) / (rIn * FEE_DENOMINATOR + amountInWithFee);
    }

    function _updateReserves(uint256 _reserve0, uint256 _reserve1) private {
        reserve0 = _reserve0;
        reserve1 = _reserve1;
    }

    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
