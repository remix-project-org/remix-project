// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// SimpleVault — fixed version.
/// withdraw() now requires amount <= (deposited - withdrawn), so the
/// invariant assert(withdrawn + amount <= deposited) always holds.
contract SimpleVault {
    uint256 public deposited;
    uint256 public withdrawn;

    function deposit(uint256 amount) external {
        deposited += amount;
    }

    function withdraw(uint256 amount) external {
        require(withdrawn + amount <= deposited, "insufficient funds");
        withdrawn += amount;
    }
}
