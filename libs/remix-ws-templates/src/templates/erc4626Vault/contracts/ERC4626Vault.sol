// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC4626Vault
 * @dev A tokenized yield-bearing vault following the ERC-4626 standard.
 *
 * Users deposit an underlying ERC-20 asset and receive vault shares in return.
 * The vault owner can accrue yield by transferring additional assets into the
 * vault, which increases the exchange rate of shares to assets.
 *
 * ERC-4626 is the standard interface for yield-bearing vaults used in DeFi.
 * Examples: Yearn vaults, Aave aTokens, Compound cTokens (EIP-4626 wrappers).
 */
contract ERC4626Vault is ERC4626, Ownable {
    // Total yield accrued (for accounting purposes)
    uint256 public totalYieldAccrued;

    event YieldDeposited(address indexed source, uint256 amount);

    constructor(
        IERC20 _asset,
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) ERC4626(_asset) Ownable(msg.sender) {}

    /**
     * @dev Owner can inject yield into the vault. This increases the share price
     *      since total assets grow while share supply stays the same.
     */
    function depositYield(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be > 0");
        // Transfer yield tokens from owner into the vault
        IERC20(asset()).transferFrom(msg.sender, address(this), amount);
        totalYieldAccrued += amount;
        emit YieldDeposited(msg.sender, amount);
    }

    /**
     * @dev Returns the current exchange rate: how many assets each share is worth.
     */
    function sharePrice() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 10 ** decimals();
        return (totalAssets() * 10 ** decimals()) / supply;
    }
}
