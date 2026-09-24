// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title DAOTimelock
 * @dev A timelock controller that enforces a mandatory delay between
 *      proposal queuing and execution. Provides an important security buffer:
 *      if a malicious proposal passes, users have time to exit before it executes.
 *
 * The Governor contract is the sole PROPOSER. The EXECUTOR role can be open
 * (address(0)) so anyone can trigger execution after the delay. The deployer
 * should renounce DEFAULT_ADMIN_ROLE after setup for full decentralization.
 */
contract DAOTimelock is TimelockController {
    /**
     * @param minDelay Minimum seconds before a queued proposal can execute (e.g. 2 days)
     * @param proposers Addresses that can queue proposals (should be Governor)
     * @param executors Addresses that can execute (use address(0) for open execution)
     * @param admin Initial admin (deployer); should be renounced after setup
     */
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
