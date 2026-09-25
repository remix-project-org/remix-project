// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GovernanceToken
 * @dev An ERC-20 token with on-chain voting power (via ERC20Votes).
 * Holders must self-delegate or delegate to another address to activate voting.
 */
contract GovernanceToken is ERC20Permit, ERC20Votes, Ownable {
    constructor()
        ERC20("Governance Token", "GOV")
        ERC20Permit("Governance Token")
        Ownable(msg.sender)
    {
        // Mint initial supply to deployer
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    // Required overrides for ERC20Votes
    function _update(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, amount);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
