// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// SimpleVault — intentionally buggy.
/// withdraw() does not enforce that the user cannot withdraw more than
/// was deposited across the whole contract. The SMTChecker should find
/// a counterexample when we assert(withdrawn + amount <= deposited).
contract SimpleVault {
    uint256 public deposited;
    uint256 public withdrawn;

    function deposit(uint256 amount) external {
        deposited += amount;
    }

    function withdraw(uint256 amount) external {
        // BUG: no check — allows withdrawn > deposited
        withdrawn += amount;
    }
}
